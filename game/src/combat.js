// ═══════════════════════════════════════════
//  COMBATE: dano, efeitos de itens, inimigos
// ═══════════════════════════════════════════
// Sem DOM: mensagens, sons e o destaque do item usado saem por events.js.
//
// Eventos visuais (para partículas, tremida de tela e animações), com { x, y }:
//   "hit"         golpe em inimigo: element, damage, source, resisted, weak
//   "attack"      ataque de arma: itemId, element, hits, targetX, targetY
//   "dotTick"     dano contínuo: type, damage, onPlayer
//   "itemUse"     item de uso ativado: effect (tipo do efeito)
//   "blocked"     ataque bloqueado pelo escudo
//   "playerHurt"  jogador tomou dano: damage
//   "revive"      jogador reviveu
//   "enemyDied"   inimigo morreu: size
//   "crit"        golpe crítico do herói: damage
//   "dodge"       herói esquivou de um ataque
//   "freeze"      inimigo congelado por 5 stacks de frio (enemy.frozen = ms restantes)
//   "explode"     explosão (Núcleo Explosivo, Pena de Fênix): kind "fire"
//   "spread"      queimadura (ou veneno, element "poison") passou de um inimigo morto a outros: from {x,y}, to [{x,y}]
//   "cloud"       nuvem de veneno do Cogumelo Pestilento: radius
// Stacks (fogo, veneno, frio): cada elemento tem resistência; ela reduz o dano e também os
// stacks aplicados (acumulador determinístico, sem sorteio). Imunidade bloqueia tudo.
// Sons: sound(nome, detalhe) -> "hit" + elemento, "use" + tipo do efeito, "dot" + tipo,
// além de "crit", "dodge", "freeze" e "explode".
import { state, PLAYER_BASE } from "./state.js";
import { random } from "./random.js";
import { emit, log, sound } from "./events.js";
import { spawnEffect, spawnNumber } from "./fx.js";
import { t, formatNumber } from "./i18n.js";
import { enemyName } from "./waves.js";
import {
  effectsOf,
  effectCount,
  ownedEffects,
  isActivatable,
  levelValue,
  itemLevel,
  findItem,
  applyPassives,
  addEvolutionKill,
  LEVEL_UP_EFFECTS,
} from "./items.js";
import { tryClick } from "./clicks.js";

// Armadura com retorno decrescente: 100 de armadura = 50% de redução, sem teto fixo
export function armorReduction(armor) {
  const a = Math.max(0, armor || 0);
  return a / (a + 100);
}

// Golpe crítico: a chance base está em PLAYER_BASE.critChance
export const CRIT_MULT = PLAYER_BASE.critMult;

// Duração (ms) das poses de animação; o renderer 3D (three/characters.js) usa o tempo restante
export const ANIM_MS = {
  playerAction: 320, // golpe ou uso de item (player.animTimer)
  enemyAttack: 320, // investida do inimigo (enemy.attackAnim)
  enemyDeath: 600, // queda do inimigo morto (enemy.deathAnim)
};

// Poses de ataque conhecidas (o renderer 3D escolhe a animação do modelo); as outras viram "slash"
const PLAYER_ATTACK_ANIMS = new Set([
  "slash",
  "fire_slash",
  "double_slash",
  "lightning",
]);

const DOTS = {
  burning: { icon: "🔥", color: "#ff8800" },
  poison: { icon: "☠️", color: "#88ff00" },
  bleeding: { icon: "💉", color: "#ff0000" },
  cold: { icon: "❄️", color: "#88ddff" },
};

// Elemento (e resistência) de cada efeito com stacks
const STACK_ELEMENT = { burning: "fire", poison: "poison", cold: "ice", bleeding: "physical" };

// Frio: cada stack deixa o inimigo 10% mais lento; no 5º ele congela e os stacks zeram
export const COLD_SLOW = 0.1;
export const COLD_FREEZE_STACKS = 5;
export const FREEZE_MS = 2000;
// Sem frio novo, o inimigo perde 1 stack a cada 2s
export const COLD_DECAY_MS = 2000;
// O frio só começa a sumir 3s depois da ÚLTIMA aplicação (vale para todo gelo)
export const COLD_GRACE_MS = 3000;

// A queimadura só começa a perder stacks 3s depois do ÚLTIMO stack recebido (de qualquer fonte)
export const BURN_GRACE_MS = 3000;

// Fogo: 1 de dano por stack por segundo; depois da espera, perde max(1, ⌊stacks ÷ 10⌋) stacks por segundo
export function burnDecay(stacks) {
  return Math.max(1, Math.floor(stacks / 10));
}

// Bônus de dano permanentes (melhoria Força, Anel, Pacto): valem para armas, DoT e explosão
function permanentDamage() {
  const p = state.player;
  return 1 + (p.damageBonus || 0) + (p.damageBoost || 0) + (p.pactBonus || 0);
}

function rolls(effect) {
  return random() < (effect.chance ?? 1);
}

// ═══════════════════════════════════════════
//  ELEMENTAL & DOT SYSTEM
// ═══════════════════════════════════════════
// Soma o dano ao item que o causou (tela final: arma favorita). Dano de reflexo não passa aqui.
function creditDamage(itemId, amount) {
  if (!itemId || amount <= 0) return;
  const by = (state.runStats.damageByItem ||= {});
  by[itemId] = (by[itemId] || 0) + amount;
  state.runStats.totalDamage += amount;
}

// Imunidade ao elemento: vem de target.immune (chefes) ou de resistência 100%
function isImmune(target, element) {
  return target.immune === element || (target.resist?.[element] || 0) >= 1;
}

// O item quebra a imunidade? `breaksImmunity: true` (ou o nível a partir do qual vale)
function breaksImmunity(itemId) {
  if (!itemId) return false;
  const item = state.items.find((i) => i.id === itemId) || findItem(itemId);
  if (!item) return false;
  const flag = item.breaksImmunity;
  if (flag === true) return true;
  if (typeof flag === "number") return itemLevel(item.id) >= flag;
  return effectsOf(item, "passive").some((e) => e.breaksImmunity === true);
}

// Resistência efetiva do alvo ao elemento: 1 = imune; item que quebra a imunidade a trata
// como 100% do dano (resistência 0). Fraqueza vem como valor negativo (-0.5 = +50%).
export function effectiveResist(target, element, itemId = null) {
  if (isImmune(target, element)) return breaksImmunity(itemId) ? 0 : 1;
  return target.resist?.[element] || 0;
}

// Quantos de `stacks` de `element` realmente entram, dada a resistência do alvo. Acumulador
// por elemento em vez de sorteio: com 80% de resistência entra 1 stack a cada 5. A fraqueza
// aumenta o dano, mas não os stacks.
export function landStacks(target, element, stacks, itemId = null) {
  const resist = effectiveResist(target, element, itemId);
  if (resist >= 1) return 0;
  const acc = (target.stackAcc ||= {});
  const total = (acc[element] || 0) + stacks * Math.min(1, 1 - resist);
  const landed = Math.floor(total + 1e-9);
  acc[element] = Math.max(0, total - landed);
  return landed;
}

// Multiplicador do dano que o inimigo recebe: Corrosão (veneno), congelado (Armadura
// Cristalina) e julgado (Tomo do Julgamento) somam bônus. O herói não passa por aqui.
export function damageTakenMult(target) {
  if (target === state.player) return 1;
  let mult = 1;
  for (const { item, effect } of ownedEffects("vulnerable")) {
    if (effect.type === "corrosion") {
      mult += Math.min(levelValue(item, effect, "max"), poisonStacks(target) * effect.bonus);
    } else if (effect.type === "frozenVuln" && target.frozen > 0) {
      mult += levelValue(item, effect, "bonus");
    }
  }
  if (target.judged) mult += target.judged.bonus;
  return mult;
}

// itemId: item do jogador que causou o dano (crédito); sem ele, só source "player" soma ao total
export function applyElementalDamage(target, baseDmg, element, source, crit = false, itemId = null) {
  if (!target.resist) target.resist = {};
  const resist = effectiveResist(target, element, itemId);
  const immune = resist >= 1;
  target.lastHitCrit = !!crit; // quem mata paga Moeda da Fortuna só se este golpe foi crítico
  if (immune) {
    // Só o aviso: sem número de dano, sem partículas e sem som de golpe
    spawnEffect("text", target.x, target.y - 60, { life: 30, text: t("float.immune"), color: "#888888" });
    return 0;
  }
  const finalDmg = Math.max(1, Math.round(baseDmg * (1 - resist) * damageTakenMult(target)));

  target.hp -= finalDmg;
  target.hurtTimer = 15;
  if (itemId) creditDamage(itemId, finalDmg);
  else if (source === "player") state.runStats.totalDamage += finalDmg;

  // Visual feedback based on resistance
  let color = crit ? "#ffdd44" : "#ff4444";
  if (resist > 0.3)
    color = "#888888"; // Resisted
  else if (resist < -0.1) color = "#ffaa22"; // Weak to element

  spawnNumber(
    target.x,
    target.y - 40,
    `-${finalDmg}`,
    color,
    crit ? 6 : resist < -0.1 ? 5 : 4,
  );

  // Show resistance feedback
  if (resist > 0.3) {
    spawnEffect("text", target.x, target.y - 60, {
      life: 30,
      text: t("float.resisted"),
      color: "#888888",
    });
  } else if (resist < -0.1) {
    spawnEffect("text", target.x, target.y - 60, {
      life: 30,
      text: t("float.weak"),
      color: "#ffaa22",
    });
  }

  emit("hit", {
    x: target.x,
    y: target.y,
    element,
    damage: finalDmg,
    source,
    resisted: resist > 0.3,
    weak: resist < -0.1,
    crit,
  });
  return finalDmg;
}

// damage: dano por stack. Cada tick causa base + damage × stacks.
// maxStacks: teto de stacks (o veneno e a queimadura não têm).
// Queimadura: sem duração e sem teto; `stacks` são os que entram de uma vez (a resistência
// já foi aplicada por quem chama, via landStacks).
export const DEFAULT_MAX_STACKS = 5;

export function applyDot(
  target,
  type,
  damage,
  duration,
  stackable = true,
  { maxStacks = DEFAULT_MAX_STACKS, base = 0, sourceId = null, stacks = 1, rawBase = null } = {},
) {
  if (!target.dots) target.dots = [];
  if (type === "burning") maxStacks = Infinity;

  // Stack or refresh
  const existing = target.dots.find((d) => d.type === type);
  if (existing && stackable) {
    existing.stacks = Math.min(maxStacks, existing.stacks + stacks);
    existing.duration = duration;
    existing.fullDuration = duration;
    existing.damage = damage;
    if (type === "burning") existing.idle = 0; // stack novo reinicia a espera de 3s
    // Veneno de várias fontes: vale o maior dano base (um item fraco não derruba o forte)
    existing.base = type === "poison" ? Math.max(existing.base || 0, base) : base;
    // rawBase: o base sem o bônus permanente de dano (quem repassa veneno usa este, sem multiplicar de novo)
    existing.rawBase =
      type === "poison" ? Math.max(existing.rawBase ?? existing.base ?? 0, rawBase ?? base) : (rawBase ?? base);
    existing.maxStacks = maxStacks;
    if (sourceId) existing.sourceId = sourceId; // o último a empilhar leva o crédito
  } else if (existing) {
    existing.duration = duration;
    existing.fullDuration = duration;
  } else {
    target.dots.push({
      type,
      damage,
      base,
      rawBase: rawBase ?? base,
      duration,
      fullDuration: duration,
      maxStacks,
      stacks: Math.min(maxStacks, stacks),
      tickTimer: 0,
      idle: 0, // queimadura: tempo sem stacks novos
      sourceId, // item que aplicou: os ticks creditam o dano a ele
    });
  }

  // Visual feedback
  spawnEffect("text", target.x, target.y - 50, {
    life: 40,
    text: DOTS[type]?.icon || "✨",
    color: type === "burning" ? "#ff6600" : "#88ff00",
  });
}

