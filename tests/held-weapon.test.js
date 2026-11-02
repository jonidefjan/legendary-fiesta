import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ITEM_ART, ART_PALETTE } from "../game/src/item-art.js";
import { HELD_POSES, heldAngle, heldArtId, heldVoxels, heldVoxelsFor } from "../game/src/held-weapon.js";

const items = JSON.parse(readFileSync(new URL("../game/assets/items.json", import.meta.url)));
const weapons = (Array.isArray(items) ? items : items.items).filter((i) => i.type === "weapon");

test("arma na mão: toda arma do catálogo tem ícone e pose", () => {
  assert.ok(weapons.length > 0);
  for (const weapon of weapons) {
    const id = heldArtId([weapon]);
    assert.ok(ITEM_ART[id], `${id} sem ícone`);
    assert.ok(HELD_POSES[id], `${id} sem pose`);
    assert.ok(heldVoxelsFor(id).positions.length > 0, `${id} sem blocos`);
  }
});

test("arma na mão: o pixel segurado de cada pose é cheio ou vizinho de um pixel cheio", () => {
  for (const [id, { grip }] of Object.entries(HELD_POSES)) {
    const near = [-1, 0, 1].some((dc) =>
      [-1, 0, 1].some((dr) => ART_PALETTE[ITEM_ART[id][grip[1] + dr]?.[grip[0] + dc]]),
    );
    assert.ok(near, `${id}: a mão fica no vazio`);
  }
});

test("arma na mão: vale a primeira arma da lista, e a evolução usa a arte do item base", () => {
  assert.equal(heldArtId([]), null);
  assert.equal(heldArtId([{ type: "armor", id: "a" }]), null);
  assert.equal(
    heldArtId([{ type: "relic", id: "r" }, { type: "weapon", id: "x" }, { type: "weapon", id: "y" }]),
    "x",
  );
  assert.equal(heldArtId([{ type: "weapon", id: "evolved", art: "base" }]), "base");
});

test("arma na mão: o ângulo leva o vetor grip → tip ao eixo +Y", () => {
  for (const pose of Object.values(HELD_POSES)) {
    const a = heldAngle(pose);
    const dx = pose.tip[0] - pose.grip[0];
    const dy = pose.grip[1] - pose.tip[1]; // a linha cresce para baixo
    assert.ok(Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) < 1e-9);
    assert.ok(dx * Math.sin(a) + dy * Math.cos(a) > 0);
  }
});

test("arma na mão: pixel sozinho vira um bloco com 6 faces e o pixel segurado fica na origem", () => {
  const mesh = heldVoxels(["w"], { grip: [0, 0], tip: [0, 0] }, { w: "#ffffff" });
  assert.equal(mesh.positions.length / 3, 24);
  assert.equal(mesh.indices.length, 36);
  assert.equal(mesh.colors.length, 24);
  const sum = mesh.positions.reduce((total, v) => total + v, 0);
  assert.ok(Math.abs(sum) < 1e-9);
});

test("arma na mão: a lateral entre dois pixels cheios não é gerada, e o vazio não vira bloco", () => {
  const palette = { w: "#ffffff", ".": null };
  const pose = { grip: [0, 0], tip: [0, 0] };
  assert.equal(heldVoxels(["ww"], pose, palette).indices.length, 10 * 6);
  assert.equal(heldVoxels(["w", "w"], pose, palette).indices.length, 10 * 6);
  assert.equal(heldVoxels(["w.w"], pose, palette).indices.length, 12 * 6);
  assert.equal(heldVoxels(["..."], pose, palette).indices.length, 0);
});

test("arma na mão: as faces apontam para fora (sentido anti-horário bate com a normal)", () => {
  const { positions, normals, indices } = heldVoxels(["w"], { grip: [0, 0], tip: [0, 0] }, { w: "#fff" });
  const at = (i) => positions.slice(i * 3, i * 3 + 3);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [at(indices[i]), at(indices[i + 1]), at(indices[i + 2])];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const n = normals.slice(indices[i] * 3, indices[i] * 3 + 3);
    assert.ok(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] > 0);
  }
});

test("arma na mão: ícone ou pose inexistente não gera malha", () => {
  assert.equal(heldVoxelsFor("nao_existe"), null);
});
