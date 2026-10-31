import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupRun, memoryStorage, item } from "./helpers.js";
import { state, resetRun } from "../game/src/state.js";
import * as save from "../game/src/save.js";

let storage;

beforeEach(() => {
  setupRun(["rusted_sword", "health_crystal"]);
  storage = memoryStorage();
  save.setStorage(storage);
});

test("a run salva guarda só os IDs dos itens e a versão", () => {
  save.saveRun();
  const data = JSON.parse(storage.data[save.RUN_KEY]);
  assert.equal(data.version, save.SAVE_VERSION);
  assert.deepEqual(data.items, ["rusted_sword", "health_crystal"]);
});

test("salvar e carregar devolve a mesma run com os itens do catálogo", () => {
  state.wave = 4;
  state.score = 300;
  state.player.hp = 72;
  state.fragments = 9;
  save.saveRun();

  resetRun();
  state.fragments = 0;
  save.loadMeta();
  assert.equal(save.loadRun(), true);
  assert.equal(state.wave, 4);
  assert.equal(state.score, 300);
  assert.equal(state.player.hp, 72);
  assert.equal(state.fragments, 9);
  assert.equal(state.items[0], item("rusted_sword"), "objeto atual do catálogo");
});

test("apagar a run mantém os fragmentos", () => {
  state.fragments = 5;
  save.saveRun();
  save.clearRun();
  resetRun();
  state.fragments = 0;
  save.loadMeta();
  assert.equal(save.loadRun(), false);
  assert.equal(state.fragments, 5);
});

test("resetar tudo apaga também os fragmentos", () => {
  state.fragments = 5;
  save.saveRun();
  save.resetAll();
  assert.deepEqual(storage.data, {});
});

test("save da versão 1 é migrado: IDs, fragmentos e itens sem efeito removidos", () => {
  const legacy = {
    wave: 3,
    kills: 7,
    score: 210,
    gold: 40,
    fragments: 12,
    items: [item("ember_blade"), { id: "lucky_coin", name: "antigo" }],
    itemTimers: { ember_blade: { elapsed: 1000, cooldown: 3000 } },
    playerHp: 55,
    playerMaxHp: 100,
    playerMana: 10,
    playerMaxMana: 100,
  };
  storage = memoryStorage({ reliquary_save_v1: JSON.stringify(legacy) });
  save.setStorage(storage);
  resetRun();
  state.fragments = 0;

  save.loadMeta();
  assert.equal(state.fragments, 12);
  assert.equal(save.loadRun(), true);
  assert.equal(
    JSON.parse(storage.data[save.META_KEY]).fragments,
    12,
    "fragmentos gravados na chave nova antes da antiga sumir",
  );
  assert.equal(state.wave, 3);
  assert.equal(state.player.hp, 55);
  assert.deepEqual(
    state.items.map((i) => i.id),
    ["ember_blade"],
  );
  assert.equal(storage.data.reliquary_save_v1, undefined, "chave antiga removida");
  assert.deepEqual(JSON.parse(storage.data[save.RUN_KEY]).items, [
    "ember_blade",
    "lucky_coin",
  ]);
});

test("sem storage disponível o jogo não quebra", () => {
  save.setStorage(null);
  save.saveRun();
  assert.equal(save.loadRun(), false);
});
