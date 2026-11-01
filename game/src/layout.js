// ═══════════════════════════════════════════
//  LAYOUT: regras puras de tela (sem DOM, testáveis em node)
// ═══════════════════════════════════════════
import { CAMERA } from "./three/world.js";

// Barra de itens: a escolha salva do jogador manda; sem escolha, fica aberta
// em qualquer tela (decisão do usuário, inclusive no celular).
//   saved: "1", "0" ou null/undefined (sem escolha)
export function defaultCollapsed(saved) {
  return saved === "1";
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

// Itens no celular: detalhes num painel embaixo (sem tooltip flutuante).
// Vale para telas sem hover (toque) ou estreitas.
export function usesItemPanel({ hoverNone, width }) {
  return Boolean(hoverNone) || width <= 768;
}

// Acima disso a caixa de itens vira rolável no celular (classe inv-scroll)
export const INV_SCROLL_THRESHOLD = 6;
export function needsInvScroll(count) {
  return count > INV_SCROLL_THRESHOLD;
}

// Contador de stacks no overlay (×N): números grandes ficam curtos para caber ao lado do ícone
export function formatStacks(n) {
  const v = Math.max(0, Math.floor(n));
  if (v < 1000) return String(v);
  if (v < 10000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (v < 1000000) return `${Math.floor(v / 1000)}k`;
  return `${(v / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
}
