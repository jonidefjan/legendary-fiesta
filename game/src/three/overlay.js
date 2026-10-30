// ═══════════════════════════════════════════
//  CAMADA NÍTIDA (overlay): números, nomes, barras de vida e avisos
// ═══════════════════════════════════════════
// Texto pixelado ficaria ilegível, então vai num canvas por cima, em px CSS
// (× devicePixelRatio para ficar nítido). As posições vêm da projeção 3D.
import * as THREE from "three";
import { state } from "../state.js";
import { PALETTE } from "../palette.js";
import { arena, worldToScreen, logicToWorldX, logicToWorldY } from "./view.js";
import { SCREEN_EFFECTS } from "./effects2d.js";

const FONT = "'Pixelify Sans'";
const BAR = { w: 38, h: 6, border: 2 };
const DOT_ICONS = { burning: "🔥", poison: "☠️", bleeding: "💉" };

let canvas = null;
let ctx = null;
let dpr = 1;

export function setupOverlay(el) {
  canvas = el;
  ctx = el.getContext("2d");
}

export function resizeOverlay(cssW, cssH, ratio) {
  dpr = ratio;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
}

export function clearOverlay() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

// Barra blocada: borda escura, fundo, preenchimento e um brilho de 1 px
function drawBar(cx, y, pct, fill, shine) {
  const x = Math.round(cx - BAR.w / 2);
  const yy = Math.round(y);
  const b = BAR.border;
  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(x - b, yy - b, BAR.w + b * 2, BAR.h + b * 2);
  ctx.fillStyle = PALETTE.darkBrown;
  ctx.fillRect(x, yy, BAR.w, BAR.h);
  const w = Math.round(BAR.w * Math.max(0, Math.min(1, pct)));
  if (w > 0) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, yy, w, BAR.h);
    ctx.fillStyle = shine;
    ctx.fillRect(x, yy, w, 2);
  }
}

function outlinedText(text, x, y, color, size, bold = true) {
  ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.night;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

const v = new THREE.Vector3();
const s = { x: 0, y: 0 };

// Nome, barra de vida e DoTs de cada inimigo vivo, e a barra do herói
export function drawBars(characters) {
  // De trás para a frente; nome que cairia em cima de outro é omitido
  const items = [];
  for (const en of state.enemies) {
    if (en.dead || !characters.enemyAnchor(en, v)) continue;
    const p = worldToScreen(v.x, v.y, v.z, { x: 0, y: 0 });
    if (p.x < -60 || p.x > arena.width + 60) continue;
    items.push({ en, x: p.x, y: p.y });
  }
  items.sort((a, b) => a.y - b.y);
  const labels = [];
  for (const { en, x, y } of items) {
    s.x = x;
    s.y = y;
    drawBar(s.x, s.y, en.hp / en.maxHp, PALETTE.red, PALETTE.pink);
    const free = !labels.some((l) => Math.abs(l.x - x) < 70 && Math.abs(l.y - y) < 14);
    if (free) {
      labels.push({ x, y });
      outlinedText(en.name, s.x, s.y - 6, PALETTE.bone, 10);
    }
    if (en.dots && en.dots.length > 0) {
      let offsetX = (-14 * (en.dots.length - 1)) / 2;
      for (const d of en.dots) {
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(DOT_ICONS[d.type] || "✨", s.x + offsetX, s.y - 20);
        if (d.stacks > 1) outlinedText(`×${d.stacks}`, s.x + offsetX + 8, s.y - 15, PALETTE.white, 8);
        offsetX += 14;
      }
    }
  }
  const p = state.player;
  if (state.running) {
    characters.heroAnchor(v);
    worldToScreen(v.x, v.y, v.z, s);
    drawBar(s.x, s.y, p.hp / p.maxHp, PALETTE.green, PALETTE.gold);
    outlinedText("YOU", s.x, s.y - 6, PALETTE.amber, 9);
  }
}

// Números de dano e textos flutuantes (efeitos "number" e "text")
export function drawScreenEffects(zAt) {
  for (const ef of state.effects) {
    if (!SCREEN_EFFECTS.has(ef.type)) continue;
    const a = Math.max(0, ef.life / ef.maxLife);
    const rise = ef.type === "number" ? 40 : 30;
    const ly = ef.y - (1 - a) * rise;
    worldToScreen(logicToWorldX(ef.x), logicToWorldY(ly), zAt(ef.x), s);
    ctx.globalAlpha = a;
    const size = ef.type === "number" ? 12 + (ef.size || 0) : 11;
    outlinedText(ef.text, s.x, s.y, ef.color || "#e8c96a", size);
    ctx.globalAlpha = 1;
  }
}

// Escurece a tela e escreve um aviso centralizado (não treme com a câmera)
export function drawScreenMessage(dim, title, subtitle, titleSize, subtitleSize, gap) {
  const W = arena.width;
  const H = arena.height;
  ctx.fillStyle = `rgba(24,20,37,${dim})`;
  ctx.fillRect(0, 0, W, H);
  outlinedText(title, W / 2, H / 2 - gap.title, PALETTE.amber, titleSize);
  outlinedText(subtitle, W / 2, H / 2 + gap.subtitle, PALETTE.tan, subtitleSize, false);
}
