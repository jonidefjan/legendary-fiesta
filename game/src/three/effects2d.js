// ═══════════════════════════════════════════
//  EFEITOS 2D NO QUADRO BAIXA RESOLUÇÃO
// ═══════════════════════════════════════════
// state.effects (menos number/text, que vão para a camada nítida) e as
// partículas são desenhados num canvas do tamanho do quadro baixa resolução e
// compostos por cima da cena na ampliação: mesmos pixels grossos, sem contorno.
// Cada efeito ganha uma transformação afim lógica -> texel ancorada no plano
// de combate (o Z vem do personagem mais próximo).
import { state } from "../state.js";
import * as particles from "../particles.js";
import { ageEffects as ageList } from "../fx.js";
import {
  paddedSize,
  worldToLowRes,
  logicToWorldX,
  logicToWorldY,
  logicPxToLowRes,
} from "./view.js";

export const SCREEN_EFFECTS = new Set(["number", "text"]);

let canvas = null;
let ctx = null;

export function createFxCanvas() {
  canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  ctx = canvas.getContext("2d");
  return canvas;
}

export function resizeFxCanvas() {
  const { w, h } = paddedSize();
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

// Envelhece pelo tempo real do quadro (fx.js) e remove os que acabaram
export function ageEffects(realMs) {
  ageList(state.effects, realMs);
}

const anchor = { x: 0, y: 0 };

// Transformação afim: px lógico em volta de (lx, ly) -> texel do quadro
function setLogicTransform(lx, ly, z) {
  worldToLowRes(logicToWorldX(lx), logicToWorldY(ly), z, anchor);
  const s = logicPxToLowRes();
  ctx.setTransform(s, 0, 0, s, anchor.x - lx * s, anchor.y - ly * s);
  return s;
}

function dot(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  ctx.fill();
}

// Desenhos portados do render.js (sem shadowBlur); minW = 1 texel em px lógico
function drawEffect(ef, a, minW) {
  const lw = (px) => Math.max(px, minW);
  switch (ef.type) {
    case "slash": {
      ctx.strokeStyle = ef.color || "#e8c96a";
      ctx.lineWidth = lw(3 * a);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ef.x - 25, ef.y - 20);
      ctx.quadraticCurveTo(ef.x, ef.y - 30, ef.x + 25, ef.y - 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ef.x - 20, ef.y);
      ctx.quadraticCurveTo(ef.x + 5, ef.y - 20, ef.x + 30, ef.y + 5);
      ctx.stroke();
      break;
    }
    case "fire": {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + ef.life * 0.1;
        const r = (1 - a) * 40;
        ctx.fillStyle = i % 2 === 0 ? "#f77622" : "#feae34";
        dot(ef.x + Math.cos(angle) * r, ef.y + Math.sin(angle) * r * 0.5 - ef.life, lw(5 * a));
      }
      break;
    }
    case "lightning": {
      ctx.strokeStyle = "#2ce8f5";
      ctx.lineWidth = lw(2);
      let lx = ef.x;
      let ly = ef.y;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      for (let i = 0; i < 8; i++) {
        lx += (Math.random() - 0.5) * 20;
        ly -= 15;
        ctx.lineTo(lx, ly);
      }
      ctx.stroke();
      break;
    }
    case "heal": {
      const r = (1 - a) * 30;
      ctx.fillStyle = "#63c74d";
      dot(ef.x, ef.y - r, 8 * a);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(ef.x - 3, ef.y - r - 10 * a, 6, 20 * a);
      ctx.fillRect(ef.x - 10 * a, ef.y - r - 3, 20 * a, 6);
      break;
    }
    case "mana_orb": {
      ctx.fillStyle = "#b55088";
      dot(ef.x, ef.y - (1 - a) * 20, 8 * a);
      break;
    }
    case "shield": {
      ctx.strokeStyle = "#0099db";
      ctx.lineWidth = lw(3);
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, 30 * (2 - a), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "berserk": {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + ef.life * 0.05;
        const r = 20 + (1 - a) * 20;
        ctx.fillStyle = i % 3 === 0 ? "#e43b44" : "#f77622";
        dot(ef.x + Math.cos(ang) * r, ef.y + Math.sin(ang) * r * 0.6, lw(4 * a));
      }
      break;
    }
    case "death": {
      ctx.fillStyle = "#68386c";
      ctx.globalAlpha = a * 0.8;
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const r = (1 - a) * 50;
        dot(ef.x + Math.cos(ang) * r, ef.y + Math.sin(ang) * r * 0.5, lw(4 * a));
      }
      break;
    }
    case "dragon_roar": {
      ctx.strokeStyle = "#63c74d";
      ctx.lineWidth = lw(2 * a);
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = a * (1 - i * 0.2);
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, 20 + i * 20 + (1 - a) * 30, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case "phoenix": {
      ctx.fillStyle = "#feae34";
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2 + ef.life * 0.05;
        const r = (1 - a) * 60;
        dot(ef.x + Math.cos(ang) * r, ef.y + Math.sin(ang) * r * 0.6, lw(6 * a));
      }
      break;
    }
    default:
      break;
  }
}

// Contexto falso para particles.draw(): cada fillRect é projetado com o Z
// do personagem mais perto daquele x
function particleProxy(zAt) {
  const s = logicPxToLowRes();
  const p = { x: 0, y: 0 };
  return {
    fillStyle: "#fff",
    fillRect(x, y, w, h) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      worldToLowRes(logicToWorldX(cx), logicToWorldY(cy), zAt(cx), p);
      const sw = Math.max(1, Math.round(w * s));
      const sh = Math.max(1, Math.round(h * s));
      ctx.fillStyle = this.fillStyle;
      ctx.fillRect(Math.round(p.x - sw / 2), Math.round(p.y - sh / 2), sw, sh);
    },
  };
}

// Redesenha o canvas de efeitos
export function drawFx(zAt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const ef of state.effects) {
    if (SCREEN_EFFECTS.has(ef.type)) continue;
    const a = Math.max(0, ef.life / ef.maxLife);
    const s = setLogicTransform(ef.x, ef.y, zAt(ef.x));
    ctx.save();
    ctx.globalAlpha = a;
    drawEffect(ef, a, 1 / s);
    ctx.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  particles.draw(particleProxy(zAt));
}
