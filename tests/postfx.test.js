import { test } from "node:test";
import assert from "node:assert/strict";
import { ENDESGA_32 } from "../game/src/palette.js";
import {
  createPostFX,
  hexToRgb01,
  paletteToFloatArray,
  BAYER_4X4,
  VERTEX_SHADER,
  FRAGMENT_SHADER,
} from "../game/src/postfx.js";

test("hexToRgb01 converte hex em 0..1", () => {
  const [r, g, b] = hexToRgb01("#ff8000");
  assert.equal(r, 1);
  assert.ok(Math.abs(g - 128 / 255) < 1e-9);
  assert.equal(b, 0);
});

test("hexToRgb01 aceita maiúsculas e cores da paleta", () => {
  assert.deepEqual(hexToRgb01("#FFFFFF"), [1, 1, 1]);
  assert.deepEqual(hexToRgb01("#000000"), [0, 0, 0]);
  const [r, g, b] = hexToRgb01(ENDESGA_32[0]);
  assert.ok(Math.abs(r - 0xbe / 255) < 1e-9);
  assert.ok(Math.abs(g - 0x4a / 255) < 1e-9);
  assert.ok(Math.abs(b - 0x2f / 255) < 1e-9);
});

test("paletteToFloatArray tem 96 valores em 0..1", () => {
  const arr = paletteToFloatArray(ENDESGA_32);
  assert.ok(arr instanceof Float32Array);
  assert.equal(arr.length, 96);
  for (const v of arr) assert.ok(v >= 0 && v <= 1);
});

test("BAYER_4X4 tem 16 valores únicos em [0,1)", () => {
  assert.equal(BAYER_4X4.length, 16);
  assert.equal(new Set(BAYER_4X4).size, 16);
  for (const v of BAYER_4X4) assert.ok(v >= 0 && v < 1);
});

test("shaders declaram paleta e uniforms usados", () => {
  assert.match(FRAGMENT_SHADER, /uniform vec3 uPalette\[32\]/);
  for (const u of ["uTex", "uResolution", "uPixelSize", "uDither", "uEnabled", "uBayer"]) {
    assert.ok(FRAGMENT_SHADER.includes(u), u);
  }
  assert.ok(VERTEX_SHADER.includes("gl_Position"));
});

test("createPostFX devolve null sem WebGL", () => {
  assert.equal(createPostFX({ getContext: () => null }), null);
});
