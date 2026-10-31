// ═══════════════════════════════════════════
//  RENDERER 3D EM PIXEL ART (substituiu o render.js 2D, mesma API)
// ═══════════════════════════════════════════
// main.js chama: setupCanvas, getCanvas, setCamera, resizeCanvas,
// drawRunningFrame(dt), drawPausedFrame(), drawDefeatFrame().
// getCanvas() devolve o tamanho LÓGICO da arena em px CSS (a lógica do jogo usa
// canvas.width para nascer inimigos e posicionar o herói); o canvas WebGL é outro.
//
// Módulos: view.js (câmera, encaixe, conversões), pipeline.js (alvos e passes),
// lighting.js (sol, nuvens), characters.js (modelos e animações),
// effects2d.js (efeitos e partículas no quadro baixa resolução),
// overlay.js (textos e barras nítidos). O cenário vem de environment.js.
import * as THREE from "three";
import { state } from "../state.js";
import * as particles from "../particles.js";
import { arena, view, resizeView, updateCamera, logicGroundY } from "./view.js";

// Limite de nascimento dos inimigos (main.js passa para waves.js/boss.js)
export { visibleLogicRight } from "./view.js";
import { createPipeline } from "./pipeline.js";
import { createLighting } from "./lighting.js";
import { createCharacters } from "./characters.js";
import { LAYERS } from "./layers.js";
import { sharedUniforms, toonMaterial } from "./materials.js";
import { WORLD } from "./world.js";
import { PALETTE } from "../palette.js";
import * as fx from "./effects2d.js";
import * as overlay from "./overlay.js";
import { t } from "../i18n.js";

let display = null;
let pipeline = null;
let scene = null;
let characters = null;
let environment = null;
let lighting = null;
// Extras opcionais (água, raios de luz): cada um exporta install(ctx) e devolve
// { beforeRender(timeSec) } chamado a cada quadro antes do pipeline
const EXTRA_MODULES = ["./water.js", "./godrays.js"];
const extras = [];
let fallbackGround = null;
let lastReal = 0;
const shake = { x: 0, y: 0 };

// ─── Cenário (dinâmico: o arquivo pode ainda não existir) ───
function addFallbackGround() {
  if (fallbackGround) return;
  const geo = new THREE.PlaneGeometry(WORLD.maxX - WORLD.minX, WORLD.frontZ - WORLD.backZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, WORLD.groundY, (WORLD.frontZ + WORLD.backZ) / 2);
  fallbackGround = new THREE.Mesh(geo, toonMaterial(PALETTE.forest));
  fallbackGround.receiveShadow = true;
  fallbackGround.name = "fallback-ground";
  scene.add(fallbackGround);
}

// Objetos marcados com userData.noOutline vão para a camada sem contorno
function applyNoOutline(root) {
  root.traverse((o) => {
    if (o.userData?.noOutline) o.layers.set(LAYERS.noOutline);
  });
}

async function loadEnvironment() {
  addFallbackGround(); // chão provisório enquanto o cenário carrega
  try {
    const mod = await import("./environment.js");
    environment = mod.buildEnvironment(scene) || null;
    applyNoOutline(scene);
    scene.remove(fallbackGround);
    fallbackGround.geometry.dispose();
    fallbackGround.material.dispose();
    fallbackGround = null;
  } catch (err) {
    console.warn("[renderer] Cenário 3D indisponível; usando chão simples.", err);
  }
  await loadExtras();
}

async function loadExtras() {
  if (!pipeline) return;
  for (const path of EXTRA_MODULES) {
    try {
      const mod = await import(path);
      const extra = mod.install(getRenderContext());
      if (extra) extras.push({ path, ...extra });
    } catch (err) {
      console.warn(`[renderer] Extra ${path} indisponível.`, err);
    }
  }
}

// ─── API (a mesma que main.js usava no render.js 2D) ───
export function setupCanvas(displayEl, overlayEl) {
  display = displayEl;
  overlay.setupOverlay(overlayEl);
  const fxCanvas = fx.createFxCanvas();
  scene = new THREE.Scene();
  // O quadro renderiza a cena várias vezes (reflexo, cor, normais): as matrizes são
  // atualizadas uma vez só, em renderFrame
  scene.matrixWorldAutoUpdate = false;
  try {
    pipeline = createPipeline(display, fxCanvas);
  } catch (err) {
    console.warn("[renderer] WebGL indisponível; só a camada de texto será desenhada.", err);
    pipeline = null;
  }
  lighting = createLighting(scene);
  characters = createCharacters(scene);
  loadEnvironment();
  lastReal = performance.now();
}

