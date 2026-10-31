import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createWave, ENEMY_TYPES } from "../game/src/waves.js";
import { setRandom } from "../game/src/random.js";

const arena = { width: 800, height: 400 };

afterEach(() => setRandom(null));

test("cada onda tem 2 + número da onda inimigos", () => {
  for (const wave of [1, 2, 5, 10]) {
    assert.equal(createWave(wave, arena).length, 2 + wave);
  }
});

test("vida e dano crescem 20% e 15% por onda", () => {
  setRandom(() => 0);
  const [skeleton] = createWave(3, arena);
  assert.equal(skeleton.name, ENEMY_TYPES[0].name);
  assert.equal(skeleton.maxHp, Math.round(35 * 1.4));
  assert.equal(skeleton.dmg, Math.round(6 * 1.3));
});

test("tipos mais fortes só aparecem em ondas mais altas", () => {
  setRandom(() => 0.99);
  assert.deepEqual(
    [...new Set(createWave(1, arena).map((e) => e.name))],
    [ENEMY_TYPES[0].name],
  );
  assert.ok(createWave(5, arena).every((e) => e.name === ENEMY_TYPES[2].name));
});

test("no celular os inimigos começam mais longe, mais lentos e batem menos", () => {
  setRandom(() => 0);
  const [desktop] = createWave(1, arena);
  const [mobile] = createWave(1, { ...arena, mobile: true });
  assert.ok(mobile.x > desktop.x);
  assert.ok(mobile.speed < desktop.speed);
  assert.ok(mobile.dmg <= desktop.dmg);
});

test("com maxX, todos os inimigos nascem dentro da tela (ondas grandes e celular)", () => {
  setRandom(() => 0.999);
  for (const mobile of [false, true]) {
    for (const wave of [1, 5, 10, 20]) {
      const maxX = 560;
      for (const en of createWave(wave, { ...arena, mobile, maxX })) {
        assert.ok(en.x <= maxX, `onda ${wave}${mobile ? " (celular)" : ""}: x ${en.x} > ${maxX}`);
      }
    }
  }
});

test("sem maxX, a fila mantém o espaçamento de 90 px", () => {
  setRandom(() => 0);
  const xs = createWave(3, arena).map((e) => e.x);
  assert.deepEqual(xs, [480, 570, 660, 750, 840]);
});