// Stacks de frio no inimigo: lentidão de 10% por stack; no 5º ele congela e zera.
// Congelado não acumula mais frio. A resistência a gelo reduz os stacks.
// quiet: quem aplica em área avisa o congelamento uma vez só (evento, som e log)
export function applyCold(target, stacks = 1, { itemId = null, freezeMs = FREEZE_MS, quiet = false } = {}) {
  if (target.dead || target.hp <= 0 || target.frozen > 0) return 0;

  const landed = landStacks(target, "ice", stacks, itemId);
  if (landed <= 0) return 0;
  if (!target.dots) target.dots = [];
  let cold = target.dots.find((d) => d.type === "cold");
  if (!cold) {
    cold = { type: "cold", damage: 0, base: 0, duration: 0, stacks: 0, tickTimer: 0, idle: 0, sourceId: itemId };
    target.dots.push(cold);
  }
  cold.stacks += landed;
  cold.tickTimer = 0; // frio novo reinicia a espera e o decaimento
  cold.idle = 0;
  cold.decaying = false;
  if (cold.stacks >= COLD_FREEZE_STACKS) {
    target.dots = target.dots.filter((d) => d !== cold);
    freezeEnemy(target, freezeMs, quiet);
  } else {
    spawnEffect("text", target.x, target.y - 50, { life: 30, text: DOTS.cold.icon, color: DOTS.cold.color });
  }
  return landed;
}

// Stacks de frio atuais (0 sem frio)
export function coldStacks(en) {
  return en.dots?.find((d) => d.type === "cold")?.stacks || 0;
}

// Fração da velocidade que sobra com o frio (1 = sem lentidão)
// Frasco de Óleo e Frasco de Peçonha (N3) também atrasam quem está queimando ou envenenado
export function slowFactor(en) {
  let factor = 1 - COLD_SLOW * coldStacks(en);
  if (state.items.length > 0) {
    for (const { item, effect } of slowEffects()) {
      if (effect.type === "slowDot" && en.dots?.some((d) => d.type === effect.dot && d.stacks > 0)) {
        factor *= 1 - levelValue(item, effect, "factor");
      }
    }
  }
  return Math.max(0.1, factor);
}

// Força do tom gelado (0..1) para o renderer: congelado = 1; o frio sobe até 0.6
export function coldTint(en) {
  if (en.frozen > 0) return 1;
  return Math.min(COLD_FREEZE_STACKS - 1, coldStacks(en)) * 0.15;
}

export function processDots(dt) {
  [...state.enemies, state.player].forEach((entity) => {
    if (!entity.dots || entity.dead || entity.hp <= 0) return;

    entity.dots = entity.dots.filter((dot) => {
      if (dot.type === "cold") {
        // Frio não causa dano: só desacelera. 3s depois da última aplicação perde 1 stack
        // e, daí em diante, 1 a cada 2s
        dot.idle = (dot.idle ?? 0) + dt;
        if (dot.idle >= COLD_GRACE_MS) {
          if (!dot.decaying) {
            dot.decaying = true;
            dot.tickTimer = 0;
            dot.stacks--;
          } else {
            dot.tickTimer += dt;
            if (dot.tickTimer >= COLD_DECAY_MS) {
              dot.tickTimer = 0;
              dot.stacks--;
            }
          }
        }
        return dot.stacks > 0;
      }
      dot.tickTimer += dt;
      if (dot.type === "burning") dot.idle = (dot.idle ?? 0) + dt;

      if (dot.tickTimer >= 1000) {
        dot.tickTimer = 0;
        // Fraqueza ao elemento aumenta o tick (a resistência já reduziu os stacks)
        const weak =
          entity === state.player
            ? 1
            : 1 - Math.min(0, effectiveResist(entity, STACK_ELEMENT[dot.type] || "physical", dot.sourceId));
        let dmg = Math.round(((dot.base || 0) + dotBaseBonus(entity, dot) + dot.damage * dot.stacks) * weak);
        // Couraça de Batalha corta o dano contínuo do herói; nos inimigos valem Corrosão etc.
        dmg =
          entity === state.player
            ? Math.max(1, Math.round(dmg * (1 - (entity.dotReduction || 0))))
            : Math.round(dmg * damageTakenMult(entity));
        // Praga Detonante: o tick que mataria o inimigo o faz explodir nos vizinhos
        if (dot.type === "poison" && entity !== state.player) detonatePoison(entity, dmg);
        entity.hp -= dmg;
        entity.hurtTimer = 8;
        entity.lastHitCrit = false; // abate por dano contínuo não conta como crítico
        if (entity !== state.player) {
          creditDamage(dot.sourceId, dmg);
          dotLifesteal(dmg);
        }
        spawnNumber(
          entity.x,
          entity.y - 30,
          `-${dmg}`,
          DOTS[dot.type]?.color || "#ff8800",
          0,
        );
        emit("dotTick", {
          x: entity.x,
          y: entity.y,
          type: dot.type,
          damage: dmg,
          onPlayer: entity === state.player,
        });
        sound("dot", dot.type);

        // Queimadura perde stacks a cada tick (menos no que morreu: o Coração de Brasa
        // lê os stacks no abate). Veneno nunca expira; só outros dots (sangue) têm duração
        if (dot.type === "burning") {
          // Só perde stacks depois de BURN_GRACE_MS sem receber novos
          if (entity.hp > 0 && (dot.idle ?? 0) >= BURN_GRACE_MS) dot.stacks -= burnLoss(dot, entity);
        } else if (dot.type !== "poison") {
          dot.duration--;
        }
      }

      // Quem morreu neste tick mantém o dot: o Coração de Brasa lê a queimadura no abate
      if (entity.hp <= 0) return true;
      if (dot.type === "poison") return true;
      return dot.type === "burning" ? dot.stacks > 0 : dot.duration > 0;
    });
  });
  // Queimadura do chefe também mata (ou aciona a Pena de Fênix)
  checkPlayerDeath();
}

// ═══════════════════════════════════════════
//  EFEITOS DOS ITENS (um handler por "type" do items.json)
// ═══════════════════════════════════════════

// Inimigos vivos (vida 0 ainda não foi marcado como morto, isso é no updateEnemies)
function livingEnemies() {
  return state.enemies.filter((e) => !e.dead && e.hp > 0);
}

// Vivos a até `radius` do ponto em x, sem o `except`. Todos andam na mesma linha do chão;
// o y não conta (arena redimensionada pode deixar um invocado em outro y).
function enemiesWithin(x, radius, except = null) {
  return livingEnemies().filter((e) => e !== except && Math.abs(e.x - x) <= radius);
}

// Pedra de Eco: ao repetir um item, dano, stacks, cura e duração valem esta fração
let echoScale = 1;

// Efeitos de lentidão em cache por quadro (slowFactor roda várias vezes por inimigo a cada quadro).
// Fora do loop principal (testes) não há cache.
let frameSlow = null;
let frameActive = false;
export function beginFrame() {
  frameActive = true;
  frameSlow = null;
}
function slowEffects() {
  if (!frameActive) return ownedEffects("slow");
  return (frameSlow ||= ownedEffects("slow"));
}
// Dentro de uma repetição do Eco: não conta carga do Cristal Vital nem contadores de golpe
let echoing = false;

// Efeitos elementais do Manto do Arcano (N3) somam +1 stack em QUALQUER fonte de stacks
function plusStacks(n) {
  return n + state.player.extraStacks;
}
function scaled(n) {
  return echoScale === 1 || n <= 0 ? n : Math.max(1, Math.round(n * echoScale));
}

// Raio extra por ponto de alcance do Manto do Arcano (respingos); nos saltos é +1 alvo
const REACH_RADIUS = 30;
// Vizinhos de um inimigo (labaredas, estilhaços): quem está até esta distância dele
const NEIGHBOR_RADIUS = 120;

// Os outros inimigos vivos, do mais perto do herói ao mais longe (a fila de ataque)
function othersByDistance(target) {
  const px = state.player.x;
  return livingEnemies()
    .filter((e) => e !== target)
    .sort((a, b) => Math.abs(a.x - px) - Math.abs(b.x - px));
}

function burnStacks(en) {
  return (en.dots || []).find((d) => d.type === "burning")?.stacks || 0;
}

function poisonStacks(en) {
  return (en.dots || []).find((d) => d.type === "poison")?.stacks || 0;
}

// Queimadura nos inimigos: stacks que entram (resistência já aplicada) com o crédito ao item
function addBurn(en, wanted, item) {
  const landed = landStacks(en, "fire", wanted, item.id);
  if (landed > 0) applyDot(en, "burning", permanentDamage(), 0, true, { stacks: landed, sourceId: item.id });
  return landed;
}

// Veneno: dano base 1 (o maior entre as fontes vale) e 1 por stack, sem limite de stacks.
// base: valor sem o bônus permanente (quem repassa o veneno passa dot.rawBase)
function addPoison(en, wanted, item, base = 1) {
  const landed = landStacks(en, "poison", wanted, item.id);
  if (landed > 0) {
    applyDot(en, "poison", permanentDamage(), 0, true, {
      maxStacks: Infinity,
      base: base * permanentDamage(),
      rawBase: base,
      sourceId: item.id,
      stacks: landed,
    });
  }
  return landed;
}

