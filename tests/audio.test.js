import { test } from "node:test";
import assert from "node:assert/strict";
import { sfx } from "../game/src/audio.js";

const ELEMENTS = ["physical", "fire", "ice", "lightning", "shadow", "water", "poison", "holy"];
const USES = ["blockNext", "barrier", "heal", "mana", "frenzy"];
const DOTS = ["burning", "poison", "bleeding"];

function callAll() {
  for (const e of [...ELEMENTS, "desconhecido", undefined]) sfx.hit(e);
  for (const u of [...USES, "desconhecido", undefined]) sfx.use(u);
  for (const d of [...DOTS, "desconhecido", undefined]) sfx.dot(d);
  sfx.revive();
  sfx.enemyHit();
  sfx.block();
  sfx.kill();
  sfx.heal();
  sfx.waveClear();
  sfx.reward();
  sfx.death();
}

test("sem AudioContext nenhum método lança", () => {
  assert.doesNotThrow(callAll);
});

test("toggleMute alterna entre true e false", () => {
  assert.equal(sfx.toggleMute(), true);
  assert.equal(sfx.toggleMute(), false);
  assert.equal(sfx.toggleMute(), true);
  assert.equal(sfx.toggleMute(), false);
});

function makeFakeCtx(counts) {
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({ connect() {}, start() {}, stop() {} });
  return class FakeCtx {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.state = "running";
      this.destination = {};
    }
    createOscillator() {
      counts.osc++;
      return { ...node(), frequency: param(), detune: param() };
    }
    createGain() {
      return { ...node(), gain: param() };
    }
    createBiquadFilter() {
      return { ...node(), frequency: param(), Q: param() };
    }
    createBuffer(ch, len) {
      const data = new Float32Array(len);
      return { getChannelData: () => data };
    }
    createBufferSource() {
      counts.src++;
      return node();
    }
  };
}

test("limitador ignora chamada repetida em menos de 45 ms", async () => {
  const counts = { osc: 0, src: 0 };
  const had = Object.getOwnPropertyDescriptor(globalThis, "window");
  globalThis.window = { AudioContext: makeFakeCtx(counts) };
  try {
    assert.doesNotThrow(callAll);
    await new Promise((r) => setTimeout(r, 130));
    const before = counts.osc;
    sfx.hit("water");
    const afterFirst = counts.osc;
    assert.ok(afterFirst > before, "primeira chamada toca");
    sfx.hit("water");
    assert.equal(counts.osc, afterFirst, "segunda chamada é descartada");
    await new Promise((r) => setTimeout(r, 60));
    sfx.hit("water");
    assert.ok(counts.osc > afterFirst, "depois do intervalo toca de novo");
    assert.ok(counts.src > 0, "ruído usa AudioBufferSource");
  } finally {
    if (had) Object.defineProperty(globalThis, "window", had);
    else delete globalThis.window;
  }
});
