// ═══════════════════════════════════════════
//  COMBATE: dano, efeitos de itens, inimigos
// ═══════════════════════════════════════════
// Sem DOM: mensagens, sons e o destaque do item usado saem por events.js.
import { state } from "./state.js";
import { random } from "./random.js";
import { emit, log, sound } from "./events.js";
import { spawnEffect, spawnNumber } from "./fx.js";
import { effectsOf, ownedEffects, isActivatable } from "./items.js";

// Animações de ataque que o render.js sabe desenhar; as outras viram "slash"
const PLAYER_ATTACK_ANIMS = new Set([
  "slash",
  "fire_slash",
  "double_slash",
  "lightning",
]);

const DOTS = {
  burning: { icon: "🔥", verb: "está queimando", color: "#ff8800" },
  poison: { icon: "☠️", verb: "está envenenado", color: "#88ff00" },
  bleeding: { icon: "💉", verb: "está sangrando", color: "#ff0000" },
};

function rolls(effect) {
  return random() < (effect.chance ?? 1);
}

// ═══════════════════════════════════════════
//  ELEMENTAL & DOT SYSTEM
// ═══════════════════════════════════════════
export function applyElementalDamage(target, baseDmg, element, source) {
  if (!target.resist) target.resist = {};
  const resist = target.resist[element] || 0;
  const finalDmg = Math.max(1, Math.round(baseDmg * (1 - resist)));

  target.hp -= finalDmg;
  target.hurtTimer = 15;
  if (source === "player") state.runStats.totalDamage += finalDmg;

  // Visual feedback based on resistance
  let color = "#ff4444";
  if (resist > 0.3)
    color = "#888888"; // Resisted
  else if (resist < -0.1) color = "#ffaa22"; // Weak to element

  spawnNumber(
    target.x,
    target.y - 40,
    `-${finalDmg}`,
    color,
    resist < -0.1 ? 5 : 4,
  );

  // Show resistance feedback
  if (resist > 0.3) {
    spawnEffect("text", target.x, target.y - 60, {
      life: 30,
      text: "RESISTIDO",
      color: "#888888",
    });
  } else if (resist < -0.1) {
    spawnEffect("text", target.x, target.y - 60, {
      life: 30,
      text: "FRACO!",
      color: "#ffaa22",
    });
  }

  return finalDmg;
}

export function applyDot(target, type, damage, duration, stackable = true) {
  if (!target.dots) target.dots = [];

  // Stack or refresh
  const existing = target.dots.find((d) => d.type === type);
  if (existing && stackable) {
    existing.stacks = Math.min(5, existing.stacks + 1);
    existing.duration = duration;
    existing.damage = damage;
  } else if (existing) {
    existing.duration = duration;
  } else {
    target.dots.push({ type, damage, duration, stacks: 1, tickTimer: 0 });
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
        const dmg = Math.round(dot.damage * dot.stacks);
        entity.hp -= dmg;
        entity.hurtTimer = 8;
        spawnNumber(
          entity.x,
          entity.y - 30,
          `-${dmg}`,
          DOTS[dot.type]?.color || "#ff8800",
          0,
        );

        dot.duration--;
      }

      return dot.duration > 0;
    });
  });
}

// ═══════════════════════════════════════════
//  EFEITOS DOS ITENS (um handler por "type" do items.json)
// ═══════════════════════════════════════════

// trigger "hit": a cada golpe de arma. ctx = { target, damage, refund }
const HIT_EFFECTS = {
  dot(effect, item, ctx) {
    if (!rolls(effect)) return;
    applyDot(ctx.target, effect.dot, effect.damage, effect.duration, true);
    const dot = DOTS[effect.dot];
    log(
      `${dot?.icon || "✨"} ${ctx.target.name} ${dot?.verb || "sofre dano contínuo"}! (DoT stacking)`,
      "dmg",
    );
  },
  cooldownRefund(effect, item, ctx) {
    if (!rolls(effect)) return;
    ctx.refund += effect.ms;
    log(`${item.icon} ${item.name}: recarga reduzida!`, "item");
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
      );
      spawnEffect("lightning", en.x, en.y - 20, {
        life: 25,
        color: "#66aaff",
      });
    });
    if (others.length > 0) {
      log(`⚡ Relâmpago ricocheteou em ${others.length} alvos!`, "item");
    }
  },
};

