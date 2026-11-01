import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { state, resetMeta, createPlayer } from "../game/src/state.js";
import * as meta from "../game/src/meta.js";
import { setLangQuiet } from "../game/src/i18n.js";

setLangQuiet("pt-BR"); // describeLevel devolve texto: o teste confere o português

beforeEach(() => resetMeta());

test("curva de custo: 20, 25, 31, 39...", () => {
  const costs = [];
  for (let i = 0; i < 4; i++) {
    costs.push(meta.upgradeCost("vitality"));
    state.meta.upgrades.vitality = i + 1;
  }
  assert.deepEqual(costs, [20, 25, 31, 39]);
});

test("comprar gasta fragmentos e sobe o nível", () => {
  state.fragments = 50;
  assert.equal(meta.buyUpgrade("might"), true);
  assert.equal(state.fragments, 30);
  assert.equal(meta.upgradeLevel("might"), 1);
  assert.equal(meta.upgradeCost("might"), 25);
});

test("não compra sem fragmentos suficientes", () => {
  state.fragments = 19;
  assert.equal(meta.buyUpgrade("guard"), false);
  assert.equal(state.fragments, 19);
  assert.equal(meta.upgradeLevel("guard"), 0);
  assert.equal(meta.buyUpgrade("inexistente"), false);
});

test("applyUpgrades define valores absolutos e é idempotente", () => {
  state.meta.upgrades = { vitality: 3, might: 2, guard: 4, haste: 5 };
  const p = createPlayer();
  meta.applyUpgrades(p);
  meta.applyUpgrades(p);
  assert.equal(p.maxHp, 130);
  assert.equal(p.baseArmor, 20);
  assert.ok(Math.abs(p.damageBonus - 0.1) < 1e-9);
  assert.ok(Math.abs(p.cooldownBonus - 0.15) < 1e-9);
});

test("bônus de recarga tem teto de 50%", () => {
  state.meta.upgrades = { haste: 100 };
  const p = createPlayer();
  meta.applyUpgrades(p);
  assert.equal(p.cooldownBonus, 0.5);
});

test("describeLevel", () => {
  assert.equal(meta.describeLevel("vitality", 3), "+30 vida");
  assert.equal(meta.describeLevel("might", 2), "+10% dano");
  assert.equal(meta.describeLevel("guard", 1), "+5 armadura");
  assert.equal(meta.describeLevel("haste", 2), "-6% recarga");
});

test("Celeridade para de ser vendida no nível máximo", () => {
  state.fragments = 1e9;
  let bought = 0;
  while (meta.buyUpgrade("haste")) bought++;
  assert.equal(bought, 16);
  assert.equal(meta.isMaxed("haste"), true);
  assert.equal(meta.upgradeCost("haste"), Infinity);
  const p = createPlayer();
  meta.applyUpgrades(p);
  assert.equal(p.cooldownBonus, 0.48);
});
