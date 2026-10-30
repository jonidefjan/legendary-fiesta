// ═══════════════════════════════════════════
//  INTERFACE (DOM): inventário, HUD, log, modais e botões
// ═══════════════════════════════════════════
import { state } from "./state.js";
import { RARITIES, getTypeLabel, findItem } from "./items.js";

export const isMobile =
  "ontouchstart" in window || navigator.maxTouchPoints > 0;

const $ = (id) => document.getElementById(id);

// ═══════════════════════════════════════════
//  INVENTORY
// ═══════════════════════════════════════════
export function renderInventory() {
  ["weapon", "armor", "relic"].forEach((type) => {
    const el = $("slots-" + type);
    el.innerHTML = "";
    const typeItems = state.items.filter((i) => i.type === type);
    typeItems.forEach((item) => {
      const slot = document.createElement("div");
      slot.className = "item-slot";
      slot.dataset.id = item.id;
      slot.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="rarity-gem rarity-${item.rarity}"></div>
        <div class="cooldown-overlay" id="cd-text-${item.id}"></div>
        <div class="cd-bar" id="cd-bar-${item.id}" style="width:100%"></div>
      `;
      // Desktop: mouse events
      slot.addEventListener("mouseenter", (e) => showTooltip(item, e));
      slot.addEventListener("mouseleave", hideTooltip);
      slot.addEventListener("mousemove", (e) => moveTooltip(e));
      // Mobile: touch events
      slot.addEventListener("touchstart", (e) => {
        e.preventDefault();
        showTooltip(item, e.touches[0]);
      });
      el.appendChild(slot);
    });
  });
}

export function flashItem(id) {
  const slot = document.querySelector(`.item-slot[data-id="${id}"]`);
  if (slot) {
    slot.classList.add("active");
    setTimeout(() => slot.classList.remove("active"), 600);
  }
}

// ═══════════════════════════════════════════
//  TOOLTIP
// ═══════════════════════════════════════════
const tooltip = $("tooltip");

function showTooltip(item, e) {
  const r = RARITIES[item.rarity];
  tooltip.innerHTML = `
    <div class="tt-name" style="color:${r.color}">${item.icon} ${item.name}</div>
    <div class="tt-rarity" style="color:${r.color}">${r.label}</div>
    <div class="tt-desc">${item.desc}</div>
    <div class="tt-effect">${item.effect}</div>
    ${item.enchant ? `<div class="tt-enchant">${item.enchant}</div>` : ""}
    ${item.cooldown > 0 ? `<div class="tt-cd">⏱ Recarga: ${(item.cooldown / 1000).toFixed(1)}s</div>` : ""}
  `;

  if (isMobile) {
    // Mobile: posição fixa centralizada
    tooltip.classList.add("mobile");
  } else {
    // Desktop: segue o cursor
    tooltip.classList.remove("mobile");
    moveTooltip(e);
  }

  tooltip.classList.add("show");
}

function hideTooltip() {
  tooltip.classList.remove("show");
}

function moveTooltip(e) {
  if (isMobile) return; // Não move em mobile

  const tw = 280;
  const th = 200;
  let x = e.clientX + 14;
  let y = e.clientY - 20;

  // Ajusta se sair da tela
  if (x + tw > window.innerWidth) x = e.clientX - tw - 14;
  if (y + th > window.innerHeight) y = window.innerHeight - th - 10;
  if (x < 0) x = 10;
  if (y < 0) y = 10;

  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

// Fechar tooltip ao tocar fora em mobile
if (isMobile) {
  document.addEventListener("touchstart", (e) => {
    if (tooltip.classList.contains("show") && !e.target.closest(".item-slot")) {
      hideTooltip();
    }
  });
}

// ═══════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════
export function updateHUD() {
  const p = state.player;
  // Bars
  $("hp-bar").style.width = (p.hp / p.maxHp) * 100 + "%";
  $("hp-val").textContent = `${Math.max(0, Math.round(p.hp))}/${p.maxHp}`;
  $("mana-bar").style.width = (p.mana / p.maxMana) * 100 + "%";
  $("mana-val").textContent = `${Math.round(p.mana)}/${p.maxMana}`;

  // Header stats
  $("hdr-wave").textContent = state.wave;
  $("hdr-kills").textContent = state.kills;
  $("hdr-score").textContent = state.score;
  $("hdr-fragments").textContent = state.fragments;

  // Wave info bar
  $("inv-wave").textContent = `Onda ${state.wave}`;
  const alive = state.enemies.filter((e) => !e.dead).length;
  $("inv-enemies").textContent = `${alive} inimigo${alive !== 1 ? "s" : ""}`;
  $("inv-gold").textContent = `⚙ ${state.gold} ouro`;

  // Item cooldown bars
  state.items.forEach((item) => {
    if (item.cooldown <= 0) return;
    const timer = state.itemTimers[item.id];
    const slot = document.querySelector(`.item-slot[data-id="${item.id}"]`);
    if (!slot || !timer) return;
    const pct = Math.min(1, timer.elapsed / timer.cooldown);
    const bar = $("cd-bar-" + item.id);
    const cdText = $("cd-text-" + item.id);

    if (pct < 1) {
      slot.classList.add("cooldown");
      slot.classList.remove("active");
      if (bar) bar.style.width = pct * 100 + "%";
      if (cdText) {
        const remaining = ((timer.cooldown - timer.elapsed) / 1000).toFixed(1);
        cdText.textContent = remaining + "s";
      }
    } else {
      slot.classList.remove("cooldown");
      if (bar) bar.style.width = "100%";
      if (cdText) cdText.textContent = "";
    }
  });
}

// ═══════════════════════════════════════════
//  LOG
// ═══════════════════════════════════════════
export function addLog(msg, type = "") {
  const panel = $("log-panel");
  const entry = document.createElement("div");
  entry.className = "log-entry " + type;
  const ts = new Date().toLocaleTimeString("pt-BR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  entry.textContent = `[${ts}] ${msg}`;
  panel.appendChild(entry);
  panel.scrollTop = panel.scrollHeight;
  // Cap log
  while (panel.children.length > 80) panel.removeChild(panel.firstChild);
}

export function clearLog() {
  $("log-panel").innerHTML = "";
}

// ═══════════════════════════════════════════
//  MODAIS DE ESCOLHA DE ITEM
// ═══════════════════════════════════════════
function itemCard(item, onClick) {
  const card = document.createElement("div");
  card.className = "item-choice-card";
  card.dataset.itemId = item.id;
  card.onclick = () => onClick(card);

  const rarityInfo = RARITIES[item.rarity];
  card.innerHTML = `
    <div class="item-choice-type">${getTypeLabel(item.type)}</div>
    <div class="item-choice-icon">${item.icon}</div>
    <div class="item-choice-name">${item.name}</div>
    <div class="item-choice-rarity rarity-${item.rarity}">${rarityInfo.label}</div>
    <div class="item-choice-desc">${item.desc}</div>
    <div class="item-choice-effect">${item.effect}</div>
    ${item.enchant ? `<div class="item-choice-enchant">${item.enchant}</div>` : ""}
    <div class="selection-indicator">✓</div>
  `;
  return card;
}

export function hideItemModal() {
  $("item-choice-modal").style.display = "none";
}

// Escolha inicial: até maxSelections itens; onConfirm recebe os itens escolhidos
export function showInitialPick(options, maxSelections, onConfirm) {
  const modal = $("item-choice-modal");
  const container = $("item-choices-container");
  const selected = [];

  modal.querySelector(".modal-header").innerHTML = `
    <h2>⚔️ Escolha Seus Itens Iniciais</h2>
    <p class="modal-subtitle">Selecione até ${maxSelections} itens para começar sua jornada</p>
    <div class="selection-counter">
      <span id="selection-count">0</span> / ${maxSelections} selecionados
    </div>
  `;
  container.innerHTML = "";

  const confirmBtn = document.createElement("div");
  confirmBtn.className = "confirm-selection-btn";
  confirmBtn.id = "confirm-selection-btn";
  confirmBtn.innerHTML = "Iniciar Jogo";

  options.forEach((item) => {
    container.appendChild(
      itemCard(item, (card) => {
        const index = selected.findIndex((i) => i.id === item.id);
        if (index >= 0) {
          selected.splice(index, 1);
          card.classList.remove("selected");
        } else if (selected.length < maxSelections) {
          selected.push(item);
          card.classList.add("selected");
        } else {
          addLog(
            `⚠️ Você já selecionou o máximo de ${maxSelections} itens!`,
            "item",
          );
          return;
        }
        $("selection-count").textContent = selected.length;
        confirmBtn.classList.toggle("active", selected.length > 0);
      }),
    );
  });

  confirmBtn.onclick = () => {
    if (selected.length === 0) {
      addLog("⚠️ Selecione pelo menos 1 item para continuar!", "item");
      return;
    }
    hideItemModal();
    onConfirm([...selected]);
  };
  container.appendChild(confirmBtn);

  modal.style.display = "flex";
}

// Recompensa da onda: 1 item; onPick recebe o item escolhido
export function showRewardPick(options, wave, onPick) {
  const modal = $("item-choice-modal");
  const container = $("item-choices-container");

  // Reescreve o cabeçalho inteiro: a escolha inicial deixa um contador de seleção nele
  modal.querySelector(".modal-header").innerHTML = `
    <h2>🎁 Recompensa da Onda!</h2>
    <p class="modal-subtitle">Escolha 1 item de ${options.length} opções · Onda ${wave} concluída</p>
  `;
  container.innerHTML = "";
  options.forEach((item) => {
    container.appendChild(
      itemCard(item, () => {
        hideItemModal();
        onPick(item);
      }),
    );
  });

  modal.style.display = "flex";
}

// ═══════════════════════════════════════════
//  GAME OVER SCREEN
// ═══════════════════════════════════════════
export function showGameOver() {
  // Duração da run
  const elapsed = performance.now() - (state.runStats.startTime || 0);
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  // Item mais usado
  const uses = Object.entries(state.runStats.itemUses);
  let favoriteItem = "—";
  if (uses.length > 0) {
    const [topId, topCount] = uses.reduce((a, b) => (b[1] > a[1] ? b : a));
    const item = findItem(topId);
    if (item) favoriteItem = `${item.icon} ${item.name} (${topCount}×)`;
  }

  $("go-subtitle").textContent = `Você caiu na onda ${state.wave}.`;

  const stats = [
    { label: "🌊 Onda alcançada", value: state.wave },
    { label: "💀 Inimigos mortos", value: state.kills },
    { label: "🏆 Pontuação", value: state.score },
    { label: "⚙ Ouro acumulado", value: state.gold },
    { label: "⚔ Dano total causado", value: state.runStats.totalDamage },
    { label: "⏱ Duração da run", value: duration },
    { label: "⭐ Item favorito", value: favoriteItem, wide: true },
    {
      label: "⚡ Fragmentos (mantidos)",
      value: state.fragments,
      wide: true,
    },
  ];

  $("go-stats").innerHTML = stats
    .map(
      (s) => `
      <div class="go-stat${s.wide ? " wide" : ""}">
        <div class="go-stat-label">${s.label}</div>
        <div class="go-stat-value">${s.value}</div>
      </div>`,
    )
    .join("");

  $("game-over-modal").style.display = "flex";
}

export function hideGameOver() {
  $("game-over-modal").style.display = "none";
}

// ═══════════════════════════════════════════
//  GAME CONTROLS (PLAY/PAUSE)
// ═══════════════════════════════════════════
export function setupControls({ onPlay, onPause, onReset, onSpeed, onMute, onRestart }) {
  $("btn-play").addEventListener("click", onPlay);
  $("btn-pause").addEventListener("click", onPause);
  $("btn-reset").addEventListener("click", onReset);
  $("btn-restart").addEventListener("click", onRestart);
  $("btn-speed").addEventListener("click", () => {
    const speed = onSpeed();
    $("btn-speed").textContent = `⏩ ${speed}×`;
    $("btn-speed").classList.toggle("active", speed > 1);
  });
  $("btn-mute").addEventListener("click", () => {
    $("btn-mute").textContent = onMute() ? "🔇" : "🔊";
  });
}

// Play ativo quando pausado; Pause ativo quando rodando
export function setPausedControls(paused) {
  const btnPlay = $("btn-play");
  const btnPause = $("btn-pause");
  btnPlay.disabled = !paused;
  btnPlay.classList.toggle("active", paused);
  btnPause.disabled = paused;
  btnPause.classList.toggle("active", !paused);
}