// trigger "use": itens que não são armas, quando a recarga fica pronta
const USE_EFFECTS = {
  blockNext(effect, item, p) {
    p.nextBlockActive = true;
    spawnEffect("shield", p.x, p.y - 40, { life: 40 });
    log(`${item.icon} ${item.name}: próximo ataque bloqueado!`, "item");
    p.anim = "block";
  },
  barrier(effect, item, p) {
    p.barrier = effect.amount;
    spawnEffect("dragon_roar", p.x, p.y - 40, { life: 50 });
    log(
      `${item.icon} ${item.name}: barreira de ${effect.amount} HP ativada!`,
      "item",
    );
    p.anim = "berserk";
  },
  heal(effect, item, p) {
    const charges = (p.charges[item.id] || 0) + 1;
    p.charges[item.id] = charges;
    const bonus = effect.bonusEvery
      ? Math.floor(charges / effect.bonusEvery) * effect.bonusAmount
      : 0;
    const healAmt = effect.amount + bonus;
    p.hp = Math.min(p.maxHp, p.hp + healAmt);
    spawnEffect("heal", p.x, p.y - 50, { life: 45 });
    spawnNumber(p.x, p.y - 60, `+${healAmt}`, "#44cc88", 2);
    log(`${item.icon} ${item.name}: restaura ${healAmt} HP.`, "heal");
    sound("heal");
    p.anim = "heal";
  },
  mana(effect, item, p) {
    const overflow = p.mana >= p.maxMana;
    p.mana = Math.min(p.maxMana, p.mana + effect.amount);
    spawnEffect("mana_orb", p.x, p.y - 50, { life: 35 });
    if (overflow && effect.overflowBonus) {
      p.manaOverflow = effect.overflowBonus;
      log(
        `${item.icon} ${item.name}: transbordamento! Próximo ataque +${Math.round(effect.overflowBonus * 100)}%.`,
        "item",
      );
    } else {
      log(`${item.icon} ${item.name}: +${effect.amount} Mana.`, "item");
    }
    p.anim = "heal";
  },
  frenzy(effect, item, p) {
    p.berserking = true;
    p.berserkRemaining = effect.duration;
    p.berserkSpeed = effect.speedBonus;
    spawnEffect("berserk", p.x, p.y - 40, { life: 60 });
    log(
      `${item.icon} ${item.name}: Frenesi ativado por ${effect.duration / 1000} segundos!`,
      "item",
    );
    p.anim = "berserk";
  },
};

// Tipos que o jogo sabe executar, por gatilho (os testes conferem o items.json contra isto)
export const KNOWN_EFFECTS = {
  hit: Object.keys(HIT_EFFECTS),
  attack: Object.keys(ATTACK_EFFECTS),
  use: Object.keys(USE_EFFECTS),
  passive: ["stats"],
  damage: ["lowHpBonus"],
  block: ["reflect"],
  barrierAbsorb: ["reflect"],
  hurt: ["manaFromDamage"],
  death: ["revive"],
  lowHp: ["useNow"],
};

// ═══════════════════════════════════════════
//  ITEM ACTIVATION LOGIC
// ═══════════════════════════════════════════
function weaponAttack(item, target) {
  const p = state.player;
  const hits = item.hits || 1;
  const ctx = { target, damage: 0, refund: 0 };
  let totalDmg = 0;

  for (let h = 0; h < hits; h++) {
    let dmg = item.baseDmg + (item.bonusDmg || 0);
    // Transbordamento de mana: bônus só no primeiro golpe
    if (p.manaOverflow) {
      dmg = Math.round(dmg * (1 + p.manaOverflow));
      if (h === 0) {
        log(
          `🔮 Transbordamento: +${Math.round(p.manaOverflow * 100)}% de dano!`,
          "item",
        );
      }
      p.manaOverflow = 0;
    }
    // Bônus de dano com vida baixa (ex.: Escama Dracônica)
    for (const { effect } of ownedEffects("damage")) {
      if (effect.type === "lowHpBonus" && p.hp / p.maxHp < effect.threshold) {
        dmg = Math.round(dmg * (1 + effect.bonus));
      }
    }

    totalDmg += applyElementalDamage(
      target,
      dmg,
      item.dmgType || "physical",
      "player",
    );
    ctx.damage = dmg;

    for (const effect of effectsOf(item, "hit")) {
      HIT_EFFECTS[effect.type]?.(effect, item, ctx);
    }
    if (h === 0) {
      for (const effect of effectsOf(item, "attack")) {
        ATTACK_EFFECTS[effect.type]?.(effect, item, ctx);
      }
    }
  }

  log(`⚔ ${item.name}: ${totalDmg} de dano em ${target.name}!`, "dmg");
  sound("hit");
  p.anim = PLAYER_ATTACK_ANIMS.has(item.anim) ? item.anim : "slash";
  spawnEffect(item.fx || "slash", target.x, target.y - 20, {
    life: 35,
    color: item.fxColor,
  });
  return ctx.refund;
}

