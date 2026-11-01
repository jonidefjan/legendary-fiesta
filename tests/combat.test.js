import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setupRun,
  enemy,
  item,
  fixedRandom,
  captureEvents,
  setLevel,
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
  for (let i = 0; i < 7; i++) applyDot(target, "bleeding", 3, 4);
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
  assert.equal(near.hp, 1000 - 10);
  assert.equal(far.hp, 1000);
  assert.equal(state.itemTimers.rusted_sword.elapsed, 0, "recarga reiniciada");
});

test("Lâmina de Brasa causa 12 de dano de fogo e queima em todo golpe", () => {
  const target = enemy();
  const hp = target.hp;
  setupRun(["ember_blade"], [target]);
  fixedRandom(0.99); // nem a pior rolagem impede a queimadura (chance 100%)
  activateItem(item("ember_blade"));
  assert.equal(target.hp, hp - 12, "12 de dano direto");
  assert.deepEqual(
    target.dots.map((d) => [d.type, d.damage, d.stacks]),
    [["burning", 1, 1]],
  );
  activateItem(item("ember_blade"));
  assert.equal(target.dots[0].stacks, 2);
});

test("Adaga das Sombras (nível 5) devolve 0,5 s de recarga por golpe que acerta a chance", () => {
  setupRun(["shadow_dagger"]);
  fixedRandom(0.1);
  activateItem(item("shadow_dagger"));
  assert.equal(state.itemTimers.shadow_dagger.elapsed, 0, "antes do nível 5 não devolve");

  setLevel("shadow_dagger", 5);
  activateItem(item("shadow_dagger"));
  assert.equal(state.itemTimers.shadow_dagger.elapsed, 1500, "3 golpes × 500");
  fixedRandom(0.9);
  activateItem(item("shadow_dagger"));
  assert.equal(state.itemTimers.shadow_dagger.elapsed, 0);
});

test("Cajado do Trovão ricocheteia em até 2 outros inimigos com metade do dano", () => {
  const main = enemy({ x: 120 });
  const others = [enemy({ x: 300 }), enemy({ x: 350 }), enemy({ x: 400 })];
  setupRun(["thunder_staff"], [main, ...others]);
  activateItem(item("thunder_staff"));
  assert.equal(main.hp, 1000 - 29);
  assert.deepEqual(
    others.map((e) => 1000 - e.hp),
    [15, 15, 0],
  );
});


// ─── Itens de uso ───
// ─── Itens de uso ───
test("Cristal Vital cura 10; a Ressonância (nível 3) soma +3 a cada 10 cargas", () => {
  setupRun(["health_crystal"]);
  state.player.hp = 50;
  activateItem(item("health_crystal"));
  assert.equal(state.player.hp, 60);
  state.player.charges.health_crystal = 9;
  state.player.hp = 50;
  activateItem(item("health_crystal"));
  assert.equal(state.player.hp, 60, "nível 1 não tem Ressonância");

  setLevel("health_crystal", 3); // 10 + 3 por nível
  state.player.charges.health_crystal = 9;
  state.player.hp = 40;
  activateItem(item("health_crystal"));
  assert.equal(state.player.hp, 40 + 16 + 3);
});

test("item de uso não ativa sem inimigos vivos", () => {
  setupRun(["health_crystal"], [enemy({ dead: true })]);
  assert.equal(activateItem(item("health_crystal")), false);
});

// ─── Defesa ───
test("Escudo de Ferro bloqueia o próximo ataque; o Aparo (nível 3) devolve 100% do golpe", () => {
  const attacker = enemy({ dmg: 40 });
  setupRun(["iron_shield"], [attacker]);
  activateItem(item("iron_shield"));
  enemyAttack(attacker);
  assert.equal(state.player.hp, 100);
  assert.equal(attacker.hp, 1000, "nível 1 não devolve dano");
  enemyAttack(attacker);
  assert.equal(state.player.hp, 60, "só um ataque é bloqueado");

  setLevel("iron_shield", 3);
  activateItem(item("iron_shield"));
  enemyAttack(attacker);
  assert.equal(state.player.hp, 60);
  assert.equal(attacker.hp, 960, "devolve os 40 do golpe");
});

test("armadura reduz o dano com retorno decrescente, com mínimo 1", () => {
  setupRun(["leather_vest"]);
  enemyAttack(enemy({ dmg: 50 })); // 16 / (16 + 100) = 13,8%
  assert.equal(state.player.hp, 100 - 43);
  enemyAttack(enemy({ dmg: 1 }));
  assert.equal(state.player.hp, 57 - 1);
});

test("Pena de Fênix revive uma vez com 52% de vida; as recargas zeram só a partir do nível 3", () => {
  setupRun(["phoenix_feather", "rusted_sword"]);
  const events = captureEvents();
  state.itemTimers.rusted_sword.elapsed = 0;
  state.player.hp = 5;
  enemyAttack(enemy({ dmg: 50 }));
  assert.equal(state.player.hp, 52);
  assert.equal(state.itemTimers.rusted_sword.elapsed, 0, "nível 1 não zera as recargas");
  assert.equal(state.running, true);

  state.player.hp = 5;
  enemyAttack(enemy({ dmg: 50 }));
  assert.equal(state.player.hp, 0);
  assert.equal(state.running, false);
  assert.ok(events.some((e) => e.type === "playerDied"));
});

test("Pena de Fênix (nível 3) revive com 72% e zera as recargas", () => {
  setupRun(["phoenix_feather", "rusted_sword"]);
  setLevel("phoenix_feather", 3);
  state.itemTimers.rusted_sword.elapsed = 0;
  state.player.hp = 5;
  enemyAttack(enemy({ dmg: 50 }));
  assert.equal(state.player.hp, 72, "52% + 10% por nível");
  assert.equal(state.itemTimers.rusted_sword.elapsed, 2200);
});

// ─── Totem e Frenesi ───
test("Frenesi acelera a recarga das armas em 52% e termina no tempo de jogo", () => {
  setupRun(["berserker_totem", "rusted_sword"]);
  activateItem(item("berserker_totem"));
  assert.equal(state.player.berserking, true);

  state.itemTimers.rusted_sword.elapsed = 0;
  updateItemTimers(1000);
  assert.equal(state.itemTimers.rusted_sword.elapsed, 1520);

  updateFrenzy(2999);
  assert.equal(state.player.berserking, true);
  updateFrenzy(1);
  assert.equal(state.player.berserking, false);
});

test("Totem (nível 3) ativa sozinho abaixo de 25% de vida, uma vez por onda", () => {
  setupRun(["berserker_totem"]);
  setLevel("berserker_totem", 3);
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
  assert.equal(hit.damage, 26); // 22 × 1,2 de fraqueza
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
  assert.equal(state.player.hp, 52);
});

test("armadura 300 reduz 75% do dano (a curva não tem teto)", () => {
  setupRun([]);
  state.player.armor = 300;
  enemyAttack(enemy({ dmg: 100 }));
  assert.equal(state.player.hp, 100 - 25);
});
