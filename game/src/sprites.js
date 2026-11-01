// ═══════════════════════════════════════════
//  SPRITES DOS ITENS: converte a arte em texto (item-art.js) em imagens
// ═══════════════════════════════════════════
// A arte é uma grade de caracteres; aqui vira um canvas 1 pixel por célula e depois
// um data URL, que o <img> amplia com image-rendering: pixelated (sem borrar).
import { ART_PALETTE, ITEM_ART, ITEM_ELEMENTS, ELEMENT_ART } from "./item-art.js";

const cache = new Map(); // "item:id" / "el:nome" → data URL (ou null)

// Sem document (testes em node) ou sem canvas, não há como desenhar
function render(rows) {
  if (typeof document === "undefined" || !Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const h = rows.length;
  const w = rows[0].length;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return null;
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const color = ART_PALETTE[row[x]];
      if (!color) continue; // transparente ou caractere desconhecido
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return canvas.toDataURL("image/png");
}

function cached(key, rows) {
  if (!cache.has(key)) cache.set(key, render(rows));
  return cache.get(key);
}

// Data URL do sprite 16×16 do item; null se não houver arte (a interface usa o emoji)
export function itemSpriteURL(id) {
  return cached("item:" + id, ITEM_ART[id]);
}

// Formas evoluídas usam a arte do item base (campo "art" do items.json)
const artId = (item) => item.art || item.id;

// Data URL do símbolo 7×7 do elemento; null se não houver
export function elementSpriteURL(element) {
  return cached("el:" + element, ELEMENT_ART[element]);
}

// Elemento do item (símbolo do canto) ou null
export function itemElement(id) {
  return ITEM_ELEMENTS[id] || null;
}

// HTML do ícone do item: <img> do sprite (+ selo do elemento) ou o emoji de reserva.
// O selo do elemento (canto superior esquerdo) só aparece se o item tiver elemento
export function itemIconHTML(item, { badge = true } = {}) {
  const url = itemSpriteURL(artId(item));
  if (!url) return item.icon;
  const el = badge ? itemElement(artId(item)) : null;
  const elUrl = el ? elementSpriteURL(el) : null;
  const img = `<img class="item-sprite" src="${url}" alt="" draggable="false">`;
  const mark = elUrl
    ? `<img class="element-badge" src="${elUrl}" alt="" draggable="false" data-element="${el}">`
    : "";
  return img + mark;
}
