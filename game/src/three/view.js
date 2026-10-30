// ═══════════════════════════════════════════
//  VISTA: câmera ortográfica, grade de pixels e conversões
// ═══════════════════════════════════════════
// Três espaços de coordenadas:
//   lógica   px da arena (o que combat.js/waves.js usam: x, y, canvas.width)
//   mundo    unidades 3D (world.js): X = linha de combate, Y = cima, Z = profundidade
//   tela     px CSS do canvas visível, e "texels" do quadro em baixa resolução
// O quadro baixa resolução tem PAD texels de margem em volta: o deslocamento
// sub-pixel do encaixe da câmera nunca mostra borda vazia.
import * as THREE from "three";
import { WORLD, LOW_RES_HEIGHT, CAMERA } from "./world.js";

export const PAD = 1;
const PITCH = THREE.MathUtils.degToRad(CAMERA.pitchDeg);
const DISTANCE = 60; // da câmera ao alvo (ortográfica: só afeta near/far)
// Meia largura mínima da vista: herói em X ≈ -5,6 e inimigos parados à frente
const MIN_HALF_WIDTH = 7.2;
// Altura em mundo de 1 px lógico (vertical e tamanhos de efeitos/partículas)
export const LOGIC_Y_SCALE = 0.032;
const GROUND_RATIO = 0.55; // chão lógico = 55% da altura da arena (waves.js)

// Tamanho lógico da arena em px CSS (getCanvas() devolve este objeto)
export const arena = { width: 800, height: 480 };

export const view = {
  lowW: 400, // texels internos (sem margem)
  lowH: LOW_RES_HEIGHT,
  texel: 0.066, // unidades de mundo por texel
  halfH: CAMERA.viewHeight / 2,
  halfW: 12,
  // Resto do encaixe em texels (x para a direita, y para cima)
  shift: new THREE.Vector2(),
  camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 160),
};

// Base da câmera: direita, cima e frente fixas (só inclinação, sem guinada)
const RIGHT = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, Math.cos(PITCH), -Math.sin(PITCH));
const FORWARD = new THREE.Vector3(0, -Math.sin(PITCH), -Math.cos(PITCH));
const TARGET = new THREE.Vector3(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z);
const BASE = TARGET.clone().addScaledVector(FORWARD, -DISTANCE);

view.camera.rotation.set(-PITCH, 0, 0);

export function paddedSize() {
  return { w: view.lowW + PAD * 2, h: view.lowH + PAD * 2 };
}

export function resizeView(cssW, cssH) {
  arena.width = Math.max(1, cssW);
  arena.height = Math.max(1, cssH);
  view.lowH = LOW_RES_HEIGHT;
  view.lowW = Math.max(1, Math.round((LOW_RES_HEIGHT * arena.width) / arena.height));
  // Tela estreita: abre a vista para o herói e os inimigos caberem
  view.halfH = Math.max(
    CAMERA.viewHeight / 2,
    (MIN_HALF_WIDTH * view.lowH) / view.lowW,
  );
  view.texel = (view.halfH * 2) / view.lowH; // texels quadrados
  view.halfW = (view.texel * view.lowW) / 2;
  const cam = view.camera;
  cam.left = -(view.halfW + PAD * view.texel);
  cam.right = view.halfW + PAD * view.texel;
  cam.top = view.halfH + PAD * view.texel;
  cam.bottom = -(view.halfH + PAD * view.texel);
  cam.updateProjectionMatrix();
}

// Encaixe na grade (técnica do artigo): a posição da câmera, medida nos eixos
// da própria vista, é arredondada para múltiplos do texel; o resto vai para
// view.shift e o quadro ampliado é deslocado por ele. Assim o cenário não
// "nada" entre pixels e a tremida continua suave.
// shakeX/shakeY: deslocamento em px CSS (feel.js), y para baixo.
export function updateCamera(shakeX = 0, shakeY = 0) {
  const k = (view.halfH * 2) / arena.height; // mundo por px CSS
  const a = BASE.dot(RIGHT) + shakeX * k;
  const b = BASE.dot(UP) - shakeY * k;
  const c = BASE.dot(FORWARD);
  const sa = Math.round(a / view.texel) * view.texel;
  const sb = Math.round(b / view.texel) * view.texel;
  view.shift.set((a - sa) / view.texel, (b - sb) / view.texel);
  view.camera.position
    .set(0, 0, 0)
    .addScaledVector(RIGHT, sa)
    .addScaledVector(UP, sb)
    .addScaledVector(FORWARD, c);
  view.camera.updateMatrixWorld();
}

// ─── Lógica → mundo ───
export function logicToWorldX(x) {
  return (x / arena.width - 0.5) * WORLD.battleWidth;
}

export function logicToWorldY(y) {
  return (arena.height * GROUND_RATIO - y) * LOGIC_Y_SCALE;
}

export function logicGroundY() {
  return arena.height * GROUND_RATIO;
}

// Texels do quadro baixa resolução por px lógico (tamanho de efeitos)
export function logicPxToLowRes() {
  return LOGIC_Y_SCALE / view.texel;
}

// ─── Mundo → tela ───
const tmp = new THREE.Vector3();

// Posição no canvas baixa resolução COM margem (y para baixo), câmera encaixada
export function worldToLowRes(x, y, z, out = { x: 0, y: 0 }) {
  tmp.set(x, y, z).project(view.camera);
  const { w, h } = paddedSize();
  out.x = (tmp.x * 0.5 + 0.5) * w;
  out.y = (1 - (tmp.y * 0.5 + 0.5)) * h;
  return out;
}

// Posição em px CSS do canvas visível, já com o deslocamento sub-pixel
export function worldToScreen(x, y, z, out = { x: 0, y: 0 }) {
  tmp.set(x, y, z).project(view.camera);
  const { w, h } = paddedSize();
  const tx = (tmp.x * 0.5 + 0.5) * w - PAD - view.shift.x;
  const ty = (tmp.y * 0.5 + 0.5) * h - PAD - view.shift.y;
  out.x = (tx / view.lowW) * arena.width;
  out.y = (1 - ty / view.lowH) * arena.height;
  return out;
}
