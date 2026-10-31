import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setupRun,
  enemy,
  item,
  fixedRandom,
  captureEvents,
} from "./helpers.js";
import { state } from "../game/src/state.js";
import { on } from "../game/src/events.js";
import {
  applyElementalDamage,
  applyDot,
  processDots,
  activateItem,
  updateItemTimers,
  updateFrenzy,
  enemyAttack,
  updateEnemies,
  ANIM_MS,
} from "../game/src/combat.js";

// ─── Dano e resistências ───
test("resistência reduz e fraqueza aumenta o dano elemental", () => {
  setupRun();
  const demon = enemy({ resist: { fire: 0.5, water: -0.3 } });
  assert.equal(applyElementalDamage(demon, 20, "fire", "player"), 10);
  assert.equal(applyElementalDamage(demon, 10, "water", "player"), 13);
  assert.equal(applyElementalDamage(demon, 1, "fire", "player"), 1, "mínimo 1");
  assert.equal(state.runStats.totalDamage, 24);
});

test("dano contínuo acumula até 5 vezes e causa dano a cada segundo", () => {
  setupRun();
  const target = enemy({ hp: 100 });
  state.enemies = [target];
  for (let i = 0; i < 7; i++) applyDot(target, "burning", 3, 4);
  assert.equal(target.dots[0].stacks, 5);

  processDots(999);
  assert.equal(target.hp, 100);
  processDots(1);
  assert.equal(target.hp, 85);
  processDots(3000);
  assert.equal(target.dots.length, 1, "ainda tem 3 ticks");
});

// ─── Armas ───
test("arma ataca o inimigo mais próximo", () => {
  const near = enemy({ x: 150 });
  const far = enemy({ x: 400 });
  setupRun(["rusted_sword"], [far, near]);
  activateItem(item("rusted_sword"));
  assert.equal(near.hp, 1000 - 8);
  assert.equal(far.hp, 1000);
  assert.equal(state.itemTimers.rusted_sword.elapsed, 0, "recarga reiniciada");
});

test("Lâmina de Brasa não causa dano direto e queima em todo golpe", () => {
  const target = enemy();
  const hp = target.hp;
  setupRun(["ember_blade"], [target]);
  fixedRandom(0.99); // nem a pior rolagem impede a queimadura (chance 100%)
  activateItem(item("ember_blade"));
  assert.equal(target.hp, hp, "golpe sem dano");
  assert.deepEqual(
    target.dots.map((d) => [d.type, d.damage, d.stacks]),
    [["burning", 3, 1]],
  );
  activateItem(item("ember_blade"));
  assert.equal(target.dots[0].stacks, 2);
});

test("Adaga das Sombras devolve 0,5 s de recarga por golpe que acerta a chance", () => {
  setupRun(["shadow_dagger"]);
  fixedRandom(0.1);
  activateItem(item("shadow_dagger"));
  assert.equal(state.itemTimers.shadow_dagger.elapsed, 1000, "2 golpes × 500");
  fixedRandom(0.9);
  activateItem(item("shadow_dagger"));
  assert.equal(state.itemTimers.shadow_dagger.elapsed, 0);
});

test("Cajado do Trovão ricocheteia em até 2 outros inimigos com metade do dano", () => {
  const main = enemy({ x: 120 });
  const others = [enemy({ x: 300 }), enemy({ x: 350 }), enemy({ x: 400 })];
  setupRun(["thunder_staff"], [main, ...others]);
  activateItem(item("thunder_staff"));
  assert.equal(main.hp, 1000 - 22);
  assert.deepEqual(
    others.map((e) => 1000 - e.hp),
    [11, 11, 0],
  );
});

test("transbordamento de mana dá +25% só no próximo ataque", () => {
  const target = enemy();
  setupRun(["mana_stone", "rusted_sword"], [target]);
  state.player.mana = state.player.maxMana;
  activateItem(item("mana_stone"));
  activateItem(item("rusted_sword"));
  assert.equal(1000 - target.hp, 10, "8 × 1,25");
  activateItem(item("rusted_sword"));
  assert.equal(1000 - target.hp, 18);
});

test("Escama Dracônica dá +30% de dano abaixo de 40% de vida", () => {
  const target = enemy();
  setupRun(["dragonscale", "rusted_sword"], [target]);
  state.player.hp = 39;
  activateItem(item("rusted_sword"));
  assert.equal(1000 - target.hp, 10, "8 × 1,3");
});

