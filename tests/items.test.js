import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEMS, setupRun, item } from "./helpers.js";
import { state } from "../game/src/state.js";
import {
  generateRandomItems,
  isActivatable,
  applyPassives,
} from "../game/src/items.js";
import { KNOWN_EFFECTS } from "../game/src/combat.js";

test("todo efeito do items.json tem um gatilho e um tipo que o jogo executa", () => {
  for (const it of ITEMS) {
    for (const effect of it.effects || []) {
      const known = KNOWN_EFFECTS[effect.trigger];
      assert.ok(known, `${it.id}: gatilho desconhecido "${effect.trigger}"`);
      assert.ok(
        known.includes(effect.type),
        `${it.id}: tipo "${effect.type}" não existe para o gatilho "${effect.trigger}"`,
      );
    }
  }
});

test("todo item com recarga faz algo quando fica pronto (no nível máximo)", () => {
  setupRun([]);
  for (const it of ITEMS) {
    if (it.cooldown <= 0) continue;
    // A Escama Dracônica só ativa (Pele em brasa) no nível 5
    state.itemLevels[it.id] = 5;
    assert.ok(isActivatable(it), `${it.id} tem recarga mas nada para ativar`);
    delete state.itemLevels[it.id];
  }
  assert.equal(isActivatable(item("dragonscale")), false, "nível 1: só reage a golpes");
});

test("IDs dos itens são únicos", () => {
  const ids = ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("sorteio respeita a quantidade e não repete itens", () => {
  for (let run = 0; run < 200; run++) {
    const picked = generateRandomItems(12);
    assert.equal(picked.length, 12);
    assert.equal(new Set(picked.map((i) => i.id)).size, 12);
  }
});

test("sorteio nunca oferece itens excluídos", () => {
  const owned = new Set(["rusted_sword", "health_crystal", "ember_blade"]);
  for (let run = 0; run < 200; run++) {
    for (const it of generateRandomItems(3, owned)) {
      assert.ok(!owned.has(it.id), `${it.id} já era do jogador`);
    }
  }
});

test("sorteio devolve menos itens quando o catálogo acaba", () => {
  const allButOne = new Set(ITEMS.slice(1).map((i) => i.id));
  const picked = generateRandomItems(3, allButOne);
  assert.deepEqual(
    picked.map((i) => i.id),
    [ITEMS[0].id],
  );
});

test("efeitos passivos somam armadura e o amplificador do Manto do Arcano", () => {
  setupRun(["leather_vest", "chainmail", "mage_robe"]);
  assert.equal(state.player.armor, 12 + 18);
  assert.ok(Math.abs(state.player.elementalBoost - 0.1) < 1e-9);
  assert.equal(state.player.extraStacks, 0, "o Manto só dá +1 stack a partir do nível 3");

  state.items = [item("rusted_sword")];
  applyPassives();
  assert.equal(state.player.armor, 0);
  assert.equal(state.player.elementalBoost, 0);
});
