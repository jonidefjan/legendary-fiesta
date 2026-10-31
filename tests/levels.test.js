// Níveis dos itens: escala em combate, recarga, limite e sorteio
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../game/src/state.js";
import {
  addItemOrLevel,
  effectiveCooldown,
  ensureTimers,
  generateRandomItems,
  MAX_ITEM_LEVEL,
} from "../game/src/items.js";
import { activateItem } from "../game/src/combat.js";
import { setupRun, enemy, item, fixedRandom } from "./helpers.js";

function setLevel(id, level) {
  state.itemLevels[id] = level;
  ensureTimers();
}

// Dano causado por um uso da arma num alvo com muita vida
function weaponDamage(id) {
  const target = enemy({ hp: 100000, maxHp: 100000 });
  state.enemies = [target];
  activateItem(item(id));
  return 100000 - target.hp;
}

test("dano da arma cresce 20% por nível", () => {
  setupRun(["rusted_sword"]);
  const base = item("rusted_sword").baseDmg;
  assert.equal(weaponDamage("rusted_sword"), base);
  setLevel("rusted_sword", 3);
  assert.equal(weaponDamage("rusted_sword"), Math.round(base * 1.4));
});

test("damageBonus multiplica o dano do jogador", () => {
  setupRun(["rusted_sword"]);
  state.player.damageBonus = 0.5;
  assert.equal(
    weaponDamage("rusted_sword"),
    Math.round(item("rusted_sword").baseDmg * 1.5),
  );
});

test("cura cresce com o nível", () => {
  setupRun(["health_crystal"]);
  state.player.maxHp = 1000;
  state.player.hp = 1;
  activateItem(item("health_crystal"));
  assert.equal(state.player.hp, 1 + 8);
  setLevel("health_crystal", 5); // x1.8
  state.player.hp = 1;
  state.player.charges = {};
  activateItem(item("health_crystal"));
  assert.equal(state.player.hp, 1 + Math.round(8 * 1.8));
});

test("barreira cresce com o nível", () => {
  setupRun(["dragonscale"]);
  setLevel("dragonscale", 3);
  activateItem(item("dragonscale"));
  assert.equal(state.player.barrier, Math.round(30 * 1.4));
});

test("mana cresce com o nível", () => {
  setupRun(["mana_stone"]);
  state.player.mana = 0;
  setLevel("mana_stone", 2);
  activateItem(item("mana_stone"));
  assert.equal(state.player.mana, Math.round(12 * 1.2));
});

test("duração do frenesi cresce, bônus de velocidade não", () => {
  setupRun(["berserker_totem"]);
  setLevel("berserker_totem", 3);
  activateItem(item("berserker_totem"));
  assert.equal(state.player.berserkRemaining, Math.round(3000 * 1.4));
  assert.equal(state.player.berserkSpeed, 0.4);
});

test("nível da queimadura sobe o teto de stacks, não o dano por stack", () => {
  setupRun(["ember_blade"]);
  fixedRandom(0); // a chance do dot sempre passa
  setLevel("ember_blade", 5);
  const target = enemy();
  state.enemies = [target];
  activateItem(item("ember_blade"));
  assert.equal(target.dots[0].damage, 3);
  assert.equal(target.dots[0].maxStacks, 7);
});

test("recarga encurta 5% por nível e com cooldownBonus", () => {
  setupRun(["rusted_sword"]);
  const cd = item("rusted_sword").cooldown;
  assert.equal(effectiveCooldown(item("rusted_sword")), cd);
  setLevel("rusted_sword", 3);
  assert.equal(effectiveCooldown(item("rusted_sword")), Math.round(cd * 0.9));
  assert.equal(state.itemTimers.rusted_sword.cooldown, Math.round(cd * 0.9));
  state.player.cooldownBonus = 0.1;
  assert.equal(
    effectiveCooldown(item("rusted_sword")),
    Math.round(cd * 0.9 * 0.9),
  );
});

test("addItemOrLevel sobe o nível até o máximo", () => {
  setupRun([]);
  const sword = item("rusted_sword");
  assert.deepEqual(addItemOrLevel(sword), { leveled: false, level: 1 });
  for (let i = 0; i < 10; i++) addItemOrLevel(sword);
  assert.equal(state.itemLevels.rusted_sword, MAX_ITEM_LEVEL);
  assert.equal(state.items.length, 1);
});

test("generateRandomItems filtra por tipo e esconde itens no nível máximo", () => {
  setupRun(["rusted_sword"]);
  state.itemLevels.rusted_sword = MAX_ITEM_LEVEL;
  for (let i = 0; i < 30; i++) {
    const picks = generateRandomItems(3, new Set(), { type: "weapon" });
    assert.ok(picks.length > 0);
    assert.ok(picks.every((p) => p.type === "weapon"));
    assert.ok(picks.every((p) => p.id !== "rusted_sword"));
  }
});

test("Pena de Fênix não sobe de nível e sai do sorteio depois de pega", () => {
  setupRun(["phoenix_feather"]);
  assert.equal(addItemOrLevel(item("phoenix_feather")).level, 1);
  for (let i = 0; i < 200; i++) {
    assert.ok(!generateRandomItems(3).some((it) => it.id === "phoenix_feather"));
  }
});