// ─── Itens de uso ───
test("Cristal Vital cura e ganha +3 a cada 10 cargas", () => {
  setupRun(["health_crystal"]);
  state.player.hp = 50;
  activateItem(item("health_crystal"));
  assert.equal(state.player.hp, 58);
  state.player.charges.health_crystal = 9;
  state.player.hp = 50;
  activateItem(item("health_crystal"));
  assert.equal(state.player.hp, 61);
});

test("item de uso não ativa sem inimigos vivos", () => {
  setupRun(["health_crystal"], [enemy({ dead: true })]);
  assert.equal(activateItem(item("health_crystal")), false);
});

// ─── Defesa ───
test("Escudo de Ferro bloqueia o próximo ataque e reflete 5 de dano", () => {
  const attacker = enemy({ dmg: 40 });
  setupRun(["iron_shield"], [attacker]);
  activateItem(item("iron_shield"));
  enemyAttack(attacker);
  assert.equal(state.player.hp, 100);
  assert.equal(attacker.hp, 995);
  enemyAttack(attacker);
  assert.equal(state.player.hp, 60, "só um ataque é bloqueado");
});

test("barreira absorve dano e reflete 20% do que absorveu", () => {
  const attacker = enemy({ dmg: 40 });
  setupRun(["dragonscale"], [attacker]);
  activateItem(item("dragonscale"));
  enemyAttack(attacker);
  assert.equal(state.player.barrier, 0);
  assert.equal(attacker.hp, 1000 - 6);
  assert.equal(state.player.hp, 90);
});

test("armadura reduz o dano em porcentagem, com mínimo 1", () => {
  setupRun(["leather_vest"]);
  enemyAttack(enemy({ dmg: 50 }));
  assert.equal(state.player.hp, 100 - 44);
  enemyAttack(enemy({ dmg: 1 }));
  assert.equal(state.player.hp, 56 - 1);
});

test("Manto do Mago converte 30% do dano recebido em mana", () => {
  setupRun(["mage_robe"]);
  enemyAttack(enemy({ dmg: 20 }));
  assert.equal(state.player.mana, 6);
});

test("Pena de Fênix revive uma vez com 40% de vida e recargas prontas", () => {
  setupRun(["phoenix_feather", "rusted_sword"]);
  const events = captureEvents();
  state.itemTimers.rusted_sword.elapsed = 0;
  state.player.hp = 5;
  enemyAttack(enemy({ dmg: 50 }));
  assert.equal(state.player.hp, 40);
  assert.equal(state.itemTimers.rusted_sword.elapsed, 2200);
  assert.equal(state.running, true);

  state.player.hp = 5;
  enemyAttack(enemy({ dmg: 50 }));
  assert.equal(state.player.hp, 0);
  assert.equal(state.running, false);
  assert.ok(events.some((e) => e.type === "playerDied"));
});

// ─── Totem e Frenesi ───
test("Frenesi acelera a recarga das armas em 40% e termina no tempo de jogo", () => {
  setupRun(["berserker_totem", "rusted_sword"]);
  activateItem(item("berserker_totem"));
  assert.equal(state.player.berserking, true);

  state.itemTimers.rusted_sword.elapsed = 0;
  updateItemTimers(1000);
  assert.equal(state.itemTimers.rusted_sword.elapsed, 1400);

  updateFrenzy(2999);
  assert.equal(state.player.berserking, true);
  updateFrenzy(1);
  assert.equal(state.player.berserking, false);
});

test("Totem ativa sozinho abaixo de 25% de vida, uma vez por onda", () => {
  setupRun(["berserker_totem"]);
  state.itemTimers.berserker_totem.elapsed = 0;
  state.player.hp = 30;
  updateItemTimers(16);
  assert.equal(state.player.berserking, false, "acima do limite");

  state.player.hp = 20;
  updateItemTimers(16);
  assert.equal(state.player.berserking, true);

  state.player.berserking = false;
  updateItemTimers(16);
  assert.equal(state.player.berserking, false, "já usou nesta onda");
});

// ─── Inimigos ───
test("inimigo morto conta abate, pontos e fragmentos uma vez só", () => {
  const target = enemy({ hp: 0, xp: 10, fragments: 2 });
  setupRun([], [target]);
  updateEnemies(16);
  updateEnemies(16);
  assert.equal(target.dead, true);
  assert.equal(state.kills, 1);
  assert.equal(state.score, 10);
  assert.equal(state.fragments, 2);
});

