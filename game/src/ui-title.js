// ═══════════════════════════════════════════
//  TELA INICIAL (Jogar, Continuar, Melhorias, recorde)
// ═══════════════════════════════════════════
// Desenha dentro de #title-screen (index.html); estilos em game/title.css.
import { state } from "./state.js";
import { UPGRADES, upgradeLevel, upgradeCost, buyUpgrade, describeLevel, isMaxed } from "./meta.js";
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
  const now = lvl > 0 ? describeLevel(u.id, lvl) : "nenhum bônus";
  const maxed = isMaxed(u.id);
  return `
    <div class="shop-card${u.id === lastBought ? " bought" : ""}" data-id="${u.id}">
      <div class="shop-head">
        <span class="shop-icon">${u.icon}</span>
        <span class="shop-name">${esc(u.name)}</span>
        <span class="shop-level">Nv. ${lvl}</span>
      </div>
      <div class="shop-desc">${esc(u.desc)}</div>
      <div class="shop-effect">Atual: <b>${esc(now)}</b></div>
      <div class="shop-effect">${maxed ? "<b>Nível máximo</b>" : `Próximo: <b>${esc(describeLevel(u.id, lvl + 1))}</b>`}</div>
      <button class="title-btn shop-buy" data-buy="${u.id}"${can && !maxed ? "" : " disabled"}>
        ${maxed ? "Máximo" : `Comprar · ⚡ ${cost}`}
      </button>
    </div>`;
}

function render() {
  const el = root();
  if (!el || !current) return;
  const { canContinue } = current;
  const best = state.meta.best || { wave: 0, score: 0 };
  const record =
    best.wave > 0 ? `Recorde: onda ${best.wave} · ${best.score} pontos` : "Recorde: ainda sem registro";

  const buttons = confirming
    ? `<div class="title-confirm" role="alertdialog" aria-label="Confirmar nova run">
         <p>Começar uma nova run descarta a run salva. Continuar?</p>
         <div class="title-actions">
           <button class="title-btn primary" data-act="confirm-new">Sim, nova run</button>
           <button class="title-btn" data-act="cancel-new">Cancelar</button>
         </div>
       </div>`
    : `<div class="title-actions">
         ${canContinue ? `<button class="title-btn primary" data-act="continue">Continuar run</button>` : ""}
         <button class="title-btn${canContinue ? "" : " primary"}" data-act="new">Nova run</button>
       </div>`;

  el.innerHTML = `
    <div class="modal-content title-content">
      <div class="modal-header title-header">
        <h1 class="title-logo">⚔ RELIQUARY</h1>
        <div class="modal-subtitle">Sobreviva às ondas. Forje relíquias. Vença o chefe.</div>
        <div class="title-stats">
          <span>${esc(record)}</span>
          <span class="title-fragments">⚡ <b>${state.fragments}</b> fragmentos</span>
        </div>
      </div>
      <div class="title-body">
        ${buttons}
        <h2 class="shop-title">Loja de melhorias</h2>
        <div class="shop-grid">${UPGRADES.map(shopCard).join("")}</div>
      </div>
    </div>`;
  lastBought = null;
  const focus = el.querySelector(".title-btn.primary");
  if (focus) focus.focus({ preventScroll: true });
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
