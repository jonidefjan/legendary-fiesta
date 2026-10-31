// ═══════════════════════════════════════════
//  CHEFES (Lich e Senhor Demônio)
// ═══════════════════════════════════════════
// Um chefe sorteado por onda de chefe, com escolta de inimigos comuns.
// As habilidades rodam em updateBosses (tempo de jogo, em ms).
import { state } from "./state.js";
import { random } from "./random.js";
import { emit, log, sound } from "./events.js";
import { createEnemy, ENEMY_TYPES, waveScales } from "./waves.js";
import { applyDot, enemyAttack, ANIM_MS } from "./combat.js";

// Onda de chefe a cada 10 (10, 20, 30... no modo infinito)
export const BOSS_EVERY = 10;
export const MAX_SUMMONS = 6; // esqueletos invocados vivos ao mesmo tempo
export const ENRAGE_RATIO = 0.33;

const BOSS_HP_MULT = 12; // x a vida de um esqueleto comum da onda
const BOSS_DMG_MULT = 2;
const SUMMON_COUNT = 2;

export const BOSS_TYPES = {
  lich: {
    kind: "lich",
    name: "Lich",
    shape: "mage",
    size: 30,
    speed: 0.25,
    atkInterval: 2200,
    abilityInterval: 6000,
    xp: 150,
    fragments: 30,
    resist: { fire: -0.3, water: 0, ice: 0.5, lightning: 0, physical: 0, shadow: 0.5, holy: -0.3 },
  },
  demon: {
    kind: "demon",
    name: "Senhor Demônio",
    shape: "demonlord",
    size: 30,
    speed: 0.22,
    atkInterval: 2400,
    abilityInterval: 5000,
    xp: 180,
    fragments: 35,
    resist: { fire: 0.6, water: -0.3, ice: -0.3, lightning: 0, physical: 0.1 },
  },
};

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
  const hp = Math.round(minion.hp * scales.hp * BOSS_HP_MULT);
  return {
    ...base,
    resist: { ...base.resist },
    speed: base.speed * speedScale,
    isBoss: true,
    wave,
    arena: { width, height, mobile, maxX },
    hp,
    maxHp: hp,
    dmg: Math.round(minion.dmg * scales.dmg * BOSS_DMG_MULT),
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
  const kind = random() < 0.5 ? "lich" : "demon";
  const escort = 2 + Math.floor(random() * 3); // 2 a 4
  const enemies = [];
  for (let i = 0; i < escort; i++) {
    const typeIdx = Math.floor(
      random() * Math.min(ENEMY_TYPES.length, Math.ceil(wave / 2)),
    );
    // A escolta divide a fila com o chefe, que fica no fim dela
    enemies.push(createEnemy(typeIdx, wave, arena, i, escort + 1));
  }
  enemies.push(createBoss(kind, wave, arena));
  return enemies;
}

function markCast(boss, kind) {
  boss.castKind = kind;
  boss.castCount++;
  boss.attackAnim = ANIM_MS.enemyAttack;
}

// Lich: invoca 2 esqueletos ao lado (respeita o limite de invocados vivos)
function summon(boss, arena) {
  const alive = state.enemies.filter((e) => e.summoned && !e.dead).length;
  const count = Math.min(SUMMON_COUNT, MAX_SUMMONS - alive);
  markCast(boss, "summon");
  if (count <= 0) return;
  for (let i = 0; i < count; i++) {
    const minion = createEnemy(0, boss.wave, arena, 0);
    minion.name = "Esqueleto Invocado";
    minion.summoned = true;
    // Invocados também nascem dentro da tela (o chefe pode estar na borda)
    minion.x = Math.min(
      boss.x + (i === 0 ? -50 : 50) + (random() - 0.5) * 20,
      arena.maxX ?? Infinity,
    );
    minion.xp = Math.round(minion.xp / 2);
    minion.fragments = 1;
    state.enemies.push(minion);
  }
  emit("bossAbility", { kind: "summon", x: boss.x, y: boss.y, bossName: boss.name });
  sound("summon");
  log(`💀 ${boss.name} invoca ${count} esqueletos!`, "kill");
}

// Senhor Demônio: nova de fogo que fere o herói e o deixa queimando
function fireNova(boss) {
  const p = state.player;
  markCast(boss, "nova");
  emit("bossAbility", { kind: "nova", x: boss.x, y: boss.y, bossName: boss.name });
  sound("nova");
  log(`🔥 ${boss.name} lança uma Nova de Fogo!`, "dmg");
  // O próprio chefe ataca (com dano temporário), para o Parry e o reflexo da
  // barreira acertarem ele e não uma cópia
  const dmg = boss.dmg;
  boss.dmg = Math.round(dmg * 1.5);
  const outcome = enemyAttack(boss);
  boss.dmg = dmg;
  // Esquiva e bloqueio perfeito evitam a queimadura; barreira que absorve não
  if (outcome !== "dodged" && outcome !== "blocked" && state.running && p.hp > 0) {
    applyDot(p, "burning", Math.max(1, Math.round(boss.dmg * 0.25)), 3);
  }
}

function enrage(boss) {
  boss.enraged = true;
  boss.atkInterval = Math.round(boss.atkInterval * 0.6);
  boss.abilityInterval = Math.round(boss.abilityInterval * 0.75);
  boss.speed *= 1.3;
  markCast(boss, "enrage");
  emit("bossAbility", { kind: "enrage", x: boss.x, y: boss.y, bossName: boss.name });
  sound("enrage");
  log(`😡 ${boss.name} entra em fúria!`, "dmg");
}

// Habilidades dos chefes vivos (invocar, área de fogo...); dt em ms de jogo
export function updateBosses(dt) {
  for (const boss of state.enemies) {
    if (!boss.isBoss || boss.dead || boss.hp <= 0) continue;
    if (boss.kind === "demon" && !boss.enraged && boss.hp / boss.maxHp < ENRAGE_RATIO) {
      enrage(boss);
    }
    // Congelado: nem a recarga das habilidades avança
    if (boss.frozen > 0) continue;
    boss.abilityTimer += dt;
    if (boss.abilityTimer < boss.abilityInterval) continue;
    boss.abilityTimer = 0;
    if (boss.kind === "lich") {
      summon(boss, boss.arena);
    } else if (boss.kind === "demon" && state.running) {
      fireNova(boss);
    }
  }
}