export function activateItem(item) {
  const p = state.player;
  const enemies = state.enemies.filter((e) => !e.dead);
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
      handler(effect, item, p);
      activated = true;
    }
  }

  if (activated) {
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
    // Frenesi: armas recarregam mais rápido enquanto dura
    const speed =
      item.type === "weapon" && p.berserking ? 1 + p.berserkSpeed : 1;
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
    log(`🪬 Frenesi terminou.`, "item");
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
export function enemyAttack(en) {
  const p = state.player;
  let dmg = en.dmg;

  // Block
  if (p.nextBlockActive) {
    p.nextBlockActive = false;
    // Parry: itens com efeito "block" refletem dano
    const reflected = ownedEffects("block")
      .filter(({ effect }) => effect.type === "reflect")
      .reduce((sum, { effect }) => sum + effect.damage, 0);
    if (reflected > 0) {
      en.hp -= reflected;
      en.hurtTimer = 12;
      log(
        `🔰 Parry! Bloqueio reflete ${reflected} de dano para ${en.name}!`,
        "item",
      );
    } else {
      log(`🔰 Ataque bloqueado!`, "item");
    }
    sound("block");
    spawnEffect("shield", p.x, p.y - 40, { life: 25 });
    return;
  }

  // Barrier
  if (p.barrier > 0) {
    const absorbed = Math.min(dmg, p.barrier);
    p.barrier -= absorbed;
    const ratio = ownedEffects("barrierAbsorb")
      .filter(({ effect }) => effect.type === "reflect")
      .reduce((sum, { effect }) => sum + effect.ratio, 0);
    const reflected = Math.round(absorbed * ratio);
    en.hp -= reflected;
    dmg -= absorbed;
    if (reflected > 0)
      log(`🐉 Barreira reflete ${reflected} de dano para ${en.name}!`, "item");
    if (dmg <= 0) {
      log(`🐉 Barreira absorve o ataque!`, "item");
      return;
    }
  }

  // Armor reduction
  dmg = Math.max(1, Math.round(dmg * (1 - p.armor / 100)));

  // Dano recebido vira mana (ex.: Manto do Mago)
  for (const { item, effect } of ownedEffects("hurt")) {
    if (effect.type !== "manaFromDamage") continue;
    const manaAbsorb = Math.round(dmg * effect.ratio);
    p.mana = Math.min(p.maxMana, p.mana + manaAbsorb);
    if (manaAbsorb > 0)
      log(`${item.icon} ${item.name} absorve: +${manaAbsorb} Mana.`, "item");
  }

  p.hp -= dmg;
  sound("enemyHit");
  spawnNumber(p.x - 20, p.y - 60, `-${dmg}`, "#ff6666", 2);
  log(`💀 ${en.name} ataca: ${dmg} de dano!`, "dmg");

  // Death / revive
  if (p.hp <= 0) {
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
      log(
        `${revive.item.icon} ${revive.item.name}: você renasceu com ${p.hp} HP! Todas as recargas prontas!`,
        "kill",
      );
    } else {
      p.hp = 0;
      log(`☠️ Você foi derrotado na onda ${state.wave}!`, "kill");
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
    if (en.dead) return;
    const dist = en.x - playerX;
    const combatDist = 80;

    if (dist > combatDist && en.moving) {
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
      state.kills++;
      state.score += en.xp;
      state.gold += en.gold || 0;
      state.fragments += en.fragments || 1;
      sound("kill");
      spawnEffect("death", en.x, en.y - 30, { life: 50 });
      spawnNumber(en.x, en.y - 50, `+${en.xp} XP`, "#c9a84c", 3);
      if (en.fragments > 0) {
        spawnNumber(en.x - 20, en.y - 65, `⚡${en.fragments}`, "#aa66ee", 2);
      }
      log(
        `💀 ${en.name} foi derrotado! +${en.fragments || 1} fragmentos.`,
        "kill",
      );
    }
  });
}
