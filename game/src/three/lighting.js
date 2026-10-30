// ═══════════════════════════════════════════
//  LUZ: fim de tarde dourado nas ruínas
// ═══════════════════════════════════════════
// Um sol baixo e quente (única luz com sombra, mapa pequeno e sem PCF),
// preenchimento hemisférico frio e fraco (as sombras ficam azuladas) e uma
// textura de ruído que vira sombra de nuvem nos materiais toon.
import * as THREE from "three";
import { sharedUniforms } from "./materials.js";
import { LAYERS } from "./layers.js";
import { PALETTE } from "../palette.js";

export const LIGHTING = {
  sunColor: "#ffb070", // laranja de fim de tarde
  sunIntensity: 3.4, // ~π = cor do material sem alteração na faixa clara
  sunDir: new THREE.Vector3(0.55, 0.42, 0.72).normalize(), // para o sol: baixo, à frente-direita
  skyColor: PALETTE.silver, // preenchimento frio vindo de cima
  groundColor: PALETTE.brown, // rebatida quente do chão
  hemiIntensity: 1.6,
  shadowMapSize: 1024,
  shadowExtent: 30, // meia largura da caixa de sombra em unidades
  haze: "#d9a066", // céu/névoa ao fundo
  soil: PALETTE.darkBrown, // base do diorama
  fogNear: 64,
  fogFar: 120,
};

const SHADOW_CENTER = new THREE.Vector3(0, 0, -4);

// Ruído de valor com repetição perfeita (tile), em fBm de 4 oitavas
function makeCloudTexture(size = 128, seed = 7) {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const octave = (cells) => {
    const grid = Array.from({ length: cells * cells }, rand);
    const at = (x, y) => grid[(y % cells) * cells + (x % cells)];
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        let tx = fx - ix;
        let ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
        const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
        out[y * size + x] = a + (b - a) * ty;
      }
    }
    return out;
  };
  const layers = [
    [4, 0.5],
    [8, 0.25],
    [16, 0.15],
    [32, 0.1],
  ].map(([cells, w]) => [octave(cells), w]);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    let v = 0;
    for (const [o, w] of layers) v += o[i] * w;
    const byte = Math.max(0, Math.min(255, Math.round(v * 255)));
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = byte;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; // o step() no shader deixa a borda nítida
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Fundo em duas metades: céu/névoa em cima, "corte de terra" do diorama embaixo
// (a borda de baixo da vista passa um pouco da frente do cenário)
function makeBackground() {
  const top = new THREE.Color(LIGHTING.haze);
  const bottom = new THREE.Color(LIGHTING.soil);
  const data = new Uint8Array(8);
  // DataTexture começa na linha de baixo
  [bottom, top].forEach((c, i) => {
    const srgb = c.clone().convertLinearToSRGB();
    data.set([srgb.r * 255, srgb.g * 255, srgb.b * 255, 255].map(Math.round), i * 4);
  });
  const tex = new THREE.DataTexture(data, 1, 2, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createLighting(scene) {
  scene.background = makeBackground();
  scene.fog = new THREE.Fog(LIGHTING.haze, LIGHTING.fogNear, LIGHTING.fogFar);

  const hemi = new THREE.HemisphereLight(
    LIGHTING.skyColor,
    LIGHTING.groundColor,
    LIGHTING.hemiIntensity,
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(LIGHTING.sunColor, LIGHTING.sunIntensity);
  sun.position.copy(SHADOW_CENTER).addScaledVector(LIGHTING.sunDir, 50);
  sun.target.position.copy(SHADOW_CENTER);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -LIGHTING.shadowExtent;
  sc.right = LIGHTING.shadowExtent;
  sc.top = LIGHTING.shadowExtent * 0.7;
  sc.bottom = -LIGHTING.shadowExtent * 0.7;
  sc.near = 1;
  sc.far = 110;
  // Grama/folhagem fora do contorno ainda projeta sombra, se o cenário pedir
  sc.layers.enable(LAYERS.noOutline);
  sun.shadow.mapSize.set(LIGHTING.shadowMapSize, LIGHTING.shadowMapSize);
  // Viés pequeno + normalBias contra acne sem descolar a sombra do pé
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  sharedUniforms.uCloudTex.value = makeCloudTexture();
  sharedUniforms.uSunDir.value.copy(LIGHTING.sunDir);

  return { sun, hemi };
}
