// ═══════════════════════════════════════════
//  COMPARTILHAR O RESULTADO DA RUN
// ═══════════════════════════════════════════
// Resumo da run, arma favorita, texto e imagem do cartão (canvas) e o envio.
// A parte pura (resumo, texto, arma favorita) roda em node; o DOM só é tocado dentro
// das funções de imagem e de botão, nunca ao importar.
import { state } from "./state.js";
import { findItem } from "./items.js";
import { DICTS, DEFAULT_LANG, getLang, t } from "./i18n.js";
import { itemSpriteURL, itemIconHTML } from "./sprites.js";

export const SHARE_URL = "https://jm77os.com.br/game/";
export const IMAGE_SIZE = { width: 1200, height: 630 };

// Arma (type "weapon") com mais dano na run; empate fica com a primeira registrada.
// Devolve { id, damage } ou null se nenhuma arma causou dano.
export function favoriteWeapon(damageByItem = {}, find = findItem) {
  let best = null;
  for (const [id, damage] of Object.entries(damageByItem)) {
    if (!(damage > 0) || find(id)?.type !== "weapon") continue;
    if (!best || damage > best.damage) best = { id, damage };
  }
  return best;
}

export function formatDuration(ms) {
  const total = Math.floor((ms || 0) / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// Números da run atual; as telas de fim congelam este objeto
export function runResult() {
  const stats = state.runStats;
  return {
    wave: state.wave,
    kills: state.kills,
    score: state.score,
    damage: stats.totalDamage,
    fragments: state.fragments,
    durationMs: performance.now() - (stats.startTime || 0),
    favorite: favoriteWeapon(stats.damageByItem),
  };
}

// Texto curto com o link, no idioma pedido (não depende do idioma ativo da página)
export function shareText(result, lang = getLang()) {
  const dict = DICTS[lang] || DICTS[DEFAULT_LANG];
  const template = dict["share.text"] ?? DICTS[DEFAULT_LANG]["share.text"];
  const params = { wave: result.wave, score: result.score, url: SHARE_URL };
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

// HTML do valor "arma favorita" das telas de fim: sprite, nome e dano total (ou "—")
export function favoriteCellHTML(favorite) {
  const item = favorite ? findItem(favorite.id) : null;
  if (!item) return t("share.none");
  return `<span class="inline-icon">${itemIconHTML(item, { badge: false })}</span> ${item.name} <span class="go-fav-dmg">${favorite.damage}</span>`;
}

export function imageFileName(result) {
  return `reliquary-wave-${result.wave}.png`;
}

// ─── Imagem do cartão ───
const COLORS = {
  bg: "#0a0806",
  panel: "#1c1710",
  panel2: "#261f15",
  border: "#5a4a2e",
  gold: "#c9a84c",
  gold2: "#e8c96a",
  gold3: "#f5e09a",
  text: "#d4c4a0",
  text3: "#a08860",
};
const FONT = '"Reliquary Digits", "Pixelify Sans", sans-serif';

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Fontes da página só baixam quando algo as usa: pede as que o cartão precisa
async function waitFonts(sample) {
  try {
    await Promise.all(
      [`700 64px ${FONT}`, `400 28px ${FONT}`].map((f) => document.fonts.load(f, sample)),
    );
    await document.fonts.ready;
  } catch {
    // sem a API de fontes: desenha com a fonte de reserva
  }
}

// Moldura de pixel: retângulo cheio com borda e cantos "cortados" em degrau
function pixelBox(ctx, x, y, w, h, fill, stroke, px = 6) {
  ctx.fillStyle = stroke;
  ctx.fillRect(x + px, y, w - 2 * px, h);
  ctx.fillRect(x, y + px, w, h - 2 * px);
  ctx.fillStyle = fill;
  ctx.fillRect(x + px * 1.5, y + px / 2, w - 3 * px, h - px);
  ctx.fillRect(x + px / 2, y + px * 1.5, w - px, h - 3 * px);
}

function label(ctx, str, x, y, size, color, align = "left", weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const shadow = Math.max(2, size / 20);
  ctx.fillStyle = "#000000";
  ctx.fillText(str, x + shadow, y + shadow); // sombra dura, no estilo pixel
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// Desenha o cartão e devolve o canvas
export async function renderResultCanvas(result) {
  const weapon = result.favorite ? findItem(result.favorite.id) : null;
  const sample = [
    t("share.img.wave"),
    t("share.img.kills"),
    t("share.img.score"),
    t("share.img.favorite"),
    t("share.img.damage", { damage: 0 }),
    t("share.img.url"),
    weapon?.name || "",
    "RELIQUARY 0123456789",
  ].join(" ");
  const [, sprite] = await Promise.all([
    waitFonts(sample),
    loadImage(weapon && itemSpriteURL(weapon.id)),
  ]);

  const { width: W, height: H } = IMAGE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
  pixelBox(ctx, 16, 16, W - 32, H - 32, COLORS.bg, COLORS.gold, 12);

  label(ctx, "RELIQUARY", W / 2, 118, 96, COLORS.gold3, "center");

  // Três quadros: onda, abates, pontos
  const stats = [
    [t("share.img.wave"), result.wave],
    [t("share.img.kills"), result.kills],
    [t("share.img.score"), result.score],
  ];
  const boxW = 330;
  const gap = 30;
  const startX = (W - (boxW * 3 + gap * 2)) / 2;
  stats.forEach(([name, value], i) => {
    const x = startX + i * (boxW + gap);
    pixelBox(ctx, x, 160, boxW, 170, COLORS.panel, COLORS.border);
    label(ctx, name, x + boxW / 2, 208, 28, COLORS.text3, "center", 400);
    label(ctx, String(value), x + boxW / 2, 292, 72, COLORS.gold2, "center");
  });

  // Arma favorita: sprite 16×16 ampliado sem borrar
  const fw = boxW * 3 + gap * 2;
  pixelBox(ctx, startX, 360, fw, 190, COLORS.panel, COLORS.border);
  label(ctx, t("share.img.favorite"), startX + 40, 398, 28, COLORS.text3, "left", 400);
  if (weapon && result.favorite) {
    const size = 96;
    const sx = startX + 40;
    const sy = 360 + 80;
    pixelBox(ctx, sx - 8, sy - 8, size + 16, size + 16, COLORS.panel2, COLORS.border, 4);
    if (sprite) ctx.drawImage(sprite, sx, sy, size, size);
    const tx = sx + size + 44;
    label(ctx, weapon.name, tx, 482, 56, COLORS.text, "left");
    label(ctx, t("share.img.damage", { damage: result.favorite.damage }), tx, 530, 38, COLORS.gold2, "left");
  } else {
    label(ctx, t("share.none"), startX + 40, 500, 72, COLORS.gold2, "left");
  }

  label(ctx, t("share.img.url"), W / 2, 594, 26, COLORS.text3, "center", 400);
  return canvas;
}

export async function renderResultBlob(result) {
  const canvas = await renderResultCanvas(result);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// ─── Envio ───
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(str) {
  try {
    await navigator.clipboard.writeText(str);
    return true;
  } catch {
    return false;
  }
}

const isAbort = (e) => e && e.name === "AbortError";

// Devolve a chave da mensagem a mostrar (null = nada a dizer: o sistema já confirmou ou
// o jogador cancelou)
export async function shareResult(result) {
  const message = shareText(result);
  const title = t("share.title");
  let blob = null;
  try {
    blob = await renderResultBlob(result);
  } catch (error) {
    console.error("❌ Erro ao gerar a imagem:", error);
  }
  const name = imageFileName(result);
  const file = blob ? new File([blob], name, { type: "image/png" }) : null;
  const nav = typeof navigator === "undefined" ? {} : navigator;

  try {
    if (file && nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], text: message, title });
      return null;
    }
    if (nav.share) {
      await nav.share({ text: message, title });
      return null;
    }
  } catch (error) {
    if (isAbort(error)) return null; // o jogador cancelou
    console.error("❌ Erro ao compartilhar:", error);
    return "share.failed";
  }

  // Desktop sem Web Share: copia o texto e baixa a imagem
  const copied = await copyText(message);
  if (blob) download(blob, name);
  if (copied && blob) return "share.copied";
  if (copied) return "share.copiedText";
  if (blob) return "share.downloaded";
  return "share.failed";
}

// Botão + linha de aviso; getResult devolve o resultado congelado da tela
export function createShareControls(getResult) {
  const box = document.createElement("div");
  box.className = "share-controls";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "share-btn";
  btn.textContent = t("share.button");
  const status = document.createElement("p");
  status.className = "share-status";
  status.setAttribute("role", "status");
  let timer = null;
  btn.addEventListener("click", async () => {
    const result = getResult();
    if (!result || btn.disabled) return;
    btn.disabled = true;
    try {
      const key = await shareResult(result);
      status.textContent = key ? t(key) : "";
    } finally {
      btn.disabled = false;
    }
    clearTimeout(timer);
    timer = setTimeout(() => (status.textContent = ""), 5000);
  });
  box.append(btn, status);
  return box;
}
