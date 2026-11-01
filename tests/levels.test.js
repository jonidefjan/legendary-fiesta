// Níveis dos itens: escala em combate, recarga, limite e sorteio
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../game/src/state.js";
import {
  addItemOrLevel,
  effectiveCooldown,
  generateRandomItems,
  levelValue,
  stepOf,
  MAX_ITEM_LEVEL,
} from "../game/src/items.js";
import { activateItem } from "../game/src/combat.js";
import { setupRun, enemy, item, fixedRandom, setLevel } from "./helpers.js";

// Dano causado por um uso da arma num alvo com muita vida
function weaponDamage(id) {
  const target = enemy({ hp: 100000, maxHp: 100000 });
  state.enemies = [target];
  activateItem(item(id));
  return 100000 - target.hp;
}

test("dano da arma cresce o que o item declara por nível (Espada: +3)", () => {
  setupRun(["rusted_sword"]);
  const base = item("rusted_sword").baseDmg;
  assert.equal(weaponDamage("rusted_sword"), base);
  setLevel("rusted_sword", 3);
  assert.equal(weaponDamage("rusted_sword"), base + 6);
});

test("levelValue: degrau (At) vale do nível em diante e troca o crescimento por nível", () => {
  setupRun(["chainmail"]);
  const obj = { ratio: 0.5, ratioAt: { 3: 0.6, 5: 1 }, chance: 0.1, chancePerLevel: 0.05 };
  const cm = item("chainmail");
  assert.equal(levelValue(cm, obj, "ratio"), 0.5);
  setLevel("chainmail", 3);
  assert.equal(levelValue(cm, obj, "ratio"), 0.6);
  setLevel("chainmail", 4);
  assert.equal(levelValue(cm, obj, "ratio"), 0.6);
  setLevel("chainmail", 5);
  assert.equal(levelValue(cm, obj, "ratio"), 1);
  assert.ok(Math.abs(levelValue(cm, obj, "chance") - 0.3) < 1e-9, "10% + 5% × 4");
  assert.equal(stepOf(obj, "ratio", 2), undefined);
});

test("valor sem declaração de nível é fixo (acabou o +20% genérico)", () => {
  setupRun(["poison_blade"]);
  setLevel("poison_blade", 5);
  const blade = item("poison_blade");
  assert.equal(levelValue(blade, blade, "baseDmg"), 10);
  assert.equal(effectiveCooldown(blade), 2500);
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
  setLevel("health_crystal", 5); // +3 por nível
  state.player.hp = 1;
  state.player.charges = {};
  activateItem(item("health_crystal"));
  assert.equal(state.player.hp, 1 + 8 + 12);
});

test("duração do frenesi cresce 0,5 s por nível, bônus de velocidade não", () => {
  setupRun(["berserker_totem"]);
  setLevel("berserker_totem", 3);
  activateItem(item("berserker_totem"));
  assert.equal(state.player.berserkRemaining, 4000);
  assert.equal(state.player.berserkSpeed, 0.4);
});

test("nível da queimadura sobe os stacks por golpe, não o dano por stack", () => {
  setupRun(["ember_blade"]);
  fixedRandom(0); // a chance do dot sempre passa
  setLevel("ember_blade", 5);
  const target = enemy();
  state.enemies = [target];
  activateItem(item("ember_blade"));
  assert.equal(target.dots[0].damage, 1);
  assert.equal(target.dots[0].stacks, 5);
  assert.equal(target.dots[0].maxStacks, Infinity);
});

test("a recarga só encurta quando o item declara (Escudo: -1 s por nível) e com cooldownBonus", () => {
  setupRun(["iron_shield", "rusted_sword"]);
  const shield = item("iron_shield");
  assert.equal(effectiveCooldown(shield), 8000);
  setLevel("iron_shield", 3);
  assert.equal(effectiveCooldown(shield), 6000);
  assert.equal(state.itemTimers.iron_shield.cooldown, 6000);
  state.player.cooldownBonus = 0.1;
  assert.equal(effectiveCooldown(shield), 5400);
  setLevel("rusted_sword", 3);
  assert.equal(effectiveCooldown(item("rusted_sword")), Math.round(2200 * 0.9), "sem cooldownPerLevel, só o bônus");
});

test("addItemOrLevel sobe o nível até o máximo", () => {
  setupRun([]);
  const mail = item("chainmail");
  assert.deepEqual(addItemOrLevel(mail), { leveled: false, level: 1 });
  for (let i = 0; i < 10; i++) addItemOrLevel(mail);
  assert.equal(state.itemLevels.chainmail, MAX_ITEM_LEVEL);
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

test("Pena de Fênix sobe até o nível 5 e sai do sorteio no máximo", () => {
  setupRun(["phoenix_feather"]);
  assert.equal(addItemOrLevel(item("phoenix_feather")).level, 2);
  for (let i = 0; i < 10; i++) addItemOrLevel(item("phoenix_feather"));
  assert.equal(state.itemLevels.phoenix_feather, MAX_ITEM_LEVEL);
  for (let i = 0; i < 200; i++) {
    assert.ok(!generateRandomItems(3).some((it) => it.id === "phoenix_feather"));
  }
});
