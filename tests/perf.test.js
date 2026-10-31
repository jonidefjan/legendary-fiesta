// Fase 13 (desempenho): teto e envelhecimento dos efeitos, esqueleto compartilhado
// dos personagens e o corte do reflexo da água
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../game/vendor/three/build/three.module.js";
import { state } from "../game/src/state.js";
import { spawnEffect, spawnNumber, ageEffects, MAX_EFFECTS, FRAME_MS } from "../game/src/fx.js";
import { shareSkeleton, updateOncePerFrame } from "../game/src/three/skeleton.js";
import { reflectsInWater, WORLD } from "../game/src/three/world.js";

beforeEach(() => {
  state.effects = [];
});

// ─── Efeitos ───
test("efeitos param no teto e descartam os mais velhos", () => {
  for (let i = 0; i < MAX_EFFECTS + 50; i++) spawnNumber(i, 0, i, "#fff");
  assert.equal(state.effects.length, MAX_EFFECTS);
  // os 50 primeiros saíram; a ordem dos que ficaram não muda
  assert.equal(state.effects[0].x, 50);
  assert.equal(state.effects.at(-1).x, MAX_EFFECTS + 49);
});

test("abaixo do teto nada é descartado", () => {
  for (let i = 0; i < 10; i++) spawnEffect("slash", i, 0);
  assert.equal(state.effects.length, 10);
});

test("a 60 Hz (ou mais) envelhece 1 por quadro, como antes", () => {
  spawnEffect("slash", 0, 0, { life: 3 });
  ageEffects(state.effects, FRAME_MS);
  assert.ok(Math.abs(state.effects[0].life - 2) < 1e-9);
  ageEffects(state.effects, 1000 / 144); // tela de 144 Hz: continua 1 por quadro
  assert.ok(Math.abs(state.effects[0].life - 1) < 1e-9);
  ageEffects(state.effects);
  assert.equal(state.effects.length, 0);
});

test("com o jogo lento envelhece pelo tempo real (não acumula)", () => {
  spawnNumber(0, 0, 1, "#fff"); // life 60 = 1 s a 60 Hz
  // 8 quadros de 125 ms (8 fps) = 1 s: o número some no mesmo tempo
  for (let i = 0; i < 7; i++) ageEffects(state.effects, 125);
  assert.equal(state.effects.length, 1);
  ageEffects(state.effects, 125);
  assert.equal(state.effects.length, 0);
});

test("ageEffects remove só os que acabaram e mantém a ordem", () => {
  spawnEffect("a", 1, 0, { life: 1 });
  spawnEffect("b", 2, 0, { life: 5 });
  spawnEffect("c", 3, 0, { life: 1 });
  spawnEffect("d", 4, 0, { life: 9 });
  ageEffects(state.effects, FRAME_MS);
  assert.deepEqual(state.effects.map((e) => e.type), ["b", "d"]);
});

// ─── Esqueleto compartilhado ───
// Modelo como o do KayKit: várias malhas com esqueleto, cada uma com o seu Skeleton
function rigLike(meshes = 3, { differentInverse = false } = {}) {
  const root = new THREE.Group();
  const b0 = new THREE.Bone();
  const b1 = new THREE.Bone();
  b0.add(b1);
  root.add(b0);
  for (let i = 0; i < meshes; i++) {
    const inv = [new THREE.Matrix4(), new THREE.Matrix4()];
    if (differentInverse && i === meshes - 1) inv[1].makeTranslation(1, 0, 0);
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.bind(new THREE.Skeleton([b0, b1], inv), new THREE.Matrix4());
    root.add(mesh);
  }
  return root;
}

function skeletons(root) {
  const set = new Set();
  root.traverse((o) => o.isSkinnedMesh && set.add(o.skeleton));
  return set;
}

test("malhas com os mesmos ossos passam a usar um esqueleto só", () => {
  const model = rigLike(4);
  assert.equal(skeletons(model).size, 4);
  const shared = shareSkeleton(model);
  assert.deepEqual([...skeletons(model)], [shared]);
});

test("malha com inversas diferentes mantém o próprio esqueleto", () => {
  const model = rigLike(3, { differentInverse: true });
  shareSkeleton(model);
  assert.equal(skeletons(model).size, 2);
});

test("modelo sem esqueleto devolve null", () => {
  assert.equal(shareSkeleton(new THREE.Group()), null);
});

test("o esqueleto é calculado uma vez por quadro, mesmo com vários passes", () => {
  const sk = shareSkeleton(rigLike(2));
  let calls = 0;
  sk.update = () => calls++;
  let frame = 0;
  updateOncePerFrame(sk, () => frame);
  sk.update();
  sk.update();
  sk.update();
  assert.equal(calls, 1);
  frame++;
  sk.update();
  sk.update();
  assert.equal(calls, 2);
});

test("o cálculo único ainda atualiza as matrizes dos ossos", () => {
  const model = rigLike(2);
  const sk = updateOncePerFrame(shareSkeleton(model), () => 0);
  model.children[0].position.set(2, 0, 0);
  model.updateMatrixWorld(true);
  sk.update();
  assert.equal(sk.boneMatrices[12], 2); // translação x do primeiro osso
});

// ─── Reflexo da água ───
const WATER = { minX: 2.55, maxX: 7.45, minZ: 3.55, maxZ: 5.45, y: -0.5 };
const H = WORLD.heroHeight;

test("personagem longe da água em X não entra no reflexo", () => {
  assert.equal(reflectsInWater(-5.6, 2, H, WATER), false); // herói
  assert.equal(reflectsInWater(12, 2, H, WATER), false);
});

test("personagem na frente da faixa, acima da água em X, entra no reflexo", () => {
  assert.equal(reflectsInWater(5, 2, H, WATER), true);
  assert.equal(reflectsInWater(2, 2, H, WATER), true, "folga de uma altura em X");
});

test("personagem no fundo da faixa só reflete se for alto (chefe)", () => {
  assert.equal(reflectsInWater(5, -2, H, WATER), false);
  assert.equal(reflectsInWater(5, -2, H * 1.7, WATER), true);
});