// Os `count` inimigos vivos mais perto de `from`, sem ele; quem é imune ao elemento não gasta vaga
function nearestLiving(from, count, element, itemId) {
  return livingEnemies()
    .filter((e) => e !== from && effectiveResist(e, element, itemId) < 1)
    .map((e) => ({ e, dist: Math.hypot(e.x - from.x, e.y - from.y) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, count)
    .map((o) => o.e);
}

// Linha de trás: quem ainda não chegou perto do herói (Besta Longa N5, Arco do Caçador Fantasma)
// É relativa à arena: atrás de uma fração da distância entre o herói e a borda direita visível
// (no celular a arena é estreita; 200 px fixos quase nunca deixariam alguém "atrás")
export const NEAR_RANGE = 200; // sem arena medida (testes): equivale a esta distância
export const REAR_FRACTION = 0.35;

// Distância do herói a partir da qual um inimigo está na linha de trás
export function rearDistance(playerX, rightX) {
  return Math.max(0, rightX - playerX) * REAR_FRACTION;
}

export function isRearAt(x, playerX, rightX) {
  return Math.abs(x - playerX) > rearDistance(playerX, rightX);
}

function isRear(en) {
  const p = state.player;
  return isRearAt(en.x, p.x, state.arenaRight ?? p.x + NEAR_RANGE / REAR_FRACTION);
}

// Veneno: dano base extra por tick (Frasco de Peçonha N5); só nos inimigos
function dotBaseBonus(entity, dot) {
  if (dot.type !== "poison" || entity === state.player) return 0;
  let sum = 0;
  for (const { item, effect } of ownedEffects("dotBase")) {
    if (effect.type === "poisonBase") sum += levelValue(item, effect, "amount");
  }
  return sum * permanentDamage();
}

// Perda de stacks de queimadura por tick. Frasco de Óleo N5 corta pela metade: a fração
// que sobra acumula no próprio dot (decayAcc) até virar um stack inteiro.
function burnLoss(dot, entity) {
  let loss = burnDecay(dot.stacks);
  if (entity !== state.player) {
    for (const { effect } of ownedEffects("burnDecay")) {
      if (effect.type === "halveBurnDecay") loss *= effect.factor;
    }
  }
  const acc = (dot.decayAcc || 0) + loss;
  const whole = Math.floor(acc + 1e-9);
  dot.decayAcc = acc - whole;
  return whole;
}

// Praga Detonante: se o próximo tick de veneno acaba com o inimigo, ele explode e causa esse
// dano de veneno nos vizinhos (tantos quanto o nível do item)
const POISON_TICK_EFFECTS = {
  detonate(effect, item, ctx) {
    const near = nearestLiving(ctx.entity, itemLevel(item.id) + state.player.reach, "poison", item.id);
    // Aproximação do veneno que ainda restava: o tick letal vezes 3
    const damage = Math.round(ctx.damage * (effect.multiplier ?? 1));
    for (const en of near) applyElementalDamage(en, damage, "poison", "player", false, item.id);
    if (near.length === 0) return;
    sound("explode");
    emit("explode", { x: ctx.entity.x, y: ctx.entity.y, kind: "poison" });
    log(t("log.detonate", { icon: item.icon, item: item.name, count: near.length, damage }), "item");
  },
};

function detonatePoison(entity, damage) {
  if (entity.detonated || damage < entity.hp) return;
  entity.detonated = true;
  for (const { item, effect } of ownedEffects("poisonTick")) {
    POISON_TICK_EFFECTS[effect.type]?.(effect, item, { entity, damage });
  }
}

// Dano que o inimigo causa ao herói, com os enfraquecimentos dos itens (Manto de Cinzas
// e Couro de Basilisco: -X% por stack do efeito no atacante, até o teto)
function enemyDamageMult(en) {
  let mult = 1;
  for (const { item, effect } of ownedEffects("enemyDamage")) {
    if (effect.type !== "weaken") continue;
    const stacks = en.dots?.find((d) => d.type === effect.dot)?.stacks || 0;
    mult -= Math.min(levelValue(item, effect, "max"), stacks * effect.perStack);
  }
  return Math.max(0, mult);
}

// Aplica os stacks de um efeito "dot" de golpe (veneno, queimadura) em `target`. O nível não
// aumenta o dano por stack (fixo por item): aumenta os stacks por golpe e o dano base.
// A resistência do alvo reduz os stacks que entram (imune: nenhum).
function applyDotEffect(effect, item, target) {
  if (!rolls(effect)) return;
  const perm = permanentDamage();
  const damage = effect.damage * perm;
  const base = levelValue(item, effect, "base", effect.base || 0) * perm;
  const maxStacks =
    effect.maxStacks == null ? Infinity : levelValue(item, effect, "maxStacks", effect.maxStacks);
  const wanted = scaled(
    Math.round(levelValue(item, effect, "stacks", effect.stacks ?? 1)) + state.player.extraStacks,
  );
  const stacks = landStacks(target, STACK_ELEMENT[effect.dot] || "physical", wanted, item.id);
  if (stacks <= 0) return;
  applyDot(target, effect.dot, damage, effect.duration, true, {
    maxStacks,
    base,
    rawBase: levelValue(item, effect, "base", effect.base || 0),
    sourceId: item.id,
    stacks,
  });
  const dot = DOTS[effect.dot];
  log(
    t("log.dot", {
      icon: dot?.icon || "✨",
      target: enemyName(target),
      verb: t(dot ? `dot.${effect.dot}` : "dot.generic"),
    }),
    "dmg",
  );
}

// Frio de um golpe: soma stacks; no 5º o alvo congela (ver applyCold)
function applyColdEffect(effect, item, target) {
  if (!rolls(effect)) return;
  const wanted = scaled(
    Math.round(levelValue(item, effect, "stacks", effect.stacks ?? 1)) + state.player.extraStacks,
  );
  const landed = applyCold(target, wanted, {
    itemId: item.id,
    freezeMs: levelValue(item, effect, "freezeMs", FREEZE_MS),
  });
  if (landed > 0) {
    log(t("log.cold", { icon: item.icon, item: item.name, target: enemyName(target), stacks: landed }), "item");
  }
}

// Labareda: dano de fogo de 1 por stack nos inimigos perto de `origin`
function flareAround(origin, stacks, item) {
  const near = enemiesWithin(origin.x, NEIGHBOR_RADIUS, origin);
  if (near.length === 0) return;
  const damage = Math.round(stacks * permanentDamage());
  for (const en of near) applyElementalDamage(en, damage, "fire", "player", false, item.id);
  spawnEffect("dragon_roar", origin.x, origin.y - 30, { life: 30 });
  log(t("log.flare", { icon: item.icon, item: item.name, count: near.length, damage }), "dmg");
}

// Fogo do herói (Escama Dracônica): stacks no inimigo e, a partir do nível do encantamento,
// no inimigo mais perto dele também
function igniteWith(item, effect, target, stacks) {
  const targets = [target];
  if (itemLevel(item.id) >= (effect.otherLevel ?? Infinity)) {
    const other = livingEnemies()
      .filter((e) => e !== target)
      .sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x))[0];
    if (other) targets.push(other);
  }
  let total = 0;
  for (const en of targets) {
    const landed = landStacks(en, "fire", plusStacks(stacks), item.id);
    if (landed <= 0) continue;
    total += landed;
    applyDot(en, "burning", permanentDamage(), 0, true, { stacks: landed, sourceId: item.id });
  }
  return total;
}

// trigger "hit": a cada golpe de arma. ctx = { target, damage, refund }
const HIT_EFFECTS = {
  dot(effect, item, ctx) {
    applyDotEffect(effect, item, ctx.target);
  },
  cooldownRefund(effect, item, ctx) {
    if (!rolls(effect)) return;
    ctx.refund += effect.ms;
    log(t("log.cooldownRefund", { icon: item.icon, item: item.name }), "item");
  },
  cold(effect, item, ctx) {
    applyColdEffect(effect, item, ctx.target);
  },
  // heal com onCrit só vale quando o golpe foi crítico
  heal(effect, item, ctx) {
    if (effect.onCrit && !ctx.crit) return;
    healPlayer(scaled(Math.round(levelValue(item, effect, "amount"))), item);
  },
  lifesteal(effect, item, ctx) {
    const over = healPlayer(Math.round(ctx.dealt * levelValue(item, effect, "ratio")), item);
    // Cura acima da vida máxima vira vida máxima (+1 por cura, até o teto da run)
    if (over > 0 && itemLevel(item.id) >= (effect.overhealLevel ?? Infinity)) {
      const p = state.player;
      const gained = Math.min(effect.overhealMax - (p.maxHpBonus || 0), 1);
      if (gained > 0) {
        p.maxHpBonus = (p.maxHpBonus || 0) + gained;
        applyPassives();
        log(t("log.maxHpUp", { icon: item.icon, item: item.name, amount: p.maxHpBonus }), "heal");
      }
    }
  },
  // Respingo: cada golpe também fere os vizinhos do alvo. Sem crítico e sem efeitos de
  // golpe da arma nos vizinhos (é dano de área); abates contam para os gatilhos de abate.
  // Com `onHitLevel`, os efeitos de golpe dos outros itens (roubo de vida) valem nos vizinhos.
  splash(effect, item, ctx) {
    const radius = levelValue(item, effect, "radius") + state.player.reach * REACH_RADIUS;
    const near = enemiesWithin(ctx.target.x, radius, ctx.target);
    if (near.length === 0) return;
    const damage = Math.round(ctx.damage * levelValue(item, effect, "ratio"));
    const onHit = itemLevel(item.id) >= (effect.onHitLevel ?? Infinity);
    for (const en of near) {
      const dealt = applyElementalDamage(en, damage, item.dmgType || "physical", "player", false, item.id);
      if (onHit) runAnyHit({ ...ctx, target: en, dealt, damage, crit: false });
    }
    log(t("log.splash", { icon: item.icon, item: item.name, count: near.length, damage }), "dmg");
  },
  // Martelo da Forja: o golpe consome os stacks de queimadura do alvo (todos; metade no N3) e
  // causa 3 de dano de fogo por stack consumido; no N5 o estouro atinge os vizinhos. Depois
  // do estouro o martelo reacende o alvo com alguns stacks.
  forgeBurst(effect, item, ctx) {
    const target = ctx.target;
    const burn = target.dots?.find((d) => d.type === "burning");
    // Alvo que o próprio golpe matou: os stacks ficam (o Coração de Brasa os lê no abate) e só
    // o estouro nos vizinhos (N5) os aproveita
    const dying = target.hp <= 0 || target.dead;
    if (burn && burn.stacks > 0) {
      const consumed = Math.max(1, Math.ceil(burn.stacks * levelValue(item, effect, "consume")));
      if (!dying) {
        burn.stacks -= consumed;
        if (burn.stacks <= 0) target.dots = target.dots.filter((d) => d !== burn);
      }
      const damage = scaled(Math.round(effect.ratio * consumed * permanentDamage()));
      if (!dying) applyElementalDamage(target, damage, "fire", "player", false, item.id);
      let hitCount = dying ? 0 : 1;
      if (itemLevel(item.id) >= (effect.neighborLevel ?? Infinity)) {
        const near = enemiesWithin(target.x, NEIGHBOR_RADIUS + state.player.reach * REACH_RADIUS, target);
        for (const en of near) applyElementalDamage(en, damage, "fire", "player", false, item.id);
        hitCount += near.length;
      }
      spawnEffect("dragon_roar", target.x, target.y - 30, { life: 30 });
      log(t("log.forgeBurst", { icon: item.icon, item: item.name, stacks: consumed, damage, count: hitCount }), "dmg");
    }
    if (effect.ignite && target.hp > 0 && !target.dead) {
      addBurn(target, plusStacks(scaled(effect.ignite)), item);
    }
  },
  // Alvo com muitos stacks de queimadura solta uma labareda nos vizinhos
  flare(effect, item, ctx) {
    const stacks = burnStacks(ctx.target);
    if (stacks >= effect.threshold) flareAround(ctx.target, stacks, item);
  },
  // Execução: golpe que deixa um inimigo comum com pouca vida acaba com ele (chefe não)
  execute(effect, item, ctx) {
    const en = ctx.target;
    if (en.isBoss || en.dead || en.hp <= 0 || en.hp > en.maxHp * effect.ratio) return;
    creditDamage(item.id, en.hp);
    en.hp = 0;
    spawnEffect("text", en.x, en.y - 60, { life: 35, text: t("float.execute"), color: "#ff6666" });
    log(t("log.execute", { icon: item.icon, item: item.name, enemy: enemyName(en) }), "dmg");
  },
  // A cada N golpes, um raio de luz acerta todos os inimigos
  ray(effect, item, ctx) {
    if (ctx.extra) return; // ataque extra (Eco, contra-ataque, Moeda) não conta
    const counters = state.player.counters;
    const key = `ray_${item.id}`;
    counters[key] = (counters[key] || 0) + 1;
    if (counters[key] % effect.every !== 0) return;
    const damage = Math.round(ctx.damage * levelValue(item, effect, "ratio"));
    const all = livingEnemies();
    for (const en of all) {
      applyElementalDamage(en, damage, item.dmgType || "holy", "player", false, item.id);
      spawnEffect("lightning", en.x, en.y - 20, { life: 25, color: "#ffe27a" });
    }
    log(t("log.ray", { icon: item.icon, item: item.name, count: all.length, damage }), "item");
  },
};