test("timers de animação: golpe do herói, investida e queda do inimigo", () => {
  const target = enemy({ x: 150 });
  setupRun(["rusted_sword"], [target]);
  activateItem(item("rusted_sword"));
  assert.equal(state.player.animTimer, ANIM_MS.playerAction);

  enemyAttack(target);
  assert.equal(target.attackAnim, ANIM_MS.enemyAttack);
  updateEnemies(100);
  assert.equal(target.attackAnim, ANIM_MS.enemyAttack - 100);

  target.hp = 0;
  updateEnemies(16);
  assert.equal(target.deathAnim, ANIM_MS.enemyDeath);
  updateEnemies(250);
  assert.equal(target.deathAnim, ANIM_MS.enemyDeath - 250);
});

test("inimigo anda até o jogador e ataca no intervalo", () => {
  const attacker = enemy({ x: 400, moving: true, speed: 1, dmg: 10 });
  setupRun([], [attacker]);
  updateEnemies(1000);
  assert.ok(attacker.x < 400);
  attacker.x = 150;
  updateEnemies(1999);
  assert.equal(state.player.hp, 100);
  updateEnemies(1);
  assert.equal(state.player.hp, 90);
});

// ─── Eventos visuais (contrato com partículas, tremida e renderer) ───
function eventsOf(events, type) {
  return events.filter((e) => e.type === type).map((e) => e.payload);
}

test("golpe emite attack e hit com posição, elemento e dano", () => {
  const target = enemy({ x: 150, resist: { ice: -0.2 } });
  setupRun(["frost_bow"], [target]);
  const events = [];
  for (const type of ["hit", "attack", "sfx"]) {
    on(type, (payload) => events.push({ type, payload }));
  }
  fixedRandom(0.99);
  activateItem(item("frost_bow"));
  const [hit] = eventsOf(events, "hit");
  assert.equal(hit.element, "ice");
  assert.equal(hit.damage, 20); // (12 + 5) × 1,2 de fraqueza
  assert.equal(hit.weak, true);
  assert.equal(hit.x, 150);
  const [attack] = eventsOf(events, "attack");
  assert.equal(attack.itemId, "frost_bow");
  assert.equal(attack.targetX, 150);
  assert.deepEqual(
    eventsOf(events, "sfx").find((s) => s.name === "hit"),
    { name: "hit", detail: "ice" },
  );
});

test("defesa, dano recebido, morte e reviver emitem seus eventos", () => {
  const attacker = enemy({ dmg: 30, x: 180 });
  setupRun(["iron_shield", "phoenix_feather"], [attacker]);
  const events = [];
  for (const type of ["itemUse", "blocked", "playerHurt", "revive", "enemyDied"]) {
    on(type, (payload) => events.push({ type, payload }));
  }
  activateItem(item("iron_shield"));
  assert.equal(eventsOf(events, "itemUse")[0].effect, "blockNext");
  enemyAttack(attacker);
  assert.equal(eventsOf(events, "blocked").length, 1);
  enemyAttack(attacker);
  assert.equal(eventsOf(events, "playerHurt")[0].damage, 30);
  state.player.hp = 1;
  enemyAttack(attacker);
  assert.equal(eventsOf(events, "revive").length, 1);
  attacker.hp = 0;
  updateEnemies(16);
  assert.deepEqual(eventsOf(events, "enemyDied")[0], { x: 180, y: 300, size: undefined });
});

test("dano contínuo emite dotTick com o tipo", () => {
  const target = enemy({ x: 220 });
  setupRun([], [target]);
  const ticks = [];
  on("dotTick", (payload) => ticks.push(payload));
  applyDot(target, "poison", 3, 2);
  processDots(1000);
  assert.deepEqual(ticks[0], { x: 220, y: 300, type: "poison", damage: 3, onPlayer: false });
});

test("dano contínuo no herói mata (sem Pena de Fênix) e dispara playerDied", () => {
  setupRun([]);
  const died = [];
  on("playerDied", () => died.push(true));
  state.player.hp = 3;
  applyDot(state.player, "burning", 5, 3);
  processDots(1000);
  assert.equal(state.player.hp, 0);
  assert.equal(state.running, false);
  assert.equal(died.length, 1);
  processDots(1000);
  assert.equal(died.length, 1, "não morre duas vezes");
});

test("dano contínuo letal aciona a Pena de Fênix", () => {
  setupRun(["phoenix_feather"]);
  state.player.hp = 2;
  applyDot(state.player, "burning", 5, 3);
  processDots(1000);
  assert.equal(state.running, true);
  assert.equal(state.player.hp, 40);
});

test("armadura reduz no máximo 75% do dano", () => {
  setupRun([]);
  state.player.armor = 300;
  enemyAttack(enemy({ dmg: 100 }));
  assert.equal(state.player.hp, 100 - 25);
});
