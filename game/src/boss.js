// ═══════════════════════════════════════════
//  CHEFES (Lich e Senhor Demônio)
// ═══════════════════════════════════════════
// Um chefe sorteado por onda de chefe, com escolta de inimigos comuns.
// As habilidades rodam em updateBosses (tempo de jogo, em ms).
import { state } from "./state.js";
import { random } from "./random.js";
import { emit, log, sound } from "./events.js";
import { createEnemy, createRanged, rangedCount, ENEMY_TYPES, waveScales, enemyName } from "./waves.js";
import { t } from "./i18n.js";
import { applyDot, enemyAttack, slowFactor, ANIM_MS } from "./combat.js";

// Onda de chefe a cada 10 (10, 20, 30... no modo infinito)
export const BOSS_EVERY = 10;
export const MAX_SUMMONS = 6; // esqueletos invocados vivos ao mesmo tempo
export const ENRAGE_RATIO = 0.33;

// Chefes reforçados (a partir da onda 20): mais vida e dano, duas fases e mecânicas novas.
// O chefe da onda 10 não muda.
export const REINFORCED_FROM = 20;
export const MAX_SUMMONS_REINFORCED = 10;
const REINFORCED_HP = 1.5;
const REINFORCED_DMG = 1.25;
const PHASE_RATIOS = [0.66, 0.33]; // vida (fração) em que cada fase dispara, uma vez cada
const PHASE_SUMMON = 4; // esqueletos que o Lich invoca a cada fase
const PHASE_ATK = 0.9; // Demônio: x o intervalo de ataque a cada fase
const PHASE_ABILITY = 0.85; // Demônio: x o intervalo de habilidade a cada fase
const ENRAGE_HOLD_MS = 700; // tempo sem fase depois da fúria (reforçados)
const GUARD_MS = 3000; // Cavaleiro de Ossos: duração da guarda
const GUARD_BY_PHASE = [0.6, 0.7, 0.8]; // redução de dano da guarda por fase já disparada (teto 0,8)

const BOSS_HP_MULT = 12; // x a vida de um esqueleto comum da onda
const BOSS_DMG_MULT = 2;
const SUMMON_COUNT = 2;

export const BOSS_TYPES = {
  lich: {
    kind: "lich",
    shape: "mage",
    size: 30,
    speed: 0.25,
    atkInterval: 2200,
    abilityInterval: 6000,
    xp: 150,
    fragments: 30,
  },
  demon: {
    kind: "demon",
    shape: "demonlord",
    size: 30,
    speed: 0.22,
    atkInterval: 2400,
    abilityInterval: 5000,
    xp: 180,
    fragments: 35,
  },
  // Só a partir da onda 20 (sempre reforçado): levanta a guarda e corta o dano que recebe
  bone_knight: {
    kind: "bone_knight",
    shape: "boneknight",
    size: 30,
    speed: 0.2,
    atkInterval: 2600,
    abilityInterval: 8000,
    xp: 200,
    fragments: 40,
  },
};

// Resistências do chefe, sorteadas ao nascer (não vão no save: a onda é refeita ao continuar).
// Cada elemento resiste 50% ou 80%; no máximo 1 fica imune (resist 1) e 1 é fraco (-0.5 =
// +50% de dano). O físico fica fora e sempre causa 100%.
export const BOSS_ELEMENTS = ["fire", "ice", "poison", "lightning", "holy", "shadow", "water"];
export const BOSS_RESISTS = [0.5, 0.8];
export const WEAK_RESIST = -0.5;