// trigger "weaponHit": a cada golpe de arma (mesmo sem dano próprio, como o da Lâmina de Brasa),
// de qualquer item possuído, depois dos efeitos da própria arma. ctx.target é o alvo do golpe.
const WEAPON_HIT_EFFECTS = {
  // Frascos: golpe em alvo que já tem o efeito (queimadura ou veneno) soma stacks
  fuel(effect, item, ctx) {
    const target = ctx.target;
    if (target.dead || target.hp <= 0 || !target.dots?.some((d) => d.type === effect.dot && d.stacks > 0)) return;
    const wanted = plusStacks(scaled(Math.round(levelValue(item, effect, "stacks"))));
    if (effect.dot === "burning") addBurn(target, wanted, item);
    else addPoison(target, wanted, item);
  },
};

function runWeaponHit(ctx) {
  for (const { item, effect } of ownedEffects("weaponHit")) {
    WEAPON_HIT_EFFECTS[effect.type]?.(effect, item, ctx);
  }
}

// trigger "anyHit": a cada golpe de arma, de qualquer item possuído
const ANY_HIT_EFFECTS = {
  // Abaixo do limite de vida o roubo sobe (Sede)
  lifesteal(effect, item, ctx) {
    const p = state.player;
    const thirst = effect.thirst;
    let ratio = levelValue(item, effect, "ratio");
    if (thirst && itemLevel(item.id) >= thirst.level && p.hp / p.maxHp < thirst.threshold) {
      ratio *= thirst.mult;
    }
    healPlayer(Math.round(ctx.dealt * ratio), item);
  },
};

function runAnyHit(ctx) {
  for (const { item, effect } of ownedEffects("anyHit")) {
    ANY_HIT_EFFECTS[effect.type]?.(effect, item, ctx);
  }
}

// Roubo de vida também no dano contínuo (Amuleto Vampírico N5)
function dotLifesteal(dmg) {
  for (const { item, effect } of ownedEffects("anyHit")) {
    if (effect.type !== "lifesteal" || itemLevel(item.id) < (effect.dotLevel ?? Infinity)) continue;
    healPlayer(Math.round(dmg * levelValue(item, effect, "ratio")), item);
  }
}

// trigger "anyAttack": a cada ataque de arma completo, de qualquer item possuído
const ANY_ATTACK_EFFECTS = {
  // A cada N ataques, a arma que atacou recarrega na hora (allLevel: todos os itens)
  sprint(effect, item, ctx) {
    const counters = state.player.counters;
    counters.sprint = (counters.sprint || 0) + 1;
    if (counters.sprint % effect.every !== 0) return;
    ctx.refund = Infinity;
    if (itemLevel(item.id) >= (effect.allLevel ?? Infinity)) {
      for (const other of state.items) {
        const timer = state.itemTimers[other.id];
        if (timer && !other.fixedRate && other.type === "weapon") timer.elapsed = timer.cooldown; // só armas
      }
    }
    log(t("log.sprint", { icon: item.icon, item: item.name, weapon: ctx.weapon.name }), "item");
  },
};

// trigger "crit": a cada golpe crítico, de qualquer item possuído
const CRIT_EFFECTS = {
  // O ataque extra é feito no fim do ataque atual, e nunca gera outro extra
  extraAttack(effect, item, ctx) {
    if (ctx.extra || ctx.wantExtra || !rolls(effect)) return;
    ctx.wantExtra = item;
  },
};

// trigger "kill": a cada inimigo derrotado, de qualquer item possuído
const KILL_EFFECTS = {
  // A cada N abates, o próximo ataque da arma com este efeito causa dano ×2
  harvest(effect, item) {
    const p = state.player;
    p.counters.harvest = (p.counters.harvest || 0) + 1;
    if (p.counters.harvest % effect.every !== 0) return;
    p.harvestReady = true;
    log(t("log.harvestReady", { icon: item.icon, item: item.name }), "item");
  },
  // Almas: a Foice ganha dano permanente a cada N abates da run; o bônus sai de
  // state.kills (ver soulBonus), então não há nada a contar aqui
  soulHarvest() {},
  // Contágio: a queimadura de quem morreu passa aos N vivos mais próximos (N = nível).
  // Todo abate (golpe, dano contínuo, explosão, reflexo, espinhos) passa pelo teste de
  // morte do updateEnemies, que chama este gatilho; por isso o contágio pega todos.
  spread(effect, item, en) {
    spreadBurn(en, itemLevel(item.id) + state.player.reach, item, effect);
  },
  // Ferradura da Sorte e Trevo de Ouro: a cada N abates da run, fragmentos (cresce com o nível)
  fragmentBounty(effect, item) {
    if (state.kills % effect.kills !== 0) return;
    const amount = Math.round(levelValue(item, effect, "amount") * effectCount(item, effect));
    state.fragments += amount;
    spawnNumber(state.player.x, state.player.y - 90, `⚡+${amount}`, "#ffdd44", 2);
    log(t("log.luckFragments", { icon: item.icon, item: item.name, count: amount }), "item");
  },
  // Praga Detonante: o inimigo que morre envenenado passa parte dos stacks (metade; todos no
  // N5) aos vizinhos, tantos quanto o nível do item
  plagueDeath(effect, item, en) {
    const poison = en.dots?.find((d) => d.type === "poison");
    if (!poison || poison.stacks <= 0) return;
    const stacks = Math.max(1, Math.floor(poison.stacks * levelValue(item, effect, "ratio")));
    const near = nearestLiving(en, itemLevel(item.id) + state.player.reach, "poison", item.id);
    const reached = near.filter((target) => addPoison(target, plusStacks(stacks), item, poison.rawBase ?? poison.base) > 0);
    if (reached.length === 0) return;
    sound("spread");
    emit("spread", {
      from: { x: en.x, y: en.y },
      to: reached.map((e) => ({ x: e.x, y: e.y })),
      element: "poison",
    });
    log(t("log.plagueDeath", { icon: item.icon, item: item.name, count: reached.length, stacks }), "item");
  },
  critFragment(effect, item, en) {
    if (!en.lastHitCrit) return;
    state.fragments += effect.amount;
    spawnNumber(en.x + 20, en.y - 65, `⚡+${effect.amount}`, "#ffdd44", 2);
    log(t("log.critFragment", { icon: item.icon, item: item.name, count: effect.amount }), "item");
  },
  // Cada abate custa vida (nunca mata) e soma dano até o teto, pela run toda
  pact(effect, item) {
    const p = state.player;
    if (p.hp > 1) p.hp = Math.max(1, p.hp - effect.hpCost);
    p.pactBonus = Math.min(levelValue(item, effect, "max"), (p.pactBonus || 0) + effect.bonus);
  },
};

// trigger "attack": uma vez por ataque, depois do primeiro golpe
const ATTACK_EFFECTS = {
  // Salta para os próximos inimigos (+1 salto por nível; o Manto do Arcano N5 soma mais um)
  chain(effect, item, ctx) {
    const targets = Math.round(levelValue(item, effect, "targets")) + state.player.reach;
    const ratio = levelValue(item, effect, "ratio");
    const others = state.enemies
      .filter((e) => !e.dead && e !== ctx.target)
      .slice(0, targets);
    others.forEach((en) => {
      applyElementalDamage(en, Math.round(ctx.damage * ratio), effect.element, "player", false, item.id);
      spawnEffect("lightning", en.x, en.y - 20, {
        life: 25,
        color: "#66aaff",
      });
    });
    if (others.length > 0) {
      log(t("log.chain", { count: others.length }), "item");
    }
  },
  // Atinge todos os outros inimigos vivos com o dano base do golpe (sem crítico);
  // em chefe vale o multiplicador do ataque (Tomo do Julgamento N5)
  hitAll(effect, item, ctx) {
    const others = livingEnemies().filter((e) => e !== ctx.target);
    if (others.length === 0) return;
    const damage = Math.round(ctx.damage * effect.ratio);
    for (const en of others) {
      const dmg = en.isBoss ? Math.round(damage * ctx.bossMult) : damage;
      applyElementalDamage(en, dmg, item.dmgType || "physical", "player", false, item.id);
      spawnEffect("lightning", en.x, en.y - 20, { life: 25, color: "#ffe27a" });
    }
    log(t("log.hitAll", { icon: item.icon, item: item.name, count: others.length, damage }), "item");
  },
  // Adianta a recarga dos outros itens (não do próprio)
  cooldownOthers(effect, item, ctx) {
    if (ctx.extra) return;
    const ms = levelValue(item, effect, "ms");
    for (const other of state.items) {
      const timer = state.itemTimers[other.id];
      if (other.id === item.id || !timer || other.fixedRate) continue; // aura de ritmo fixo não acelera
      timer.elapsed = Math.min(timer.cooldown, timer.elapsed + ms);
    }
  },
  // Atravessa: o golpe também acerta o(s) próximo(s) da fila e aplica os stacks da arma neles
  pierce(effect, item, ctx) {
    const next = othersByDistance(ctx.target).slice(0, effect.targets ?? 1);
    for (const en of next) {
      applyElementalDamage(en, Math.round(ctx.damage * rearFactor(ctx, en)), item.dmgType || "physical", "player", false, item.id);
      for (const hit of effectsOf(item, "hit")) {
        if (hit.type === "cold") applyColdEffect(hit, item, en);
        else if (hit.type === "dot") applyDotEffect(hit, item, en);
      }
    }
    if (next.length > 0) log(t("log.pierce", { icon: item.icon, item: item.name, count: next.length }), "item");
  },
  // O golpe também acerta os próximos da fila, com a mesma força
  cleave(effect, item, ctx) {
    const next = othersByDistance(ctx.target).slice(0, effect.targets);
    for (const en of next) {
      applyElementalDamage(en, Math.round(ctx.damage * effect.ratio), item.dmgType || "physical", "player", false, item.id);
    }
  },
  // Julgamento: todos os inimigos vivos recebem mais dano por um tempo
  judge(effect, item) {
    const ms = levelValue(item, effect, "ms");
    for (const en of livingEnemies()) en.judged = { ms, bonus: effect.bonus };
  },
  // Maré cheia: com o máximo de acúmulos, o golpe vira uma onda que acerta todos
  tideWave(effect, item, ctx) {
    const p = state.player;
    if (!ctx.tideFull || !p.tide) return;
    const damage = Math.round(ctx.damage * levelValue(item, effect, "ratio"));
    for (const en of livingEnemies().filter((e) => e !== ctx.target)) {
      applyElementalDamage(en, damage, item.dmgType || "water", "player", false, item.id);
    }
    p.tide.stacks = 0;
    log(t("log.tideWave", { icon: item.icon, item: item.name }), "item");
  },
};

