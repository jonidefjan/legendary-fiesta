// ═══════════════════════════════════════════
//  TELA INICIAL (Jogar, Continuar, Melhorias, recorde)
// ═══════════════════════════════════════════
// Desenha dentro de #title-screen (index.html); estilos em game/title.css.
import { state } from "./state.js";
import {
  UPGRADES,
  upgradeLevel,
  upgradeCost,
  buyUpgrade,
  describeLevel,
  isMaxed,
  upgradeName,
  upgradeDesc,
} from "./meta.js";
import { t, getLang } from "./i18n.js";
import * as save from "./save.js";
import { sfx } from "./audio.js";

let current = null; // { canContinue, onContinue, onNewRun }
let confirming = false; // pedindo confirmação para descartar a run salva
let lastBought = null; // id da melhoria recém-comprada (anima o card)

const root = () => document.getElementById("title-screen");

function esc(s) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return String(s).replace(/[&<>"]/g, (c) => map[c]);
}

function shopCard(u) {
  const lvl = upgradeLevel(u.id);
  const cost = upgradeCost(u.id);
  const can = state.fragments >= cost;
  const now = lvl > 0 ? describeLevel(u.id, lvl) : t("shop.none");
  const maxed = isMaxed(u.id);
  return `
    <div class="shop-card${u.id === lastBought ? " bought" : ""}" data-id="${u.id}">
      <div class="shop-head">
        <span class="shop-icon">${u.icon}</span>
        <span class="shop-name">${esc(upgradeName(u.id))}</span>
        <span class="shop-level">${esc(t("shop.level", { n: lvl }))}</span>
      </div>
      <div class="shop-desc">${esc(upgradeDesc(u.id))}</div>
      <div class="shop-effect">${esc(t("shop.current"))} <b>${esc(now)}</b></div>
      <div class="shop-effect">${maxed ? `<b>${esc(t("shop.maxLevel"))}</b>` : `${esc(t("shop.next"))} <b>${esc(describeLevel(u.id, lvl + 1))}</b>`}</div>
      <button class="title-btn shop-buy" data-buy="${u.id}"${can && !maxed ? "" : " disabled"}>
        ${maxed ? esc(t("shop.maxButton")) : esc(t("shop.buy", { cost }))}
      </button>
    </div>`;
}

function render(keepLangFocus = false) {
  const el = root();
  if (!el || !current) return;
  const { canContinue } = current;
  const best = state.meta.best || { wave: 0, score: 0 };
  const record =
    best.wave > 0
      ? t("title.record", { wave: best.wave, score: best.score })
      : t("title.recordNone");

  const buttons = confirming
    ? `<div class="title-confirm" role="alertdialog" aria-label="${esc(t("title.confirmLabel"))}">
         <p>${esc(t("title.confirmText"))}</p>
         <div class="title-actions">
           <button class="title-btn primary" data-act="confirm-new">${esc(t("title.confirmYes"))}</button>
           <button class="title-btn" data-act="cancel-new">${esc(t("title.confirmNo"))}</button>
         </div>
       </div>`
    : `<div class="title-actions">
         ${canContinue ? `<button class="title-btn primary" data-act="continue">${esc(t("title.continue"))}</button>` : ""}
         <button class="title-btn${canContinue ? "" : " primary"}" data-act="new">${esc(t("title.new"))}</button>
       </div>`;

  // Botões EN/PT: o clique é tratado por i18n.js (delegação em document)
  const langs = [
    ["en", "EN"],
    ["pt-BR", "PT"],
  ]
    .map(
      ([code, label]) =>
        `<button type="button" class="lang-btn" data-lang="${code}" lang="${code}" aria-pressed="${code === getLang()}">${label}</button>`,
    )
    .join("");

  el.innerHTML = `
    <div class="modal-content title-content">
      <div class="lang-toggle title-lang" role="group" aria-label="${esc(t("lang.label"))}">${langs}</div>
      <div class="modal-header title-header">
        <h1 class="title-logo">⚔ RELIQUARY</h1>
        <div class="modal-subtitle">${esc(t("title.tagline"))}</div>
        <div class="title-stats">
          <span>${esc(record)}</span>
          <span class="title-fragments">⚡ <b>${state.fragments}</b> ${esc(t("title.fragments", { count: state.fragments }))}</span>
        </div>
      </div>
      <div class="title-body">
        ${buttons}
        <h2 class="shop-title">${esc(t("shop.title"))}</h2>
        <div class="shop-grid">${UPGRADES.map(shopCard).join("")}</div>
      </div>
    </div>`;
  lastBought = null;
  // Ao trocar de idioma o foco volta para o botão EN/PT que o tinha
  const focus = keepLangFocus
    ? el.querySelector(`[data-lang="${keepLangFocus}"]`)
    : el.querySelector(".title-btn.primary");
  if (focus) focus.focus({ preventScroll: true });
}

// Troca de idioma com a tela inicial aberta: redesenha (confirmação e compras ficam)
export function refreshTitle() {
  const el = root();
  if (!el || !current || el.style.display === "none") return;
  const active = document.activeElement;
  render(active && el.contains(active) ? active.dataset.lang || false : false);
}

function onClick(e) {
  const btn = e.target.closest("button");
  if (!btn || btn.disabled || !current) return;
  if (btn.dataset.buy) {
    if (buyUpgrade(btn.dataset.buy)) {
      save.saveMeta();
      try {
        sfx.reward();
      } catch {
        // áudio é opcional
      }
      lastBought = btn.dataset.buy;
      render();
      // Mantém o foco no botão de compra do mesmo card (teclado)
      const again = root().querySelector(`[data-buy="${btn.dataset.buy}"]`);
      if (again && !again.disabled) again.focus({ preventScroll: true });
    }
    return;
  }
  const act = btn.dataset.act;
  if (act === "continue") current.onContinue();
  else if (act === "new") {
    if (current.canContinue) {
      confirming = true;
      render();
    } else current.onNewRun();
  } else if (act === "confirm-new") current.onNewRun();
  else if (act === "cancel-new") {
    confirming = false;
    render();
  }
}

// canContinue: existe run salva. onContinue/onNewRun: escolhas do jogador.
export function showTitle({ canContinue, onContinue, onNewRun }) {
  const el = root();
  if (!el) {
    if (canContinue) onContinue();
    else onNewRun();
    return;
  }
  current = { canContinue, onContinue, onNewRun };
  confirming = false;
  if (!el.dataset.bound) {
    el.addEventListener("click", onClick);
    el.dataset.bound = "1";
  }
  render();
  el.style.display = "flex";
}

export function hideTitle() {
  const el = root();
  if (el) el.style.display = "none";
}
