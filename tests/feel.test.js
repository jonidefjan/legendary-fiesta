import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { setRandom } from "../game/src/random.js";
import * as feel from "../game/src/feel.js";

beforeEach(() => {
  feel.reset();
  feel.setShakeEnabled(true);
  setRandom(() => 0.9);
});
after(() => setRandom(null));

const mm = (matches) => () => ({ matches });
const fakeStorage = (initial) => {
  const data = new Map(initial ? [[feel.PREFS_KEY, initial]] : []);
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
};

test("hurtFeedback: dano pequeno ainda aparece, teto em 25% da vida e maxHp 0 sem NaN", () => {
  const small = feel.hurtFeedback(1, 100);
  assert.ok(small.vignette >= 0.35 && small.vignette < 0.5);
  assert.equal(feel.hurtFeedback(25, 100).vignette, 1);
  assert.equal(feel.hurtFeedback(80, 100).vignette, 1);
  assert.ok(feel.hurtFeedback(10, 100).vignette > small.vignette);
  const zero = feel.hurtFeedback(10, 0);
  assert.ok(Number.isFinite(zero.vignette) && Number.isFinite(zero.shake));
  assert.equal(feel.hurtFeedback(10, 100).shake, Math.min(0.5, Math.max(0.15, 10 / 40)));
});

test("sem trauma o deslocamento é zero", () => {
  const f = feel.update(16);
  assert.deepEqual(f, { x: 0, y: 0, frozen: false });
});

test("com trauma o deslocamento é inteiro, não nulo e dentro do limite", () => {
  feel.addShake(1);
  const f = feel.update(0);
  assert.ok(Number.isInteger(f.x) && Number.isInteger(f.y));
  assert.ok(f.x !== 0 && f.y !== 0);
  assert.ok(Math.abs(f.x) <= feel.MAX_OFFSET && Math.abs(f.y) <= feel.MAX_OFFSET);
});

test("trauma é limitado a 1 e decai até 0", () => {
  feel.addShake(0.8);
  feel.addShake(0.8);
  assert.equal(feel.getTrauma(), 1);
  for (let i = 0; i < 100; i++) feel.update(16);
  assert.equal(feel.getTrauma(), 0);
  assert.equal(feel.update(16).x, 0);
});

test("com a tremida desligada não há deslocamento, mas o hit-stop congela", () => {
  feel.setShakeEnabled(false);
  feel.addShake(1);
  feel.hitStop(50);
  const f = feel.update(16);
  assert.equal(f.x, 0);
  assert.equal(f.y, 0);
  assert.equal(f.frozen, true);
});

test("hit-stop congela enquanto resta tempo", () => {
  feel.hitStop(50);
  const frames = [];
  for (let i = 0; i < 5; i++) frames.push(feel.update(16).frozen);
  // 50 -> 34 -> 18 -> 2 -> 0: congela 4 quadros
  assert.deepEqual(frames, [true, true, true, true, false]);
});

test("hit-stop não soma", () => {
  feel.hitStop(50);
  feel.hitStop(50);
  let frozenFrames = 0;
  while (feel.update(10).frozen) frozenFrames++;
  assert.equal(frozenFrames, 5);
  feel.update(feel.HITSTOP_COOLDOWN); // passa o intervalo entre congelamentos
  feel.hitStop(20);
  feel.hitStop(60);
  feel.hitStop(10);
  frozenFrames = 0;
  while (feel.update(10).frozen) frozenFrames++;
  assert.equal(frozenFrames, 6);
});

test("hit-stop respeita o teto", () => {
  feel.hitStop(10000);
  let frozenFrames = 0;
  while (feel.update(10).frozen) frozenFrames++;
  assert.equal(frozenFrames, feel.MAX_HITSTOP / 10);
});

test("reset limpa trauma e congelamento", () => {
  feel.addShake(1);
  feel.hitStop(100);
  feel.reset();
  assert.deepEqual(feel.update(16), { x: 0, y: 0, frozen: false });
});

test("preferência padrão: ligada, e desligada com movimento reduzido", () => {
  assert.equal(feel.loadPrefs(fakeStorage(), mm(false)).shake, true);
  assert.equal(feel.isShakeEnabled(), true);
  assert.equal(feel.loadPrefs(fakeStorage(), mm(true)).shake, false);
  assert.equal(feel.isShakeEnabled(), false);
});

test("lê e grava a escolha no storage", () => {
  const stored = fakeStorage(JSON.stringify({ shake: false }));
  assert.equal(feel.loadPrefs(stored, mm(false)).shake, false);
  feel.setShakeEnabled(true);
  feel.savePrefs(stored);
  assert.deepEqual(JSON.parse(stored.getItem(feel.PREFS_KEY)), { shake: true });
  // a escolha salva vence o movimento reduzido
  assert.equal(feel.loadPrefs(stored, mm(true)).shake, true);
});

test("JSON corrompido cai no padrão", () => {
  assert.equal(feel.loadPrefs(fakeStorage("{quebrado"), mm(false)).shake, true);
  assert.equal(feel.loadPrefs(fakeStorage("{quebrado"), mm(true)).shake, false);
  assert.equal(feel.loadPrefs(fakeStorage('{"shake":"sim"}'), mm(false)).shake, true);
});

test("hit-stop: intervalo depois de um congelamento evita travar o jogo em sequência", () => {
  feel.reset();
  feel.hitStop(40);
  assert.equal(feel.update(40).frozen, true);
  assert.equal(feel.update(16).frozen, false);
  feel.hitStop(40);
  assert.equal(feel.update(16).frozen, false, "ainda no intervalo");
  feel.update(feel.HITSTOP_COOLDOWN);
  feel.hitStop(40);
  assert.equal(feel.update(16).frozen, true, "intervalo acabou");
  feel.reset();
});

test("hit-stop encurta com a velocidade do jogo e ignora dt negativo", () => {
  feel.reset();
  feel.hitStop(60, 3);
  assert.equal(feel.update(19).frozen, true);
  assert.equal(feel.update(1).frozen, true, "20 ms = 60 / 3");
  assert.equal(feel.update(-500).frozen, false, "dt negativo não estende");
  feel.reset();
});
