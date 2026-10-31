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
//   "freeze"      inimigo congelado (enemy.frozen = ms restantes)
//   "explode"     explosão (Armadura Cristalina, Núcleo Explosivo): kind "ice" | "fire"
//   "spread"      queimadura passou de um inimigo morto a outros: from {x,y}, to [{x,y}]
// Sons: sound(nome, detalhe) -> "hit" + elemento, "use" + tipo do efeito, "dot" + tipo,
// além de "crit", "dodge", "freeze" e "explode".
import { state } from "./state.js";
import { random } from "./random.js";
import { emit, log, sound } from "./events.js";
import { spawnEffect, spawnNumber } from "./fx.js";
import { t, formatNumber } from "./i18n.js";
import { enemyName } from "./waves.js";
import {
  effectsOf,
  ownedEffects,
  isActivatable,
  levelMultiplier,
  itemLevel,
} from "./items.js";

// Redução máxima de dano pela armadura (%): com Guarda sem teto, nada fica imune
export const MAX_ARMOR = 75;

// Golpe crítico: a chance base está em PLAYER_BASE.critChance
export const CRIT_MULT = 1.5;

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
};

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

// itemId: item do jogador que causou o dano (crédito); sem ele, só source "player" soma ao total
export function applyElementalDamage(target, baseDmg, element, source, crit = false, itemId = null) {
  if (!target.resist) target.resist = {};
  const resist = target.resist[element] || 0;
  target.lastHitCrit = !!crit; // quem mata paga Moeda da Fortuna só se este golpe foi crítico
  const finalDmg = Math.max(1, Math.round(baseDmg * (1 - resist)));

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
// maxStacks: teto de stacks (a queimadura depende do nível do item; o veneno não tem teto).
export const DEFAULT_MAX_STACKS = 5;

export function applyDot(
  target,
  type,
  damage,
  duration,
  stackable = true,
  { maxStacks = DEFAULT_MAX_STACKS, base = 0, sourceId = null } = {},
) {
  if (!target.dots) target.dots = [];

  // Stack or refresh
  const existing = target.dots.find((d) => d.type === type);
  if (existing && stackable) {
    existing.stacks = Math.min(maxStacks, existing.stacks + 1);
    existing.duration = duration;
    existing.fullDuration = duration; // o contágio renova a duração com este valor
    existing.damage = damage;
    existing.base = base;
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
      duration,
      fullDuration: duration,
      maxStacks,
      stacks: 1,
      tickTimer: 0,
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

export function processDots(dt) {
  [...state.enemies, state.player].forEach((entity) => {
    if (!entity.dots || entity.dead || entity.hp <= 0) return;

    entity.dots = entity.dots.filter((dot) => {
      dot.tickTimer += dt;

      if (dot.tickTimer >= 1000) {
        dot.tickTimer = 0;
        const dmg = Math.round((dot.base || 0) + dot.damage * dot.stacks);
        entity.hp -= dmg;
        entity.hurtTimer = 8;
        entity.lastHitCrit = false; // abate por dano contínuo não conta como crítico
        if (entity !== state.player) creditDamage(dot.sourceId, dmg);
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

        dot.duration--;
      }

      // Quem morreu neste tick mantém o dot: o Coração de Brasa lê a queimadura no abate
      return dot.duration > 0 || entity.hp <= 0;
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

// trigger "hit": a cada golpe de arma. ctx = { target, damage, refund }
const HIT_EFFECTS = {
  dot(effect, item, ctx) {
    if (!rolls(effect)) return;
    // O nível não aumenta o dano por stack (fixo por item): ele aumenta o teto de stacks
    // da queimadura e o dano base do veneno. O bônus permanente vale para tudo.
    const level = itemLevel(item.id);
    const perm = permanentDamage();
    const damage = effect.damage * perm;
    const base = ((effect.base || 0) + (effect.basePerLevel || 0) * (level - 1)) * perm;
    const maxStacks =
      effect.maxStacks == null
        ? Infinity
        : effect.maxStacks + (effect.maxStacksPerLevel || 0) * (level - 1);
    applyDot(ctx.target, effect.dot, damage, effect.duration, true, {
      maxStacks,
      base,
      sourceId: item.id,
    });
    const dot = DOTS[effect.dot];
    log(
      t("log.dot", {
        icon: dot?.icon || "✨",
        target: enemyName(ctx.target),
        verb: t(dot ? `dot.${effect.dot}` : "dot.generic"),
      }),
      "dmg",
    );
  },
  cooldownRefund(effect, item, ctx) {
    if (!rolls(effect)) return;
    ctx.refund += effect.ms;
    log(t("log.cooldownRefund", { icon: item.icon, item: item.name }), "item");
  },
  freeze(effect, item, ctx) {
    if (!rolls(effect)) return;
    freezeEnemy(ctx.target, effect.duration);
    log(t("log.freeze", { target: enemyName(ctx.target), seconds: formatNumber(effect.duration / 1000) }), "item");
  },
  // heal com onCrit só vale quando o golpe foi crítico
  heal(effect, item, ctx) {
    if (effect.onCrit && !ctx.crit) return;
    healPlayer(Math.round(effect.amount * levelMultiplier(item.id)), item);
  },
  lifesteal(effect, item, ctx) {
    healPlayer(Math.round(ctx.dealt * effect.ratio * levelMultiplier(item.id)), item);
  },
  // Respingo: cada golpe também fere os vizinhos do alvo. Sem crítico e sem efeitos de
  // golpe da arma nos vizinhos (é dano de área); abates contam para os gatilhos de abate.
  splash(effect, item, ctx) {
    const near = enemiesWithin(ctx.target.x, effect.radius, ctx.target);
    if (near.length === 0) return;
    const damage = Math.round(ctx.damage * effect.ratio);
    for (const en of near) {
      applyElementalDamage(en, damage, item.dmgType || "physical", "player", false, item.id);
    }
    log(t("log.splash", { icon: item.icon, item: item.name, count: near.length, damage }), "dmg");
  },
};

// trigger "anyHit": a cada golpe de arma, de qualquer item possuído
const ANY_HIT_EFFECTS = {
  // Abaixo do limite de vida o roubo sobe (lowHpRatio)
  lifesteal(effect, item, ctx) {
    const p = state.player;
    const low = effect.lowHpRatio && p.hp / p.maxHp < effect.threshold;
    const ratio = (low ? effect.lowHpRatio : effect.ratio) * levelMultiplier(item.id);
    healPlayer(Math.round(ctx.dealt * ratio), item);
  },
};

// trigger "anyAttack": a cada ataque de arma completo, de qualquer item possuído
const ANY_ATTACK_EFFECTS = {
  // A cada N ataques, a arma que atacou recarrega na hora
  sprint(effect, item, ctx) {
    const counters = state.player.counters;
    counters.sprint = (counters.sprint || 0) + 1;
    if (counters.sprint % effect.every !== 0) return;
    ctx.refund = Infinity;
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
  // Contágio: a queimadura de quem morreu passa aos N vivos mais próximos (N = nível).
  // Todo abate (golpe, dano contínuo, explosão, reflexo, espinhos) passa pelo teste de
  // morte do updateEnemies, que chama este gatilho; por isso o contágio pega todos.
  spread(effect, item, en) {
    spreadBurn(en, itemLevel(item.id), item);
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
    p.pactBonus = Math.min(effect.max, (p.pactBonus || 0) + effect.bonus);
  },
};

// trigger "attack": uma vez por ataque, depois do primeiro golpe
const ATTACK_EFFECTS = {
  chain(effect, item, ctx) {
    const others = state.enemies
      .filter((e) => !e.dead && e !== ctx.target)
      .slice(0, effect.targets);
    others.forEach((en) => {
      applyElementalDamage(
        en,
        Math.round(ctx.damage * effect.ratio),
        effect.element,
        "player",
        false,
        item.id,
      );
      spawnEffect("lightning", en.x, en.y - 20, {
        life: 25,
        color: "#66aaff",
      });
    });
    if (others.length > 0) {
      log(t("log.chain", { count: others.length }), "item");
    }
  },
  // Atinge todos os outros inimigos vivos com o dano base do golpe (sem crítico)
  hitAll(effect, item, ctx) {
    const others = livingEnemies().filter((e) => e !== ctx.target);
    if (others.length === 0) return;
    const damage = Math.round(ctx.damage * effect.ratio);
    for (const en of others) {
      applyElementalDamage(en, damage, item.dmgType || "physical", "player", false, item.id);
      spawnEffect("lightning", en.x, en.y - 20, { life: 25, color: "#ffe27a" });
    }
    log(t("log.hitAll", { icon: item.icon, item: item.name, count: others.length, damage }), "item");
  },
  // Adianta a recarga dos outros itens (não do próprio)
  cooldownOthers(effect, item, ctx) {
    if (ctx.extra) return;
    for (const other of state.items) {
      const timer = state.itemTimers[other.id];
      if (other.id === item.id || !timer) continue;
      timer.elapsed = Math.min(timer.cooldown, timer.elapsed + effect.ms);
    }
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
    p.tide.stacks = Math.min(effect.max, p.tide.stacks + 1);
  },
};

// Passa a queimadura de `dead` aos `count` inimigos vivos mais próximos dele. Cada alvo
// fica com o maior número de stacks entre o dele e o do morto, e a duração é renovada.
// Os alvos que também morrerem queimando espalham de novo (cadeia).
function spreadBurn(dead, count, item) {
  const burn = (dead.dots || []).find((d) => d.type === "burning");
  if (!burn) return;
  const targets = livingEnemies()
    .filter((e) => e !== dead)
    .map((e) => ({ e, dist: Math.hypot(e.x - dead.x, e.y - dead.y) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, count)
    .map((o) => o.e);
  if (targets.length === 0) return;
  for (const en of targets) {
    if (!en.dots) en.dots = [];
    const own = en.dots.find((d) => d.type === "burning");
    const fullDuration = burn.fullDuration ?? burn.duration;
    if (own) {
      own.stacks = Math.max(own.stacks, burn.stacks);
      own.damage = Math.max(own.damage, burn.damage);
      own.maxStacks = Math.max(own.maxStacks ?? 0, burn.maxStacks ?? 0);
      own.duration = fullDuration;
      own.fullDuration = fullDuration;
    } else {
      en.dots.push({
        type: "burning",
        damage: burn.damage,
        base: 0,
        duration: fullDuration,
        fullDuration,
        maxStacks: burn.maxStacks,
        stacks: burn.stacks,
        tickTimer: 0,
        sourceId: burn.sourceId, // a arma original continua levando o crédito
      });
    }
    spawnEffect("text", en.x, en.y - 50, { life: 40, text: DOTS.burning.icon, color: "#ff6600" });
  }
  sound("spread");
  emit("spread", {
    from: { x: dead.x, y: dead.y },
    to: targets.map((e) => ({ x: e.x, y: e.y })),
  });
  log(
    t("log.spread", { icon: item.icon, item: item.name, count: targets.length, stacks: burn.stacks }),
    "item",
  );
}

// trigger "use": itens que não são armas, quando a recarga fica pronta
const USE_EFFECTS = {
  // Explosão em volta do herói: dano fixo (cresce com o nível) em todos no raio
  blast(effect, item, p) {
    const damage = Math.round(effect.damage * levelMultiplier(item.id) * permanentDamage());
    const near = enemiesWithin(p.x, effect.radius);
    // Sem ninguém no alcance não explode: a recarga fica pronta para quando houver alvo
    if (near.length === 0) return false;
    for (const en of near) applyElementalDamage(en, damage, effect.element, "player", false, item.id);
    spawnEffect("dragon_roar", p.x, p.y - 30, { life: 40 });
    sound("explode");
    emit("explode", { x: p.x, y: p.y, kind: "fire", radius: effect.radius });
    log(t("log.blast", { icon: item.icon, item: item.name, damage, count: near.length }), "item");
    p.anim = "berserk";
  },
  blockNext(effect, item, p) {
    p.nextBlockActive = true;
    spawnEffect("shield", p.x, p.y - 40, { life: 40 });
    log(t("log.blockNext", { icon: item.icon, item: item.name }), "item");
    p.anim = "block";
  },
  barrier(effect, item, p) {
    const amount = Math.round(effect.amount * levelMultiplier(item.id));
    // Nova barreira só vale se for maior que a atual; quem a criou guarda a origem
    if (amount >= p.barrier) {
      p.barrier = amount;
      p.barrierSource = item.id;
      spawnEffect("dragon_roar", p.x, p.y - 40, { life: 50 });
      log(t("log.barrier", { icon: item.icon, item: item.name, amount }), "item");
    } else {
      log(t("log.barrierKept", { icon: item.icon, item: item.name }), "item");
    }
    p.anim = "berserk";
  },
  heal(effect, item, p) {
    const charges = (p.charges[item.id] || 0) + 1;
    p.charges[item.id] = charges;
    const bonus = effect.bonusEvery
      ? Math.floor(charges / effect.bonusEvery) * effect.bonusAmount
      : 0;
    const healAmt = Math.round(
      (effect.amount + bonus) * levelMultiplier(item.id),
    );
    p.hp = Math.min(p.maxHp, p.hp + healAmt);
    spawnEffect("heal", p.x, p.y - 50, { life: 45 });
    spawnNumber(p.x, p.y - 60, `+${healAmt}`, "#44cc88", 2);
    log(t("log.heal", { icon: item.icon, item: item.name, amount: healAmt }), "heal");
    p.anim = "heal";
  },
  mana(effect, item, p) {
    const overflow = p.mana >= p.maxMana;
    const amount = Math.round(effect.amount * levelMultiplier(item.id));
    p.mana = Math.min(p.maxMana, p.mana + amount);
    spawnEffect("mana_orb", p.x, p.y - 50, { life: 35 });
    if (overflow && effect.overflowBonus) {
      p.manaOverflow = effect.overflowBonus;
      log(
        t("log.overflow", {
          icon: item.icon,
          item: item.name,
          percent: Math.round(effect.overflowBonus * 100),
        }),
        "item",
      );
    } else {
      log(t("log.mana", { icon: item.icon, item: item.name, amount }), "item");
    }
    p.anim = "heal";
  },
  frenzy(effect, item, p) {
    p.berserking = true;
    const duration = Math.round(effect.duration * levelMultiplier(item.id));
    p.berserkRemaining = duration;
    p.berserkSpeed = effect.speedBonus;
    spawnEffect("berserk", p.x, p.y - 40, { life: 60 });
    log(t("log.frenzy", { icon: item.icon, item: item.name, seconds: formatNumber(duration / 1000) }), "item");
    p.anim = "berserk";
  },
};

// trigger "barrierBreak": a barreira criada pelo item chegou a 0 absorvendo dano
const BARRIER_BREAK_EFFECTS = {
  explode(effect, item, p) {
    const damage = Math.round(effect.damage * levelMultiplier(item.id) * permanentDamage());
    for (const en of state.enemies.filter((e) => !e.dead && e.hp > 0)) {
      applyElementalDamage(en, damage, effect.element, "player", false, item.id);
      if (effect.freeze) freezeEnemy(en, effect.freeze, true);
    }
    if (effect.freeze) {
      sound("freeze");
      emit("freeze", { x: p.x, y: p.y });
    }
    spawnEffect("dragon_roar", p.x, p.y - 30, { life: 40 });
    sound("explode");
    emit("explode", { x: p.x, y: p.y });
    log(t("log.barrierBurst", { icon: item.icon, item: item.name, damage }), "item");
  },
};

// trigger "dodge": quando o herói esquiva
const DODGE_EFFECTS = {
  empowerNext(effect, item) {
    state.player.empowered = Math.max(state.player.empowered || 0, effect.bonus);
    log(
      t("log.nextBonus", { icon: item.icon, item: item.name, percent: Math.round(effect.bonus * 100) }),
      "item",
    );
  },
};

// trigger "hurt": ao tomar dano de HP. ctx = { enemy, damage }
const HURT_EFFECTS = {
  manaFromDamage(effect, item, ctx) {
    const p = state.player;
    const manaAbsorb = Math.round(ctx.damage * effect.ratio * levelMultiplier(item.id));
    p.mana = Math.min(p.maxMana, p.mana + manaAbsorb);
    if (manaAbsorb > 0)
      log(t("log.manaAbsorb", { icon: item.icon, item: item.name, amount: manaAbsorb }), "item");
  },
  // Espinhos: só chega aqui quando o golpe tirou HP (esquiva, bloqueio e barreira
  // que absorve tudo retornam antes). Fere todos os vivos ao alcance do herói.
  thorns(effect, item) {
    const p = state.player;
    const near = enemiesWithin(p.x, effect.radius);
    if (near.length === 0) return;
    const damage = Math.round(effect.damage * levelMultiplier(item.id) * permanentDamage());
    for (const en of near) {
      applyElementalDamage(en, damage, "physical", "thorns", false, item.id);
      spawnEffect("text", en.x, en.y - 60, { life: 30, text: "🌵", color: "#66aa44" });
    }
    log(t("log.thorns", { icon: item.icon, item: item.name, count: near.length, damage }), "item");
  },
  // Devolve parte do dano recebido ao atacante
  reflect(effect, item, ctx) {
    if (!rolls(effect)) return;
    const reflected = Math.round(ctx.damage * effect.ratio * levelMultiplier(item.id));
    if (reflected <= 0) return;
    applyElementalDamage(ctx.enemy, reflected, "physical", "reflect");
    log(
      t("log.reflect", { icon: item.icon, item: item.name, amount: reflected, enemy: enemyName(ctx.enemy) }),
      "item",
    );
  },
};

function healPlayer(amount, item) {
  const p = state.player;
  const healed = Math.min(amount, p.maxHp - p.hp);
  if (healed <= 0) return;
  p.hp += healed;
  spawnNumber(p.x, p.y - 60, `+${healed}`, "#44cc88", 2);
  log(t("log.hpGain", { icon: item.icon, item: item.name, amount: healed }), "heal");
}

// Congelado: o inimigo não anda nem ataca por `ms` de tempo de jogo
// quiet: o chamador avisa som e evento uma vez só (explosão em vários inimigos)
function freezeEnemy(en, ms, quiet = false) {
  en.frozen = Math.max(en.frozen || 0, ms);
  spawnEffect("text", en.x, en.y - 60, { life: 30, text: "❄️", color: "#88ddff" });
  if (quiet) return;
  sound("freeze");
  emit("freeze", { x: en.x, y: en.y });
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
  barrierBreak: Object.keys(BARRIER_BREAK_EFFECTS),
  use: Object.keys(USE_EFFECTS),
  passive: ["stats"],
  damage: ["lowHpBonus"],
  block: ["reflect"],
  barrierAbsorb: ["reflect"],
  hurt: Object.keys(HURT_EFFECTS),
  death: ["revive"],
  lowHp: ["useNow"],
};

// ═══════════════════════════════════════════
//  ITEM ACTIVATION LOGIC
// ═══════════════════════════════════════════
// Dano de um golpe. Ordem: base × nível × (bônus de dano), modificadores do ataque,
// transbordamento e vida baixa, e por fim o crítico. Devolve { dmg, crit }.
function attackDamage(item, ctx, firstHit) {
  const p = state.player;
  let dmg = Math.round(
    (item.baseDmg + (item.bonusDmg || 0)) *
      levelMultiplier(item.id) *
      permanentDamage(),
  );
  // Tempestade, Maré, Colheita e Fuga (calculados uma vez por ataque)
  dmg = Math.round((dmg + ctx.flat) * ctx.mult);
  // Transbordamento de mana: bônus só no primeiro golpe
  if (p.manaOverflow) {
    dmg = Math.round(dmg * (1 + p.manaOverflow));
    if (firstHit) {
      log(t("log.overflowHit", { percent: Math.round(p.manaOverflow * 100) }), "item");
    }
    p.manaOverflow = 0;
  }
  // Bônus de dano com vida baixa (ex.: Escama Dracônica)
  for (const { item: owner, effect } of ownedEffects("damage")) {
    if (effect.type === "lowHpBonus" && p.hp / p.maxHp < effect.threshold) {
      dmg = Math.round(dmg * (1 + effect.bonus * levelMultiplier(owner.id)));
    }
  }
  const crit = random() < (p.critChance || 0);
  const base = dmg; // sem o crítico: é o que o Relâmpago em cadeia repassa
  if (crit) dmg = Math.round(dmg * CRIT_MULT);
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
    wantExtra: false,
  };
  if (extra) return ctx;
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

// extra: objeto quando é o ataque extra da Moeda: ataque comum, sem bônus de uso único
// (Colheita, Tempestade, Fuga, Maré) e sem contar para Sprint nem gerar outro extra
function weaponAttack(item, target, extra = null) {
  const p = state.player;
  const hits = item.hits || 1;
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
      : attackDamage(item, ctx, h === 0);
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
    if (!appliesOnly) {
      for (const { item: owner, effect } of ownedEffects("anyHit")) {
        ANY_HIT_EFFECTS[effect.type]?.(effect, owner, ctx);
      }
    }
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
  sound("hit", element);
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

export function activateItem(item) {
  const p = state.player;
  // Inimigo com vida 0 ainda não foi marcado como morto (isso é no updateEnemies)
  const enemies = state.enemies.filter((e) => !e.dead && e.hp > 0);
  if (enemies.length === 0) return false;
  // Alvo: inimigo mais próximo do jogador
  const target = enemies.reduce((closest, en) =>
    Math.abs(en.x - p.x) < Math.abs(closest.x - p.x) ? en : closest,
  );

  let activated = false;
  // Recarga devolvida por encantamentos; aplicada depois de zerar o timer
  let cooldownRefund = 0;

  if (item.type === "weapon") {
    cooldownRefund = weaponAttack(item, target);
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

  if (activated) {
    p.animTimer = ANIM_MS.playerAction;
    state.runStats.itemUses[item.id] =
      (state.runStats.itemUses[item.id] || 0) + 1;
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
    const speed =
      item.type === "weapon"
        ? 1 + (p.weaponSpeed || 0) + (p.berserking ? p.berserkSpeed : 0)
        : 1;
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
// Devolve o resultado: "dodged" | "blocked" | "absorbed" (barreira) | "hit" (dano em HP)
export function enemyAttack(en) {
  const p = state.player;
  let dmg = en.dmg;
  en.attackAnim = ANIM_MS.enemyAttack;

  // Esquiva (antes do bloqueio): sem dano e sem gastar o escudo
  if (p.evasion > 0 && random() < p.evasion) {
    spawnEffect("text", p.x, p.y - 60, { life: 30, text: t("float.dodge"), color: "#aaddff" });
    log(t("log.dodge", { enemy: enemyName(en) }), "item");
    sound("dodge");
    emit("dodge", { x: p.x, y: p.y });
    for (const { item, effect } of ownedEffects("dodge")) {
      DODGE_EFFECTS[effect.type]?.(effect, item, p);
    }
    return "dodged";
  }

  // Block
  if (p.nextBlockActive) {
    p.nextBlockActive = false;
    // Parry: itens com efeito "block" refletem dano
    const reflected = ownedEffects("block")
      .filter(({ effect }) => effect.type === "reflect")
      .reduce(
        (sum, { item, effect }) =>
          sum + Math.round(effect.damage * levelMultiplier(item.id)),
        0,
      );
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
    return "blocked";
  }

  // Barrier
  if (p.barrier > 0) {
    const absorbed = Math.min(dmg, p.barrier);
    p.barrier -= absorbed;
    const broke = p.barrier <= 0;
    const ratio = ownedEffects("barrierAbsorb")
      .filter(({ effect }) => effect.type === "reflect")
      .reduce((sum, { item, effect }) => sum + effect.ratio * levelMultiplier(item.id), 0);
    const reflected = Math.round(absorbed * ratio);
    en.hp -= reflected;
    if (reflected > 0) en.lastHitCrit = false;
    dmg -= absorbed;
    if (reflected > 0)
      log(t("log.barrierReflect", { amount: reflected, enemy: enemyName(en) }), "item");
    if (broke) breakBarrier(p);
    if (dmg <= 0) {
      log(t("log.barrierAbsorb"), "item");
      return "absorbed";
    }
  }

  // Armor reduction
  // Armadura reduz até MAX_ARMOR% (melhoria Guarda não tem teto de nível)
  dmg = Math.max(1, Math.round(dmg * (1 - Math.min(p.armor, MAX_ARMOR) / 100)));

  // Dano recebido vira mana (Manto do Arcano) ou volta ao atacante (Cota de Malha)
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

// A barreira chegou a 0 absorvendo dano: o item que a criou pode reagir (explosão)
function breakBarrier(p) {
  const source = state.items.find((i) => i.id === p.barrierSource);
  p.barrierSource = null;
  if (!source) return;
  for (const effect of effectsOf(source, "barrierBreak")) {
    BARRIER_BREAK_EFFECTS[effect.type]?.(effect, source, p);
  }
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
      p.hp = Math.round(p.maxHp * revive.effect.hpRatio);
      if (revive.effect.resetCooldowns) {
        Object.values(state.itemTimers).forEach((timer) => {
          timer.elapsed = timer.cooldown;
        });
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
      en.x -= en.speed * dt * 0.06;
    } else {
      en.moving = false;
      en.atkTimer = (en.atkTimer || 0) + dt;
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
    }
  });
}