// Efeitos "attack" que mudam o dano do ataque inteiro: rodam antes do primeiro golpe
// e preenchem ctx.mult (multiplicador) e ctx.flat (dano somado por golpe)
const ATTACK_MODS = {
  // A cada N-ésimo uso: +bonus de dano
  storm(effect, item, ctx) {
    const counters = state.player.counters;
    counters.storm = (counters.storm || 0) + 1;
    if (counters.storm % effect.every !== 0) return;
    ctx.mult *= 1 + effect.bonus;
    log(t("log.storm", { item: item.name, percent: Math.round(effect.bonus * 100) }), "item");
  },
  // Ataques seguidos no mesmo alvo acumulam dano; trocar de alvo zera
  tide(effect, item, ctx) {
    const p = state.player;
    if (!p.tide || p.tide.target !== ctx.target) p.tide = { target: ctx.target, stacks: 0 };
    ctx.flat += p.tide.stacks * effect.damage;
    ctx.tideFull = p.tide.stacks >= effect.max;
    p.tide.stacks = Math.min(effect.max, p.tide.stacks + 1);
  },
  // Multiplicador contra chefes (só vale no alvo que é chefe)
  bossBonus(effect, item, ctx) {
    ctx.bossMult = effect.mult;
  },
  // Besta Longa N5: alvos da linha de trás recebem mais dano
  rearBonus(effect, item, ctx) {
    ctx.rearMult = effect.mult;
  },
  // Adaga Serpente N3: dano direto +3% por stack de veneno do alvo
  venomEdge(effect, item, ctx) {
    ctx.mult *= 1 + effect.bonus * Math.min(effect.cap ?? Infinity, poisonStacks(ctx.target));
  },
};

const ONE_SHOT_MODS = new Set(["storm", "tide"]);