export function getCanvas() {
  return arena;
}

// Acesso para cenário/água/god rays: cena, câmera, pipeline (renderer, alvos e
// passes extras), cenário (waterRect, tochas), luzes ({ sun, hemi }), a vista e os personagens
export function getRenderContext() {
  return { scene, camera: view.camera, pipeline, environment, lighting, view, characters };
}

// Depuração: contagem de geometrias/texturas na GPU (deve ficar estável entre ondas)
// No console: __gpuMemory()
export function gpuMemory() {
  const m = pipeline?.renderer.info.memory;
  return m ? { geometries: m.geometries, textures: m.textures } : null;
}
if (typeof window !== "undefined") window.__gpuMemory = gpuMemory;

export function setCamera(x, y) {
  shake.x = x;
  shake.y = y;
}

export function resizeCanvas() {
  const el = document.getElementById("arena");
  const width = el?.clientWidth || display.clientWidth || 800;
  const height = el?.clientHeight || display.clientHeight || 480;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  resizeView(width, height);
  // Canvas de efeitos primeiro: o pipeline realoca a textura se o tamanho mudou
  fx.resizeFxCanvas();
  pipeline?.setSize(width, height, dpr);
  overlay.resizeOverlay(width, height, dpr);
  // Herói e inimigos no mesmo chão lógico
  state.player.y = logicGroundY();
  state.enemies.forEach((en) => {
    en.y = logicGroundY();
  });
}

// ─── Quadro ───
// gameDt: ms de jogo (0 = congelado) | opts: o que avança e o que aparece
function renderFrame(gameDt, { tickEffects, showFx, tickHurt, allowSpawn }) {
  const now = performance.now();
  const realDt = Math.min(100, now - lastReal);
  lastReal = now;
  // Nuvens e tochas seguem o tempo real (continuam na pausa)
  sharedUniforms.uTime.value += realDt / 1000;
  try {
    environment?.update?.(sharedUniforms.uTime.value);
  } catch (err) {
    console.warn("[renderer] environment.update falhou; desligando.", err);
    environment = null;
  }

  updateCamera(shake.x, shake.y);
  characters.update(gameDt, { tickHurt, allowSpawn });
  scene.updateMatrixWorld();
  if (tickEffects) fx.ageEffects(realDt);

  const zAt = characters.zAtLogicX;
  if (pipeline) {
    for (let i = extras.length - 1; i >= 0; i--) {
      try {
        extras[i].beforeRender?.(sharedUniforms.uTime.value);
      } catch (err) {
        console.warn(`[renderer] Extra ${extras[i].path} falhou; desligando.`, err);
        extras.splice(i, 1);
      }
    }
    if (showFx) fx.drawFx(zAt);
    pipeline.render(scene, view.camera, { fx: showFx });
  }
  overlay.clearOverlay();
  if (showFx) {
    overlay.drawBars(characters);
    overlay.drawScreenEffects(zAt);
  }
}

export function drawRunningFrame(dt = 16) {
  particles.update(dt);
  // dt 0 = hit-stop: nada avança (efeitos, hurtTimer), mas o quadro é desenhado
  const running = dt > 0;
  renderFrame(dt, { tickEffects: running, showFx: true, tickHurt: running, allowSpawn: true });
  if (state.waveTransition) {
    overlay.drawScreenMessage(
      0.3,
      t("screen.waveClear", { wave: state.wave }),
      t("screen.nextWave"),
      22,
      14,
      { title: 15, subtitle: 15 },
    );
  }
}

export function drawPausedFrame() {
  renderFrame(0, { tickEffects: true, showFx: true, tickHurt: true, allowSpawn: false });
  overlay.drawScreenMessage(0.5, t("screen.paused"), t("screen.resume"), 36, 16, {
    title: 0,
    subtitle: 40,
  });
}

// Derrota: a queda do herói continua em tempo real; sem efeitos nem barras
let defeatLast = 0;
export function drawDefeatFrame() {
  const now = performance.now();
  const dt = defeatLast && now - defeatLast < 100 ? now - defeatLast : 16;
  defeatLast = now;
  renderFrame(dt, { tickEffects: false, showFx: false, tickHurt: false, allowSpawn: false });
  overlay.drawScreenMessage(0.6, t("screen.defeat"), t("screen.defeatSub", { wave: state.wave, score: state.score }), 32, 16, {
    title: 20,
    subtitle: 20,
  });
}
