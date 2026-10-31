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

// Em telas estreitas os botões (#game-controls) cobrem o alto da arena:
// se a barra colidir com eles, ela desce para o pé da arena
function bossBarY(W, h, b, x, w) {
  const top = 80;
  const controls = document.getElementById("game-controls");
  if (!controls || !canvas || W > 768) return top;
  const c = controls.getBoundingClientRect();
  const a = canvas.getBoundingClientRect();
  const hitsX = c.left - a.left < x + w + b && c.right - a.left > x - b;
  const hitsY = c.top - a.top < top + h + b + 6 && c.bottom - a.top > top - 30;
  if (!hitsX || !hitsY) return top;
  return Math.max(top, Math.round(arena.height - h - 16));
}

// Barra grossa do chefe, no alto da arena: nome em cima, 10 marcas de 10%
function drawBossBar(boss) {
  const W = arena.width;
  const w = Math.round(Math.min(W - 32, 420));
  const h = W < 520 ? 14 : 18;
  const b = 3;
  const x = Math.round((W - w) / 2);
  const y = bossBarY(W, h, b, x, w);
  const pct = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
  const enraged = !!boss.enraged;
  outlinedText(boss.name, W / 2, y - 8, enraged ? PALETTE.pink : PALETTE.bone, W < 520 ? 14 : 18);
  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(x - b, y - b, w + b * 2, h + b * 2);
  ctx.fillStyle = PALETTE.darkBrown;
  ctx.fillRect(x, y, w, h);
  const fw = Math.round(w * pct);
  if (fw > 0) {
    ctx.fillStyle = enraged ? PALETTE.hotPink : PALETTE.red;
    ctx.fillRect(x, y, fw, h);
    ctx.fillStyle = enraged ? PALETTE.pink : PALETTE.orange;
    ctx.fillRect(x, y, fw, 4);
    ctx.fillStyle = PALETTE.crimson;
    ctx.fillRect(x, y + h - 3, fw, 3);
  }
  ctx.fillStyle = PALETTE.night;
  for (let i = 1; i < 10; i++) ctx.fillRect(x + Math.round((w * i) / 10) - 1, y, 2, h);
  outlinedText(`${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp}`, W / 2, y + h - 3, PALETTE.white, 11, false);
}

const v = new THREE.Vector3();
const s = { x: 0, y: 0 };
const pt = { x: 0, y: 0 };
const items = [];
const labels = [];

// Nome, barra de vida e DoTs de cada inimigo vivo, e a barra do herói
export function drawBars(characters) {
  // De trás para a frente; nome que cairia em cima de outro é omitido
  items.length = 0;
  labels.length = 0;
  const boss = state.enemies.find((e) => e.isBoss && !e.dead);
  if (boss) drawBossBar(boss);
  for (const en of state.enemies) {
    if (en.dead || en.isBoss || !characters.enemyAnchor(en, v)) continue;
    const p = worldToScreen(v.x, v.y, v.z, pt);
    if (p.x < -60 || p.x > arena.width + 60) continue;
    items.push({ en, x: p.x, y: p.y });
  }
  items.sort((a, b) => a.y - b.y);
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