// Passa TODOS os stacks de queimadura de `dead` aos `count` inimigos vivos mais próximos
// dele, somando aos que cada alvo já tem (a resistência do alvo reduz os que entram).
// Os alvos que também morrerem queimando espalham de novo (cadeia). Com `flareLevel`, o
// salto também causa uma labareda de 1 por stack no alvo novo.
function spreadBurn(dead, count, item, effect = {}) {
  const burn = (dead.dots || []).find((d) => d.type === "burning");
  if (!burn || burn.stacks <= 0) return;
  const targets = livingEnemies()
    .filter((e) => e !== dead && effectiveResist(e, "fire", item.id) < 1) // imune não gasta vaga
    .map((e) => ({ e, dist: Math.hypot(e.x - dead.x, e.y - dead.y) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, count)
    .map((o) => o.e);
  if (targets.length === 0) return;
  const reached = [];
  const flare = itemLevel(item.id) >= (effect.flareLevel ?? Infinity);
  for (const en of targets) {
    const stacks = landStacks(en, "fire", plusStacks(burn.stacks), item.id);
    if (stacks <= 0) continue;
    applyDot(en, "burning", burn.damage, 0, true, { stacks, sourceId: burn.sourceId }); // a arma original leva o crédito
    if (flare) applyElementalDamage(en, Math.round(stacks * permanentDamage()), "fire", "player", false, item.id);
    reached.push(en);
  }
  if (reached.length === 0) return;
  sound("spread");
  emit("spread", {
    from: { x: dead.x, y: dead.y },
    to: reached.map((e) => ({ x: e.x, y: e.y })),
  });
  log(
    t("log.spread", { icon: item.icon, item: item.name, count: reached.length, stacks: burn.stacks }),
    "item",
  );
}

// Nuvem de veneno: stacks nos inimigos dados; já envenenados recebem o dobro com doubled
// (Cogumelo Pestilento N5). scale: repetição do Eco reduz os stacks.
function cloudApply(targets, stacks, doubled, item, scale = false) {
  for (const en of targets) {
    let n = doubled && poisonStacks(en) > 0 ? stacks * 2 : stacks;
    if (scale) n = scaled(n);
    addPoison(en, plusStacks(n), item);
  }
}

// Nuvens no chão: a cada segundo envenenam de novo quem está dentro, até acabar o tempo
export function updateClouds(dt) {
  if (!state.clouds?.length) return;
  for (const cloud of state.clouds) {
    cloud.ms -= dt;
    cloud.tick += dt;
    while (cloud.tick >= 1000) {
      cloud.tick -= 1000;
      const item = findItem(cloud.itemId);
      if (!item) continue;
      const near = enemiesWithin(cloud.x, cloud.radius);
      cloudApply(near, cloud.stacks, cloud.doubled, item);
      if (near.length > 0) emit("cloud", { x: cloud.x, y: state.player.y, radius: cloud.radius });
    }
  }
  state.clouds = state.clouds.filter((c) => c.ms > 0);
}

// trigger "use": itens que não são armas, quando a recarga fica pronta
const USE_EFFECTS = {
  // Explosão em volta do herói: dano fixo (cresce com o nível) em todos no raio, com fogo
  // a partir do nível do encantamento (burnPerLevel stacks por nível do item)
  blast(effect, item, p) {
    const damage = Math.round(scaled(levelValue(item, effect, "damage")) * permanentDamage());
    const near = enemiesWithin(p.x, levelValue(item, effect, "radius"));
    // Sem ninguém no alcance não explode: a recarga fica pronta para quando houver alvo
    if (near.length === 0) return false;
    const burn =
      itemLevel(item.id) >= (effect.burnLevel ?? Infinity)
        ? plusStacks(scaled(effect.burnPerLevel * itemLevel(item.id)))
        : 0;
    for (const en of near) {
      applyElementalDamage(en, damage, effect.element, "player", false, item.id);
      const landed = burn > 0 ? landStacks(en, "fire", burn, item.id) : 0;
      if (landed > 0) applyDot(en, "burning", permanentDamage(), 0, true, { stacks: landed, sourceId: item.id });
    }
    spawnEffect("dragon_roar", p.x, p.y - 30, { life: 40 });
    sound("explode");
    emit("explode", { x: p.x, y: p.y, kind: "fire", radius: effect.radius });
    log(t("log.blast", { icon: item.icon, item: item.name, damage, count: near.length }), "item");
    p.anim = "berserk";
  },
  // Bloqueia os próximos golpes (2 a partir do nível 5)
  blockNext(effect, item, p) {
    p.blocksLeft = Math.round(levelValue(item, effect, "blocks"));
    spawnEffect("shield", p.x, p.y - 40, { life: 40 });
    log(t("log.blockNext", { icon: item.icon, item: item.name }), "item");
    p.anim = "block";
  },
  heal(effect, item, p) {
    const charges = (p.charges[item.id] || 0) + (echoing ? 0 : 1);
    p.charges[item.id] = charges;
    // Ressonância: a cada N cargas a cura ganha um bônus permanente na run
    const bonus =
      effect.bonusEvery && itemLevel(item.id) >= (effect.bonusLevel ?? 1)
        ? Math.floor(charges / effect.bonusEvery) * effect.bonusAmount
        : 0;
    const healAmt = scaled(Math.round(levelValue(item, effect, "amount", effect.amount + bonus)));
    p.hp = Math.min(p.maxHp, p.hp + healAmt);
    spawnEffect("heal", p.x, p.y - 50, { life: 45 });
    spawnNumber(p.x, p.y - 60, `+${healAmt}`, "#44cc88", 2);
    log(t("log.heal", { icon: item.icon, item: item.name, amount: healAmt }), "heal");
    p.anim = "heal";
  },
  frenzy(effect, item, p) {
    p.berserking = true;
    const duration = Math.round(scaled(levelValue(item, effect, "duration")));
    p.berserkRemaining = Math.max(p.berserkRemaining || 0, duration); // o Eco não encurta um Frenesi ativo
    p.berserkSpeed = effect.speedBonus;
    spawnEffect("berserk", p.x, p.y - 40, { life: 60 });
    log(t("log.frenzy", { icon: item.icon, item: item.name, seconds: formatNumber(duration / 1000) }), "item");
    p.anim = "berserk";
  },
  // Aura de frio: stacks nos inimigos colados no herói (o 5º congela)
  coldAura(effect, item, p) {
    const near = enemiesWithin(p.x, levelValue(item, effect, "radius"));
    if (near.length === 0) return false;
    const stacks = scaled(Math.round(levelValue(item, effect, "stacks"))) + p.extraStacks;
    let froze = 0;
    for (const en of near) {
      const before = en.frozen || 0;
      applyCold(en, stacks, { itemId: item.id, quiet: true });
      if ((en.frozen || 0) > before) froze++;
    }
    spawnEffect("crystal_shield", p.x, p.y - 40, { life: 30 });
    if (froze > 0) {
      sound("freeze");
      emit("freeze", { x: p.x, y: p.y });
      log(t("log.freezeMany", { count: froze }), "item");
    }
    p.anim = "block";
  },
  // Pele em brasa (Escama Dracônica N5): 1 stack de fogo por segundo nos inimigos colados
  emberSkin(effect, item, p) {
    const near = enemiesWithin(p.x, effect.radius);
    if (near.length === 0) return false;
    for (const en of near) igniteWith(item, effect, en, scaled(Math.round(levelValue(item, effect, "stacks"))));
    spawnEffect("dragon_roar", p.x, p.y - 30, { life: 25 });
    log(t("log.emberSkin", { icon: item.icon, item: item.name, count: near.length }), "item");
  },
  // Praga Detonante: cada inimigo envenenado passa stacks aos vizinhos (tantos quanto o nível)
  plagueSpread(effect, item, p) {
    const poisoned = livingEnemies().filter((e) => poisonStacks(e) > 0);
    if (poisoned.length === 0) return false;
    const count = itemLevel(item.id) + p.reach;
    const stacks = plusStacks(scaled(Math.round(levelValue(item, effect, "stacks"))));
    // Primeiro escolhe todos os destinos, depois aplica (um vizinho recém-infectado não passa adiante)
    const pairs = poisoned.flatMap((src) =>
      nearestLiving(src, count, "poison", item.id).map((dst) => ({ src, dst })),
    );
    let reached = 0;
    const bySource = new Map();
    for (const { src, dst } of pairs) {
      const poison = src.dots.find((d) => d.type === "poison");
      if (addPoison(dst, stacks, item, poison.rawBase ?? poison.base) > 0) {
        reached++;
        if (!bySource.has(src)) bySource.set(src, []);
        bySource.get(src).push({ x: dst.x, y: dst.y });
      }
    }
    if (reached === 0) return false;
    for (const [src, to] of bySource) emit("spread", { from: { x: src.x, y: src.y }, to, element: "poison" });
    log(t("log.plagueSpread", { icon: item.icon, item: item.name, count: reached }), "item");
  },
  // Cogumelo Pestilento: nuvem que envenena todos perto do herói; no N3 ela fica no chão
  poisonCloud(effect, item, p) {
    const radius = effect.radius + p.reach * REACH_RADIUS;
    const near = enemiesWithin(p.x, radius);
    if (near.length === 0) return false;
    const level = itemLevel(item.id);
    const doubled = level >= (effect.doubleLevel ?? Infinity);
    cloudApply(near, Math.round(levelValue(item, effect, "stacks")), doubled, item, true);
    if (level >= (effect.cloudLevel ?? Infinity)) {
      // No chão a nuvem aplica 1 stack por nível a cada segundo
      // O Eco repete a nuvem com a escala dele também no chão
      state.clouds.push({ x: p.x, radius, ms: effect.cloudMs, tick: 0, stacks: scaled(level), doubled, itemId: item.id });
    }
    emit("cloud", { x: p.x, y: p.y, radius });
    log(t("log.poisonCloud", { icon: item.icon, item: item.name, count: near.length }), "item");
  },
  // Couro de Basilisco N5: cura 1 HP por inimigo envenenado
  poisonHeal(effect, item) {
    const count = livingEnemies().filter((e) => poisonStacks(e) > 0).length;
    if (count === 0) return false;
    healPlayer(scaled(Math.round(levelValue(item, effect, "amount")) * count), item);
  },
  // Eco: repete o último item ativado (arma ou relíquia) com parte do efeito
  echo(effect, item, p) {
    const last = state.items.find((i) => i.id === p.lastActivated);
    if (!last) return false; // nada para repetir: a recarga fica pronta
    const ratio = levelValue(item, effect, "ratio");
    const repeats = Math.round(levelValue(item, effect, "repeats"));
    const previous = echoScale;
    echoScale = ratio;
    echoing = true;
    let done = 0;
    try {
      for (let i = 0; i < repeats; i++) if (activateItem(last, { echo: true })) done++;
    } finally {
      echoScale = previous;
      echoing = false;
    }
    if (done === 0) return false;
    spawnEffect("echo", p.x, p.y - 50, { life: 35 });
    log(
      t("log.echo", { icon: item.icon, item: item.name, target: last.name, percent: Math.round(ratio * 100), count: done }),
      "item",
    );
    p.anim = "heal";
  },
};

// trigger "freeze": um inimigo acabou de congelar (por qualquer fonte)
let shardDepth = 0;
const FREEZE_EFFECTS = {
  // Estilhaços: o congelado solta gelo que aplica stacks de frio nos vizinhos
  shards(effect, item, en) {
    if (shardDepth >= 3) return; // vizinhos que congelam soltam os seus, mas a cadeia tem fim
    const stacks = levelValue(item, effect, "stacks");
    const near = enemiesWithin(en.x, effect.radius, en);
    shardDepth++;
    try {
      for (const other of near) applyCold(other, plusStacks(stacks), { itemId: item.id, quiet: true });
    } finally {
      shardDepth--;
    }
    if (near.length > 0) log(t("log.shards", { icon: item.icon, item: item.name, count: near.length }), "item");
  },
};

// trigger "dodge": quando o herói esquiva. ctx = { enemy }
const DODGE_EFFECTS = {
  empowerNext(effect, item) {
    const bonus = levelValue(item, effect, "bonus");
    state.player.empowered = Math.max(state.player.empowered || 0, bonus);
    log(t("log.nextBonus", { icon: item.icon, item: item.name, percent: Math.round(bonus * 100) }), "item");
  },
  // Contra-ataque: a arma mais perto de ficar pronta ataca na hora o inimigo que errou
  // (ataque extra: não mexe na recarga nem conta para Sprint)
  counterAttack(effect, item, ctx) {
    const ready = (w) => {
      const timer = state.itemTimers[w.id];
      return timer ? timer.elapsed / timer.cooldown : 0;
    };
    // O Arco Fantasma só atira na linha de trás: não serve de contra-ataque
    const weapon = state.items
      .filter((i) => i.type === "weapon" && i.targeting !== "rear")
      .sort((a, b) => ready(b) - ready(a))[0];
    if (!weapon || ctx.enemy.dead || ctx.enemy.hp <= 0) return;
    log(t("log.counter", { icon: item.icon, item: item.name, weapon: weapon.name }), "item");
    weaponAttack(weapon, ctx.enemy, { extra: true });
  },
};

// trigger "hurt": ao tomar dano de HP. ctx = { enemy, damage }
const HURT_EFFECTS = {
  // Espinhos: só chega aqui quando o golpe tirou HP (a esquiva e o bloqueio só chamam
  // com o encantamento do nível 5). Fere todos os vivos ao alcance do herói.
  thorns(effect, item) {
    const p = state.player;
    const near = enemiesWithin(p.x, effect.radius);
    if (near.length === 0) return;
    let damage = levelValue(item, effect, "damage");
    if (itemLevel(item.id) >= (effect.armorBonusLevel ?? Infinity)) {
      damage *= 1 + effect.armorBonus * p.armor; // +1% por ponto de armadura
    }
    damage = Math.round(damage * permanentDamage());
    for (const en of near) {
      applyElementalDamage(en, damage, "physical", "thorns", false, item.id);
      spawnEffect("text", en.x, en.y - 60, { life: 30, text: "🌵", color: "#66aa44" });
    }
    log(t("log.thorns", { icon: item.icon, item: item.name, count: near.length, damage }), "item");
  },
  // Devolve parte do dano recebido ao atacante (chance e fração crescem por degrau)
  reflect(effect, item, ctx) {
    if (random() >= levelValue(item, effect, "chance", effect.chance ?? 1)) return;
    const reflected = Math.round(ctx.damage * levelValue(item, effect, "ratio"));
    if (reflected <= 0) return;
    applyElementalDamage(ctx.enemy, reflected, "physical", "reflect");
    log(
      t("log.reflect", { icon: item.icon, item: item.name, amount: reflected, enemy: enemyName(ctx.enemy) }),
      "item",
    );
  },
  // Couro de Basilisco: quem bate no herói fica envenenado
  poisonAttacker(effect, item, ctx) {
    const landed = addPoison(ctx.enemy, plusStacks(Math.round(levelValue(item, effect, "stacks"))), item);
    if (landed > 0) {
      log(t("log.poisonAttacker", { icon: item.icon, item: item.name, enemy: enemyName(ctx.enemy) }), "item");
    }
  },
  // Escama Dracônica e Manto de Cinzas: quem bate no herói pega fogo
  burnAttacker(effect, item, ctx) {
    const landed = igniteWith(item, effect, ctx.enemy, Math.round(levelValue(item, effect, "stacks")));
    if (landed > 0) {
      log(t("log.burnAttacker", { icon: item.icon, item: item.name, enemy: enemyName(ctx.enemy) }), "item");
    }
  },
};

// Espinhos também reagem quando o ataque é esquivado ou bloqueado (Cota de Espinhos N5)
function avoidThorns() {
  for (const { item, effect } of ownedEffects("hurt")) {
    if (effect.type === "thorns" && itemLevel(item.id) >= (effect.avoidLevel ?? Infinity)) {
      HURT_EFFECTS.thorns(effect, item);
    }
  }
}

// trigger "death": efeitos que acompanham o renascimento (o próprio "revive" é em checkPlayerDeath)
const DEATH_EFFECTS = {
  resetCooldowns() {
    Object.values(state.itemTimers).forEach((timer) => {
      timer.elapsed = timer.cooldown;
    });
  },
  // Pena de Fênix N5: ao reviver, explode em fogo e queima todos os inimigos
  reviveBurst(effect, item, p) {
    for (const en of livingEnemies()) {
      const landed = landStacks(en, "fire", plusStacks(effect.stacks), item.id);
      if (landed > 0) applyDot(en, "burning", permanentDamage(), 0, true, { stacks: landed, sourceId: item.id });
    }
    spawnEffect("dragon_roar", p.x, p.y - 30, { life: 40 });
    sound("explode");
    emit("explode", { x: p.x, y: p.y, kind: "fire" });
  },
};

// Cura o herói e devolve o que passou da vida máxima (a Foice de Sangue o usa)
function healPlayer(amount, item) {
  if (amount <= 0) return 0;
  const p = state.player;
  const healed = Math.min(amount, p.maxHp - p.hp);
  if (healed <= 0) return amount;
  p.hp += healed;
  spawnNumber(p.x, p.y - 60, `+${healed}`, "#44cc88", 2);
  log(t("log.hpGain", { icon: item.icon, item: item.name, amount: healed }), "heal");
  return amount - healed;
}

// Congelado: o inimigo não anda nem ataca por `ms` de tempo de jogo
// quiet: o chamador avisa som, evento e log uma vez só (explosão em vários inimigos)
function freezeEnemy(en, ms, quiet = false) {
  en.frozen = Math.max(en.frozen || 0, ms);
  spawnEffect("text", en.x, en.y - 60, { life: 30, text: "❄️", color: "#88ddff" });
  if (!quiet) {
    sound("freeze");
    emit("freeze", { x: en.x, y: en.y });
    log(t("log.freeze", { target: enemyName(en), seconds: formatNumber(ms / 1000) }), "item");
  }
  for (const { item, effect } of ownedEffects("freeze")) FREEZE_EFFECTS[effect.type]?.(effect, item, en);
}

// trigger "click": itens míticos, a cada clique na arena que passou pelo limitador
const CLICK_EFFECTS = {
  // Clique Elemental: 1 stack de fogo, veneno ou frio (sorteado) num inimigo aleatório;
  // a resistência e a imunidade do alvo valem como nos outros itens
  randomStack(effect, item) {
    const targets = livingEnemies();
    if (targets.length === 0) return false;
    const en = targets[Math.floor(random() * targets.length)];
    const element = effect.elements[Math.floor(random() * effect.elements.length)];
    const stacks = plusStacks(effect.stacks);
    if (element === "fire") addBurn(en, stacks, item);
    else if (element === "poison") addPoison(en, stacks, item);
    else applyCold(en, stacks, { itemId: item.id });
  },
  // Dedo Sísmico: dano físico em todos os inimigos vivos
  hitAll(effect, item) {
    const targets = livingEnemies();
    if (targets.length === 0) return false;
    const damage = Math.round(effect.damage * permanentDamage());
    for (const en of targets) applyElementalDamage(en, damage, "physical", "player", false, item.id);
  },
};

// Clique ou toque na arena: ativa os itens míticos, no máximo MAX_CLICKS_PER_SECOND por
// segundo (clicks.js). Só com a run rodando e sem pausa. now: relógio em ms (tempo real).
export function arenaClick(now = performance.now()) {
  if (!state.running || state.isPaused) return false;
  const owned = state.items.filter((i) => effectsOf(i, "click").length > 0);
  if (owned.length === 0 || !tryClick(now)) return false;
  let any = false;
  for (const item of owned) {
    let used = false;
    for (const effect of effectsOf(item, "click")) {
      if (CLICK_EFFECTS[effect.type]?.(effect, item) !== false) used = true;
    }
    if (!used) continue;
    any = true;
    state.runStats.itemUses[item.id] = (state.runStats.itemUses[item.id] || 0) + 1;
    emit("itemUsed", item.id);
  }
  return any;
}

// Tipos que o jogo sabe executar, por gatilho (os testes conferem o items.json contra isto)
export const KNOWN_EFFECTS = {
  hit: Object.keys(HIT_EFFECTS),
  attack: [...Object.keys(ATTACK_EFFECTS), ...Object.keys(ATTACK_MODS)],
  anyHit: Object.keys(ANY_HIT_EFFECTS),
  anyAttack: Object.keys(ANY_ATTACK_EFFECTS),
  crit: Object.keys(CRIT_EFFECTS),
  kill: Object.keys(KILL_EFFECTS),
  dodge: Object.keys(DODGE_EFFECTS),
  use: Object.keys(USE_EFFECTS),
  freeze: Object.keys(FREEZE_EFFECTS),
  passive: ["stats", "strikes", "lowHpHaste", "doubleStrike", "extraArrows", "rearRefund", "immunity", "luck"],
  weaponHit: Object.keys(WEAPON_HIT_EFFECTS),
  slow: ["slowDot"],
  burnDecay: ["halveBurnDecay"],
  dotBase: ["poisonBase"],
  poisonTick: Object.keys(POISON_TICK_EFFECTS),
  enemyDamage: ["weaken"],
  click: Object.keys(CLICK_EFFECTS),
  levelUp: Object.keys(LEVEL_UP_EFFECTS),
  damage: ["frenzyBoost"],
  vulnerable: ["corrosion", "frozenVuln"],
  block: ["reflect"],
  hurt: Object.keys(HURT_EFFECTS),
  death: ["revive", ...Object.keys(DEATH_EFFECTS)],
  lowHp: ["useNow"],
};

// ═══════════════════════════════════════════
//  ITEM ACTIVATION LOGIC
// ═══════════════════════════════════════════
// Dano extra permanente da Foice de Sangue: +amount a cada N abates da run
function soulBonus(item) {
  const e = effectsOf(item, "kill").find((k) => k.type === "soulHarvest");
  if (!e) return 0;
  return Math.floor(state.kills / e.every) * e.amount;
}

// Golpes por ataque: os do item mais os "strikes" liberados por nível (marcos da Lâmina)
function strikeCount(item, target = null) {
  const hits = effectsOf(item, "passive")
    .filter((e) => e.type === "strikes")
    .reduce((n, e) => n + e.hits * effectCount(item, e), item.hits || 1);
  // Adaga Serpente N5: alvo com muitos stacks de veneno leva golpe duplo
  const double =
    target &&
    effectsOf(item, "passive").some((e) => e.type === "doubleStrike" && poisonStacks(target) >= e.threshold);
  return double ? hits * 2 : hits;
}

// Besta Longa N5: fator de dano contra a linha de trás
function rearFactor(ctx, en) {
  return ctx.rearMult > 1 && isRear(en) ? ctx.rearMult : 1;
}

// Dano de um golpe. Ordem: base × nível × (bônus de dano), elemental, modificadores do
// ataque, Frenesi, chefe e, por fim, o crítico. Devolve { dmg, crit, base }.
function attackDamage(item, ctx) {
  const p = state.player;
  let dmg = Math.round(
    (levelValue(item, item, "baseDmg", item.baseDmg + (item.bonusDmg || 0)) + soulBonus(item)) *
      permanentDamage(),
  );
  // Amplificador mágico (Manto do Arcano): só armas que não são físicas
  if ((item.dmgType || "physical") !== "physical" && p.elementalBoost) {
    dmg = Math.round(dmg * (1 + p.elementalBoost));
  }
  // Tempestade, Maré, Colheita e Fuga (calculados uma vez por ataque)
  dmg = Math.round((dmg + ctx.flat) * ctx.mult);
  // Durante o Frenesi (Totem Berserker N5)
  if (p.berserking) {
    for (const { item: owner, effect } of ownedEffects("damage")) {
      if (effect.type === "frenzyBoost") dmg = Math.round(dmg * (1 + levelValue(owner, effect, "bonus")));
    }
  }
  dmg = scaled(dmg);
  const crit = random() < (p.critChance || 0);
  const base = dmg; // sem chefe e sem crítico: é o que o Relâmpago em cadeia repassa
  if (ctx.bossMult > 1 && ctx.target.isBoss) dmg = Math.round(dmg * ctx.bossMult);
  dmg = Math.round(dmg * rearFactor(ctx, ctx.target));
  if (crit) dmg = Math.round(dmg * (p.critMult || CRIT_MULT));
  return { dmg, crit, base };
}

// Modificadores do ataque inteiro. Um ataque extra herda os do ataque que o gerou.
function attackModifiers(item, target, extra) {
  const p = state.player;
  const ctx = {
    target,
    weapon: item,
    damage: 0,
    dealt: 0,
    crit: false,
    refund: 0,
    extra,
    mult: 1,
    flat: 0,
    bossMult: 1,
    rearMult: 1,
    tideFull: false,
    wantExtra: false,
  };
  // Ataque extra (Moeda, contra-ataque, Eco): só os modificadores permanentes (chefe);
  // os de uso único (Tempestade, Maré, Colheita, Fuga) ficam de fora
  if (extra) {
    for (const effect of effectsOf(item, "attack")) {
      if (!ONE_SHOT_MODS.has(effect.type)) ATTACK_MODS[effect.type]?.(effect, item, ctx);
    }
    return ctx;
  }
  for (const effect of effectsOf(item, "attack")) {
    ATTACK_MODS[effect.type]?.(effect, item, ctx);
  }
  // Colheita: a foice cobra os abates acumulados
  if (p.harvestReady && effectsOf(item, "kill").some((e) => e.type === "harvest")) {
    p.harvestReady = false;
    ctx.mult *= 2;
    log(t("log.harvest", { icon: item.icon, item: item.name }), "item");
  }
  // Fuga: esquiva reforça o próximo ataque de arma
  if (p.empowered > 0) {
    ctx.mult *= 1 + p.empowered;
    log(t("log.escape", { percent: Math.round(p.empowered * 100) }), "item");
    p.empowered = 0;
  }
  return ctx;
}

// extra: objeto quando é um ataque extra (Moeda da Fortuna, Contra-ataque, Eco): ataque
// comum, sem bônus de uso único (Colheita, Tempestade, Fuga, Maré) e sem contar para
// Sprint nem gerar outro extra
function weaponAttack(item, target, extra = null) {
  const p = state.player;
  const hits = strikeCount(item, target);
  const ctx = attackModifiers(item, target, extra);
  let totalDmg = 0;
  // Arma sem dano próprio (ex.: Lâmina de Brasa só aplica queimadura): o golpe não
  // causa dano nem crítico e não gasta bônus de uso único, mas os efeitos de golpe rodam
  const appliesOnly = !((item.baseDmg || 0) + (item.bonusDmg || 0) > 0);

  for (let h = 0; h < hits; h++) {
    // Alvo já morto (outra arma, ou o golpe anterior): não gasta mais nada nele
    if (h > 0 && target.hp <= 0) break;
    const { dmg, crit, base } = appliesOnly
      ? { dmg: 0, crit: false, base: 0 }
      : attackDamage(item, ctx);
    const dealt = appliesOnly
      ? 0
      : applyElementalDamage(target, dmg, item.dmgType || "physical", "player", crit, item.id);
    totalDmg += dealt;
    ctx.damage = base;
    ctx.dealt = dealt;
    ctx.crit = crit;

    if (crit) {
      spawnEffect("text", target.x, target.y - 75, {
        life: 35,
        text: t("float.crit"),
        color: "#ffdd44",
      });
      sound("crit");
      emit("crit", { x: target.x, y: target.y, damage: dealt });
      for (const { item: owner, effect } of ownedEffects("crit")) {
        CRIT_EFFECTS[effect.type]?.(effect, owner, ctx);
      }
    }
    for (const effect of effectsOf(item, "hit")) {
      HIT_EFFECTS[effect.type]?.(effect, item, ctx);
    }
    // Roubo de vida e afins dependem do dano do golpe: sem dano, não há o que roubar
    if (!appliesOnly) runAnyHit(ctx);
    runWeaponHit(ctx);
    if (h === 0) {
      for (const effect of effectsOf(item, "attack")) {
        ATTACK_EFFECTS[effect.type]?.(effect, item, ctx);
      }
    }
  }

  if (!appliesOnly) {
    log(t("log.attack", { item: item.name, damage: totalDmg, target: enemyName(target) }), "dmg");
  }
  const element = item.dmgType || "physical";
  if (effectiveResist(target, element, item.id) < 1) sound("hit", element);
  emit("attack", {
    x: p.x,
    y: p.y,
    itemId: item.id,
    element,
    hits,
    targetX: target.x,
    targetY: target.y,
  });
  p.anim = PLAYER_ATTACK_ANIMS.has(item.anim) ? item.anim : "slash";
  spawnEffect(item.fx || "slash", target.x, target.y - 20, {
    life: 35,
    color: item.fxColor,
  });

  if (!extra) {
    for (const { item: owner, effect } of ownedEffects("anyAttack")) {
      ANY_ATTACK_EFFECTS[effect.type]?.(effect, owner, ctx);
    }
    if (ctx.wantExtra && target.hp > 0) {
      log(t("log.extraAttack", { icon: ctx.wantExtra.icon, item: ctx.wantExtra.name }), "item");
      ctx.refund += weaponAttack(item, target, { extra: true });
    }
  }
  return ctx.refund;
}

// Arco do Caçador Fantasma: uma flecha em cada inimigo da linha de trás (duas por alvo a partir
// do N3). A primeira é o ataque da arma; as outras saem como ataques extras. No N5 cada abate
// na linha de trás devolve 1 s de recarga. Devolve a recarga devolvida, ou null sem alvos.
function rearVolley(item, echo) {
  const p = state.player;
  const rear = livingEnemies()
    .filter(isRear)
    .sort((a, b) => Math.abs(b.x - p.x) - Math.abs(a.x - p.x));
  if (rear.length === 0) return null;
  const arrows = effectsOf(item, "passive")
    .filter((e) => e.type === "extraArrows")
    .reduce((n, e) => n + e.arrows * effectCount(item, e), 1);
  const refundMs = effectsOf(item, "passive").find((e) => e.type === "rearRefund")?.ms || 0;
  let refund = 0;
  let first = true;
  for (const en of rear) {
    for (let a = 0; a < arrows && en.hp > 0; a++) {
      refund += weaponAttack(item, en, first && !echo ? null : { extra: true });
      first = false;
    }
    if (refundMs && en.hp <= 0) refund += refundMs;
  }
  return refund;
}

// echo: repetição da Pedra de Eco. Não mexe na recarga do item, nas estatísticas de uso nem
// no "último item ativado"; o ataque de arma sai como ataque extra.
export function activateItem(item, { echo = false } = {}) {
  const p = state.player;
  // Inimigo com vida 0 ainda não foi marcado como morto (isso é no updateEnemies)
  const enemies = state.enemies.filter((e) => !e.dead && e.hp > 0);
  if (enemies.length === 0) return false;
  // Alvo: inimigo mais próximo do jogador (a Besta Longa mira o mais distante)
  const far = item.targeting === "farthest";
  const dist = (e) => Math.abs(e.x - p.x);
  const target = enemies.reduce((best, en) =>
    (far ? dist(en) > dist(best) : dist(en) < dist(best)) ? en : best,
  );

  let activated = false;
  // Recarga devolvida por encantamentos; aplicada depois de zerar o timer
  let cooldownRefund = 0;

  if (item.type === "weapon" && item.targeting === "rear") {
    // Arco do Caçador Fantasma: dispara em toda a linha de trás; sem ninguém lá, não gasta a recarga
    const refund = rearVolley(item, echo);
    if (refund === null) return false;
    cooldownRefund = refund;
    activated = true;
  } else if (item.type === "weapon") {
    cooldownRefund = weaponAttack(item, target, echo ? { extra: true } : null);
    activated = true;
  } else {
    for (const effect of effectsOf(item, "use")) {
      const handler = USE_EFFECTS[effect.type];
      if (!handler) continue;
      if (handler(effect, item, p) === false) continue; // nada a fazer: não gasta a recarga
      sound("use", effect.type);
      emit("itemUse", { x: p.x, y: p.y, effect: effect.type });
      activated = true;
    }
  }

  if (activated && !echo) {
    p.animTimer = ANIM_MS.playerAction;
    state.runStats.itemUses[item.id] =
      (state.runStats.itemUses[item.id] || 0) + 1;
    // A Pedra de Eco repete armas e relíquias; ela mesma e as armaduras não contam
    if (item.type !== "armor" && !effectsOf(item, "use").some((e) => e.type === "echo")) {
      p.lastActivated = item.id;
    }
    emit("itemUsed", item.id);
    const timer = state.itemTimers[item.id];
    if (timer) timer.elapsed = Math.min(timer.cooldown, cooldownRefund);
  }
  return activated;
}

// Avança as recargas e usa os itens prontos
export function updateItemTimers(dt) {
  const p = state.player;
  const hasEnemies = state.enemies.some((e) => !e.dead);
  for (const item of state.items) {
    if (!isActivatable(item)) continue;
    const timer = state.itemTimers[item.id];
    // Armas recarregam mais rápido com as Botas e enquanto o Frenesi dura
    let speed =
      item.type === "weapon"
        ? 1 + (p.weaponSpeed || 0) + (p.berserking ? p.berserkSpeed : 0)
        : 1;
    // Vida baixa acelera a recarga do próprio item (Cristal Vital N5)
    const haste = effectsOf(item, "passive").find((e) => e.type === "lowHpHaste");
    if (haste && p.hp / p.maxHp < haste.threshold) speed *= haste.factor;
    if (timer.elapsed < timer.cooldown) {
      timer.elapsed += dt * speed;
    }
    if (!hasEnemies) continue;

    // Gatilho de vida baixa (ex.: Totem): usa o item na hora, uma vez por onda
    const lowHp = effectsOf(item, "lowHp").find(
      (e) => e.type === "useNow" && p.hp / p.maxHp < e.threshold,
    );
    if (lowHp && !p.lowHpUsed[item.id]) {
      p.lowHpUsed[item.id] = true;
      activateItem(item);
      continue;
    }

    if (timer.elapsed >= timer.cooldown) {
      activateItem(item);
    }
  }
}

// Regeneração (Couraça de Batalha): cura inteira a cada segundo de jogo
export function updateRegen(dt) {
  const p = state.player;
  const amount = Math.round(p.regen || 0);
  if (amount <= 0 || p.hp <= 0 || p.hp >= p.maxHp) {
    p.regenTimer = 0;
    return;
  }
  p.regenTimer += dt;
  while (p.regenTimer >= 1000) {
    p.regenTimer -= 1000;
    const healed = Math.min(amount, p.maxHp - p.hp);
    if (healed <= 0) break;
    p.hp += healed;
    spawnNumber(p.x, p.y - 60, `+${healed}`, "#44cc88", 2);
  }
}
// Frenesi conta em tempo de jogo: para na pausa e acelera com 2×/3×
export function updateFrenzy(dt) {
  const p = state.player;
  if (!p.berserking) return;
  p.berserkRemaining -= dt;
  if (p.berserkRemaining <= 0) {
    p.berserking = false;
    p.berserkRemaining = 0;
    p.anim = "idle";
    log(t("log.frenzyEnd"), "item");
  }
}

export function updatePlayerAnim(dt) {
  const p = state.player;
  if (p.animTimer > 0) {
    p.animTimer -= dt;
  } else if (p.anim !== "idle" && !p.berserking) {
    p.anim = "idle";
  }
}

// ═══════════════════════════════════════════
//  ENEMY ATTACKS PLAYER
// ═══════════════════════════════════════════
// Devolve o resultado: "dodged" | "blocked" | "hit" (dano em HP)
export function enemyAttack(en) {
  const p = state.player;
  let dmg = Math.round(en.dmg * enemyDamageMult(en));
  en.attackAnim = ANIM_MS.enemyAttack;

  // Esquiva (antes do bloqueio): sem dano e sem gastar o escudo
  if (p.evasion > 0 && random() < p.evasion) {
    spawnEffect("text", p.x, p.y - 60, { life: 30, text: t("float.dodge"), color: "#aaddff" });
    log(t("log.dodge", { enemy: enemyName(en) }), "item");
    sound("dodge");
    emit("dodge", { x: p.x, y: p.y });
    for (const { item, effect } of ownedEffects("dodge")) {
      DODGE_EFFECTS[effect.type]?.(effect, item, { enemy: en });
    }
    avoidThorns();
    return "dodged";
  }

  // Block
  if (p.blocksLeft > 0) {
    p.blocksLeft--;
    // Parry: itens com efeito "block" devolvem parte do golpe ao atacante
    const ratio = ownedEffects("block")
      .filter(({ effect }) => effect.type === "reflect")
      .reduce((sum, { item, effect }) => sum + levelValue(item, effect, "ratio"), 0);
    const reflected = Math.round(en.dmg * ratio);
    if (reflected > 0) {
      en.hp -= reflected;
      en.lastHitCrit = false;
      en.hurtTimer = 12;
      log(t("log.parry", { amount: reflected, enemy: enemyName(en) }), "item");
    } else {
      log(t("log.blocked"), "item");
    }
    sound("block");
    spawnEffect("shield", p.x, p.y - 40, { life: 25 });
    emit("blocked", { x: p.x, y: p.y });
    avoidThorns();
    return "blocked";
  }

  // Armadura com retorno decrescente: armadura / (armadura + 100), sem teto
  dmg = Math.max(1, Math.round(dmg * (1 - armorReduction(p.armor)) * (1 - (p.damageReduction || 0))));

  // Dano recebido volta ao atacante (Cota de Malha), espinhos, fogo na Escama Dracônica...
  const hurtCtx = { enemy: en, damage: dmg };
  for (const { item, effect } of ownedEffects("hurt")) {
    HURT_EFFECTS[effect.type]?.(effect, item, hurtCtx);
  }

  p.hp -= dmg;
  sound("enemyHit");
  emit("playerHurt", { x: p.x, y: p.y, damage: dmg });
  spawnNumber(p.x - 20, p.y - 60, `-${dmg}`, "#ff6666", 2);
  log(t("log.enemyAttack", { enemy: enemyName(en), damage: dmg }), "dmg");

  checkPlayerDeath();
  return "hit";
}

// Morte ou renascimento quando a vida do herói chega a 0 (golpes e dano contínuo)
export function checkPlayerDeath() {
  const p = state.player;
  if (state.running && p.hp <= 0) {
    const revive = ownedEffects("death").find(
      ({ effect }) => effect.type === "revive",
    );
    if (revive && !p.reviveUsed) {
      p.reviveUsed = true;
      p.hp = Math.round(p.maxHp * levelValue(revive.item, revive.effect, "hpRatio"));
      // Encantamentos da Pena: zerar recargas (N3), explosão de fogo (N5)
      for (const effect of effectsOf(revive.item, "death")) {
        DEATH_EFFECTS[effect.type]?.(effect, revive.item, p);
      }
      spawnEffect("phoenix", p.x, p.y - 40, { life: 80 });
      sound("revive");
      emit("revive", { x: p.x, y: p.y });
      log(t("log.revive", { icon: revive.item.icon, item: revive.item.name, hp: p.hp }), "kill");
    } else {
      p.hp = 0;
      log(t("log.defeat", { wave: state.wave }), "kill");
      sound("death");
      state.running = false;
      emit("playerDied");
    }
  }
}

// ═══════════════════════════════════════════
//  ENEMY MOVEMENT, ATTACK & DEATH
// ═══════════════════════════════════════════
export function updateEnemies(dt) {
  const playerX = state.player.x;
  state.enemies.forEach((en) => {
    if (en.attackAnim > 0) en.attackAnim = Math.max(0, en.attackAnim - dt);
    if (en.judged && (en.judged.ms -= dt) <= 0) en.judged = null;
    if (en.dead) {
      if (en.deathAnim > 0) en.deathAnim = Math.max(0, en.deathAnim - dt);
      return;
    }
    const dist = en.x - playerX;
    const combatDist = 80;

    if (en.frozen > 0) {
      // Congelado: não anda e o tempo de ataque não avança
      en.frozen = Math.max(0, en.frozen - dt);
    } else if (dist > combatDist && en.moving) {
      en.x -= en.speed * dt * 0.06 * slowFactor(en);
    } else {
      en.moving = false;
      en.atkTimer = (en.atkTimer || 0) + dt * slowFactor(en); // frio atrasa o ataque
      if (en.atkTimer >= en.atkInterval) {
        en.atkTimer = 0;
        enemyAttack(en);
      }
    }

    // Kill check
    if (en.hp <= 0 && !en.dead) {
      en.dead = true;
      en.deathAnim = ANIM_MS.enemyDeath;
      state.kills++;
      state.score += en.xp;
      state.fragments += en.fragments || 1;
      sound("kill");
      spawnEffect("death", en.x, en.y - 30, { life: 50 });
      emit("enemyDied", { x: en.x, y: en.y, size: en.size });
      spawnNumber(en.x, en.y - 50, `+${en.xp} XP`, "#c9a84c", 3);
      if (en.fragments > 0) {
        spawnNumber(en.x - 20, en.y - 65, `⚡${en.fragments}`, "#aa66ee", 2);
      }
      log(t("log.enemyKilled", { enemy: enemyName(en), count: en.fragments || 1 }), "kill");
      for (const { item, effect } of ownedEffects("kill")) {
        KILL_EFFECTS[effect.type]?.(effect, item, en);
      }
      addEvolutionKill(); // formas evoluídas ganham progresso de nível
    }
  });
}
