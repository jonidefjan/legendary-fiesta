import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  KINDS,
  MAX_PARTICLES,
  emit,
  update,
  draw,
  clear,
  count,
  snapshot,
} from "../game/src/particles.js";
import { ENDESGA_32 } from "../game/src/palette.js";
import { setRandom } from "../game/src/random.js";

afterEach(() => {
  setRandom(null);
  clear();
});

function fakeCtx() {
  const calls = [];
  const styles = [];
  return {
    calls,
    styles,
    set fillStyle(v) {
      styles.push(v);
    },
    fillRect(...args) {
      calls.push(args);
    },
  };
}

test("todo kind gera partículas", () => {
  for (const kind of KINDS) {
    clear();
    emit(kind, 100, 100, { element: "fire" });
    assert.ok(count() > 0, kind);
  }
});

test("hit normal gera entre 6 e 12 partículas (exceto lightning)", () => {
  for (const element of ["physical", "fire", "ice", "shadow", "water", "poison", "holy"]) {
    clear();
    emit("hit", 0, 0, { element });
    assert.ok(count() >= 6 && count() <= 12, `${element}: ${count()}`);
  }
});

test("kind desconhecido não lança nem gera", () => {
  assert.doesNotThrow(() => emit("nope", 0, 0));
  assert.equal(count(), 0);
});

test("elemento desconhecido vira physical", () => {
  setRandom(() => 0.5);
  emit("hit", 0, 0, { element: "xyz" });
  const a = JSON.stringify(snapshot());
  clear();
  emit("hit", 0, 0, { element: "physical" });
  assert.equal(JSON.stringify(snapshot()), a);
});

test("update envelhece e remove após a vida", () => {
  emit("hit", 0, 0, { element: "physical" });
  const n = count();
  update(50);
  assert.equal(count(), n);
  assert.ok(snapshot()[0].age > 0);
  for (let i = 0; i < 20; i++) update(100);
  assert.equal(count(), 0);
});

test("gravidade puxa para baixo", () => {
  const cases = [["blood", {}], ["hit", { element: "ice" }], ["hit", { element: "water" }]];
  for (const [kind, opts] of cases) {
    clear();
    setRandom(() => 0.5);
    emit(kind, 0, 0, opts);
    const before = snapshot().map((p) => p.vy);
    update(50);
    snapshot().forEach((p, i) => assert.ok(p.vy > before[i], kind));
  }
});

test("fogo sobe", () => {
  setRandom(() => 0.5);
  emit("hit", 0, 0, { element: "fire" });
  update(100);
  assert.ok(snapshot().every((p) => p.y < 0));
});

test("dt grande é limitado e estável", () => {
  emit("death", 0, 0);
  update(5000);
  for (const p of snapshot()) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert.ok(p.age <= 150);
  }
});

test("o limite máximo é respeitado", () => {
  for (let i = 0; i < 100; i++) emit("death", 0, 0, { intensity: 1 });
  assert.equal(count(), MAX_PARTICLES);
});

test("clear esvazia", () => {
  emit("death", 0, 0);
  clear();
  assert.equal(count(), 0);
});

test("com random fixo, dois emits são idênticos", () => {
  setRandom(() => 0.5);
  emit("hit", 10, 20, { element: "ice", direction: 1 });
  const a = JSON.stringify(snapshot());
  clear();
  emit("hit", 10, 20, { element: "ice", direction: 1 });
  assert.equal(JSON.stringify(snapshot()), a);
});

test("direction empurra horizontalmente", () => {
  setRandom(() => 0.5);
  emit("blood", 0, 0, { direction: 1 });
  const right = snapshot()[0].vx;
  clear();
  emit("blood", 0, 0, { direction: -1 });
  assert.ok(right > snapshot()[0].vx);
});

test("draw usa só fillRect/fillStyle, coordenadas inteiras e cores da paleta", () => {
  for (const kind of KINDS) emit(kind, 100.4, 80.7, { element: "poison" });
  update(80);
  const ctx = fakeCtx();
  draw(ctx);
  assert.equal(ctx.calls.length, count());
  for (const args of ctx.calls) {
    assert.equal(args.length, 4);
    assert.ok(args.every(Number.isInteger), String(args));
    assert.ok(args[2] >= 1 && args[3] >= 1);
  }
  assert.ok(ctx.styles.length > 0);
  for (const c of ctx.styles) assert.ok(ENDESGA_32.includes(c), c);
});