// O primeiro chefe da run (onda BOSS_EVERY) não tem imune; dos seguintes em diante, sempre 1
export function rollBossResist(wave = BOSS_EVERY * 2) {
  const resist = { physical: 0 };
  for (const el of BOSS_ELEMENTS) resist[el] = BOSS_RESISTS[random() < 0.5 ? 0 : 1];
  const pick = (list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const immune = wave > BOSS_EVERY ? pick(BOSS_ELEMENTS) : null;
  if (immune) resist[immune] = 1;
  const weak = pick(BOSS_ELEMENTS.filter((el) => el !== immune));
  resist[weak] = WEAK_RESIST;
  return { resist, immune, weak };
}

// Fogo do chefe no herói: stacks da nova (com a regra nova, 1 de dano por stack por
// segundo e perda de max(1, ⌊stacks ÷ 10⌋) por segundo): 4 + 1 a cada 5 ondas
export function novaBurnStacks(wave) {
  return 4 + Math.floor(wave / 5);
}

export function isReinforcedBoss(wave) {
  return wave >= REINFORCED_FROM;
}

export function isBossWave(wave) {
  return wave > 0 && wave % BOSS_EVERY === 0;
}

// Atrás da escolta, mas sempre perto da borda visível da arena
// Folga extra na borda: o chefe é maior que os esqueletos comuns
const BOSS_EDGE = 30;

function bossX(width, mobile, maxX = Infinity) {
  const start = width * 0.6 * (mobile ? 1.4 : 1);
  const x = Math.min(start + 3 * 90, Math.max(width - 50, start + 60));
  return Math.min(x, maxX - BOSS_EDGE);
}

function createBoss(kind, wave, { width, height, mobile = false, maxX = Infinity }) {
  const base = BOSS_TYPES[kind];
  const minion = ENEMY_TYPES[0];
  const scales = waveScales(wave, mobile);
  // No celular os inimigos andam mais devagar (createEnemy faz o mesmo)
  const speedScale = mobile ? 0.7 : 1;
  const reinforced = isReinforcedBoss(wave);
  const hp = Math.round(minion.hp * scales.hp * BOSS_HP_MULT * (reinforced ? REINFORCED_HP : 1));
  const { resist, immune, weak } = rollBossResist(wave);
  return {
    ...base,
    resist,
    immune, // elemento imune (ou null): só item que quebra a imunidade acerta
    weak, // elemento fraco (+50% de dano)
    speed: base.speed * speedScale,
    isBoss: true,
    wave,
    arena: { width, height, mobile, maxX },
    hp,
    maxHp: hp,
    dmg: Math.round(minion.dmg * scales.dmg * BOSS_DMG_MULT * (reinforced ? REINFORCED_DMG : 1)),
    reinforced,
    phasesDone: 0, // fases de vida já disparadas (0 a 2); "phase" abaixo é só a animação
    x: bossX(width, mobile, maxX),
    y: height * 0.55,
    phase: random() * Math.PI * 2,
    hurtTimer: 0,
    atkTimer: 0,
    abilityTimer: 0,
    castKind: "", // última habilidade (o renderer troca a animação)
    castCount: 0,
    enraged: false,
    dead: false,
    moving: true,
    dots: [],
    burning: 0,
  };
}

// Inimigos da onda de chefe (chefe sorteado + escolta), mesmo formato de createWave
export function createBossWave(wave, arena) {
  // Onda 10: só Lich e Demônio (sorteio de sempre); da 20 em diante, os três por igual
  const kind = isReinforcedBoss(wave)
    ? ["lich", "demon", "bone_knight"][Math.min(2, Math.floor(random() * 3))]
    : random() < 0.5
      ? "lich"
      : "demon";
  const escort = 2 + Math.floor(random() * 3); // 2 a 4
  // A partir da onda 20 a escolta inclui atiradores, que ocupam vagas dela (o chefe da
  // onda 10 não leva atirador)
  const ranged = wave >= 20 ? rangedCount(wave) : 0;
  const regular = Math.max(0, escort - ranged);
  const enemies = [];
  for (let i = 0; i < regular; i++) {
    const typeIdx = Math.floor(
      random() * Math.min(ENEMY_TYPES.length, Math.ceil(wave / 2)),
    );
    // A escolta divide a fila com o chefe, que fica no fim dela
    enemies.push(createEnemy(typeIdx, wave, arena, i, regular + 1));
  }
  for (let i = 0; i < ranged; i++) enemies.push(createRanged(wave, arena, i, ranged));
  enemies.push(createBoss(kind, wave, arena));
  return enemies;
}

function markCast(boss, kind) {
  boss.castKind = kind;
  boss.castCount++;
  boss.attackAnim = ANIM_MS.enemyAttack;
}

// Lich: invoca esqueletos ao lado (respeita o limite de invocados vivos)
function summon(boss, arena, wanted = SUMMON_COUNT) {
  const alive = state.enemies.filter((e) => e.summoned && !e.dead).length;
  const cap = boss.reinforced ? MAX_SUMMONS_REINFORCED : MAX_SUMMONS;
  const count = Math.min(wanted, cap - alive);
  markCast(boss, "summon");
  if (count <= 0) return;
  for (let i = 0; i < count; i++) {
    const minion = createEnemy(0, boss.wave, arena, 0);
    minion.summoned = true; // enemyName() mostra "Esqueleto Invocado" / "Summoned Skeleton"
    // Invocados também nascem dentro da tela (o chefe pode estar na borda)
    minion.x = Math.min(
      boss.x + (i % 2 === 0 ? -1 : 1) * (50 + 25 * Math.floor(i / 2)) + (random() - 0.5) * 20,
      arena.maxX ?? Infinity,
    );
    minion.xp = Math.round(minion.xp / 2);
    minion.fragments = 1;
    state.enemies.push(minion);
  }
  emit("bossAbility", { kind: "summon", x: boss.x, y: boss.y, bossName: enemyName(boss) });
  sound("summon");
  log(t("log.bossSummon", { boss: enemyName(boss), count }), "kill");
}

// Senhor Demônio: nova de fogo que fere o herói e o deixa queimando
function fireNova(boss) {
  const p = state.player;
  markCast(boss, "nova");
  emit("bossAbility", { kind: "nova", x: boss.x, y: boss.y, bossName: enemyName(boss) });
  sound("nova");
  log(t("log.bossNova", { boss: enemyName(boss) }), "dmg");
  // O próprio chefe ataca (com dano temporário), para o Parry e o reflexo da
  // barreira acertarem ele e não uma cópia
  // Manto de Cinzas N5: o herói é imune ao fogo dos chefes; a nova não causa dano nem queimadura
  if (p.fireImmune) return;
  const dmg = boss.dmg;
  boss.dmg = Math.round(dmg * 1.5);
  const outcome = enemyAttack(boss);
  boss.dmg = dmg;
  // Esquiva e bloqueio perfeito evitam a queimadura; barreira que absorve não
  if (outcome !== "dodged" && outcome !== "blocked" && state.running && p.hp > 0) {
    applyDot(p, "burning", 1, 0, true, { stacks: novaBurnStacks(boss.wave), sourceId: null });
  }
}

// Cavaleiro de Ossos: levanta a guarda (dano recebido x (1 - guardReduction) por GUARD_MS)
function raiseGuard(boss) {
  boss.guardMs = GUARD_MS;
  boss.guardReduction = GUARD_BY_PHASE[Math.min(GUARD_BY_PHASE.length - 1, boss.phasesDone)];
  markCast(boss, "guard");
  emit("bossAbility", { kind: "guard", x: boss.x, y: boss.y, bossName: enemyName(boss) });
  sound("block");
  log(t("log.bossGuard", { boss: enemyName(boss) }), "dmg");
}

function enrage(boss) {
  boss.enraged = true;
  boss.atkInterval = Math.round(boss.atkInterval * 0.6);
  boss.abilityInterval = Math.round(boss.abilityInterval * 0.75);
  boss.speed *= 1.3;
  // Reforçados: a próxima fase espera o Taunt da fúria tocar
  if (boss.reinforced) boss.phaseHoldMs = ENRAGE_HOLD_MS;
  markCast(boss, "enrage");
  emit("bossAbility", { kind: "enrage", x: boss.x, y: boss.y, bossName: enemyName(boss) });
  sound("enrage");
  log(t("log.bossEnrage", { boss: enemyName(boss) }), "dmg");
}

// Fase de vida do chefe reforçado (uma por atualização, na ordem; golpe que cruza as duas
// dispara a segunda no quadro seguinte)
function bossPhase(boss) {
  if (boss.phasesDone >= PHASE_RATIOS.length) return;
  if (boss.hp / boss.maxHp >= PHASE_RATIOS[boss.phasesDone]) return;
  boss.phasesDone++;
  boss.abilityTimer = 0; // a habilidade normal não cai no mesmo quadro da fase
  if (boss.kind === "lich") {
    // Daqui em diante os ataques básicos são projéteis (combat.js), mesmo andando
    boss.shootsBolts = true;
    boss.projectile = "orb";
    summon(boss, boss.arena, PHASE_SUMMON);
  } else if (boss.kind === "demon") {
    boss.atkInterval = Math.round(boss.atkInterval * PHASE_ATK);
    boss.abilityInterval = Math.round(boss.abilityInterval * PHASE_ABILITY);
    if (state.running) fireNova(boss);
  } else if (boss.kind === "bone_knight") {
    raiseGuard(boss); // já com a redução da fase nova
  }
}

// Habilidades dos chefes vivos (invocar, área de fogo...); dt em ms de jogo
export function updateBosses(dt) {
  for (const boss of state.enemies) {
    if (!boss.isBoss || boss.dead || boss.hp <= 0) continue;
    // Fúria: o Demônio sempre; o Lich só reforçado
    if ((boss.kind === "demon" || boss.reinforced) && !boss.enraged && boss.hp / boss.maxHp < ENRAGE_RATIO) {
      enrage(boss);
    }
    // A guarda e o brilho dela descem com o tempo de jogo, até congelado
    if (boss.guardMs > 0) boss.guardMs = Math.max(0, boss.guardMs - dt);
    if (boss.guardFx > 0) boss.guardFx = Math.max(0, boss.guardFx - dt);
    if (boss.phaseHoldMs > 0) boss.phaseHoldMs = Math.max(0, boss.phaseHoldMs - dt);
    // Congelado: nem a recarga das habilidades avança
    if (boss.frozen > 0) continue;
    if (boss.reinforced && !(boss.phaseHoldMs > 0)) bossPhase(boss);
    boss.abilityTimer += dt * slowFactor(boss); // frio também atrasa as habilidades
    if (boss.abilityTimer < boss.abilityInterval) continue;
    boss.abilityTimer = 0;
    if (boss.kind === "lich") {
      summon(boss, boss.arena);
    } else if (boss.kind === "demon" && state.running) {
      fireNova(boss);
    } else if (boss.kind === "bone_knight") {
      raiseGuard(boss);
    }
  }
}
