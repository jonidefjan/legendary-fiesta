// ═══════════════════════════════════════════
//  LAYOUT: regras puras de tela (sem DOM, testáveis em node)
// ═══════════════════════════════════════════
import { CAMERA } from "./three/world.js";

export const PHONE_MAX_WIDTH = 768;
// Celular deitado: modo compacto do CSS (cabeçalho fino, itens recolhidos)
export const COMPACT_MAX_HEIGHT = 500;
// Altura mínima da arena em retrato (igual ao min-height do CSS)
export const ARENA_MIN_HEIGHT = 260;

// Itens começam recolhidos só onde, abertos, empurrariam a arena (quadrada, no
// retrato) para fora da tela. A escolha salva do jogador manda.
//   saved: "1", "0" ou null/undefined (sem escolha)
//   chromeOpenH: altura medida do cabeçalho + barra de itens ABERTA
export function defaultCollapsed(saved, width, height, chromeOpenH = 0) {
  if (saved === "1") return true;
  if (saved === "0") return false;
  if (height <= COMPACT_MAX_HEIGHT) return true; // deitado: a batalha vem primeiro
  if (width > PHONE_MAX_WIDTH) return false; // desktop rola a página se precisar
  return chromeOpenH + Math.max(ARENA_MIN_HEIGHT, width) > height;
}

// Faixa de chão (eixo Z) que a câmera mostra para uma meia altura de vista.
// Resolve a altura na tela do ponto do chão (y=0) em z contra ±halfH, com a
// mesma base da câmera de view.js.
export function visibleGroundRange(halfH) {
  const p = (CAMERA.pitchDeg * Math.PI) / 180;
  const sin = Math.sin(p);
  const cos = Math.cos(p);
  const t = CAMERA.target;
  // tela_y(z) = (0 - t.y)·cos - (z - t.z)·sin
  const zAt = (screenY) => t.z + (-t.y * cos - screenY) / sin;
  return { back: zAt(halfH), front: zAt(-halfH) };
}

// Meia altura da vista para uma arena (mesma conta de view.js resizeView)
export function halfHeightFor(cssW, cssH, lowH, minHalfWidth) {
  const lowW = Math.max(1, Math.round((lowH * cssW) / cssH));
  return Math.max(CAMERA.viewHeight / 2, (minHalfWidth * lowH) / lowW);
}
