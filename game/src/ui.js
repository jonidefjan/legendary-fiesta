// ═══════════════════════════════════════════
//  INTERFACE (DOM): inventário, HUD, log, modais e botões
// ═══════════════════════════════════════════
import { state } from "./state.js";
import {
  RARITIES,
  maxLevelOf,
  getTypeLabel,
  findItem,
  itemLevel,
  effectiveCooldown,
} from "./items.js";
import { t, formatNumber } from "./i18n.js";
import { defaultCollapsed } from "./layout.js";

export const isMobile =
  "ontouchstart" in window || navigator.maxTouchPoints > 0;

const $ = (id) => document.getElementById(id);

const ROMAN = ["", "I", "II", "III", "IV", "V"];

// ═══════════════════════════════════════════
//  INVENTORY
// ═══════════════════════════════════════════
export function renderInventory() {
  $("inv-count").textContent = state.items.length;
  ["weapon", "armor", "relic"].forEach((type) => {
    const el = $("slots-" + type);
    el.innerHTML = "";
    const typeItems = state.items.filter((i) => i.type === type);
    typeItems.forEach((item) => {
      const slot = document.createElement("div");
      slot.className = "item-slot";
      slot.dataset.id = item.id;
      const level = itemLevel(item.id);
      if (level >= maxLevelOf(item) && maxLevelOf(item) > 1) slot.classList.add("max-level");
      slot.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="rarity-gem rarity-${item.rarity}"></div>
        ${level > 1 ? `<div class="level-badge">${ROMAN[level]}</div>` : ""}
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
  const level = itemLevel(item.id);
  const cooldown = item.cooldown > 0 ? effectiveCooldown(item) : 0;
  tooltip.innerHTML = `
    <div class="tt-name" style="color:${r.color}">${item.icon} ${item.name}</div>
    <div class="tt-rarity" style="color:${r.color}">${r.label}</div>
    <div class="tt-level">${t("item.level", { level, max: maxLevelOf(item) })}</div>
    <div class="tt-desc">${item.desc}</div>
    <div class="tt-effect">${item.effect}</div>
    ${item.enchant ? `<div class="tt-enchant">${item.enchant}</div>` : ""}
    ${cooldown > 0 ? `<div class="tt-cd">${t("item.cooldown", { seconds: formatNumber(cooldown / 1000, 1) })}</div>` : ""}
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
  $("inv-wave").textContent = t("hud.wave", { n: state.wave });
  const alive = state.enemies.filter((e) => !e.dead).length;
  $("inv-enemies").textContent = t("hud.enemies", { count: alive });
  $("inv-best").textContent = t("hud.best", { wave: state.meta.best.wave });

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
        const remaining = formatNumber((timer.cooldown - timer.elapsed) / 1000, 1);
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
//  MODAIS DE ESCOLHA DE ITEM
// ═══════════════════════════════════════════
function itemCard(item, onClick) {
  const card = document.createElement("div");
  card.className = "item-choice-card";
  card.dataset.itemId = item.id;
  card.onclick = () => onClick(card);

  const rarityInfo = RARITIES[item.rarity];
  // Quem já tem o item vê a oferta como melhoria de nível
  const owned = state.items.some((i) => i.id === item.id);
  const level = itemLevel(item.id);
  const tag = owned
    ? `<div class="item-choice-tag upgrade">${t("card.upgrade", { from: level, to: level + 1 })}</div>`
    : `<div class="item-choice-tag new">${t("card.new")}</div>`;
  if (owned) card.classList.add("upgrade");
  card.innerHTML = `
    ${tag}
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

// Quem redesenha o modal de escolha aberto quando o idioma muda (null = nenhum aberto)
let refreshModal = null;

export function hideItemModal() {
  refreshModal = null;
  $("item-choice-modal").style.display = "none";
}

// Escolha inicial: com max === 1 é seleção única (clicar em outro move a escolha);
// onConfirm recebe os itens escolhidos
export function showInitialPick(options, maxSelections, onConfirm) {
  const modal = $("item-choice-modal");
  const container = $("item-choices-container");
  const single = maxSelections === 1;
  const selected = [];

  // Desenha tudo de novo: na troca de idioma a seleção feita é mantida
  const build = () => {
    modal.querySelector(".modal-header").innerHTML = single
      ? `
    <h2>${t("pick.single.title")}</h2>
    <p class="modal-subtitle">${t("pick.single.sub")}</p>
  `
      : `
    <h2>${t("pick.multi.title")}</h2>
    <p class="modal-subtitle">${t("pick.multi.sub", { max: maxSelections })}</p>
    <div class="selection-counter">
      <span id="selection-count">${selected.length}</span> ${t("pick.multi.counter", { max: maxSelections })}
    </div>
  `;
    container.innerHTML = "";

    const confirmBtn = document.createElement("div");
    confirmBtn.className = "confirm-selection-btn";
    confirmBtn.id = "confirm-selection-btn";
    confirmBtn.innerHTML = single ? t("pick.start") : t("pick.startMulti");
    confirmBtn.classList.toggle("active", selected.length > 0);

    options.forEach((item) => {
      const card = itemCard(item, (card) => {
        const index = selected.findIndex((i) => i.id === item.id);
        if (single) {
          // Seleção única: troca a escolha anterior
          container
            .querySelectorAll(".item-choice-card.selected")
            .forEach((c) => c.classList.remove("selected"));
          selected.length = 0;
          selected.push(item);
          card.classList.add("selected");
        } else if (index >= 0) {
          selected.splice(index, 1);
          card.classList.remove("selected");
        } else if (selected.length < maxSelections) {
          selected.push(item);
          card.classList.add("selected");
        } else {
          return;
        }
        const counter = $("selection-count");
        if (counter) counter.textContent = selected.length;
        confirmBtn.classList.toggle("active", selected.length > 0);
      });
      if (selected.some((i) => i.id === item.id)) card.classList.add("selected");
      container.appendChild(card);
    });

    confirmBtn.onclick = () => {
      if (selected.length === 0) {
        return;
      }
      hideItemModal();
      onConfirm([...selected]);
    };
    container.appendChild(confirmBtn);
  };

  build();
  refreshModal = build;
  modal.style.display = "flex";
}

// Recompensa da onda: 1 item; onPick recebe o item escolhido
export function showRewardPick(options, wave, onPick) {
  const modal = $("item-choice-modal");
  const container = $("item-choices-container");

  const build = () => {
    // Reescreve o cabeçalho inteiro: a escolha inicial deixa um contador de seleção nele
    modal.querySelector(".modal-header").innerHTML = `
    <h2>${t("reward.title")}</h2>
    <p class="modal-subtitle">${t("reward.sub", { count: options.length, wave })}</p>
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
  };

  build();
  refreshModal = build;
  modal.style.display = "flex";
}

// ═══════════════════════════════════════════
//  GAME OVER SCREEN
// ═══════════════════════════════════════════
let gameOver = null; // dados da run congelados ao morrer; null = tela fechada

export function showGameOver() {
  // Duração da run
  const elapsed = performance.now() - (state.runStats.startTime || 0);
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  // Item mais usado (guarda o id: o nome é buscado de novo se o idioma mudar)
  const uses = Object.entries(state.runStats.itemUses);
  let favorite = null;
  if (uses.length > 0) {
    const [topId, topCount] = uses.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (findItem(topId)) favorite = { id: topId, count: topCount };
  }

  gameOver = {
    wave: state.wave,
    kills: state.kills,
    score: state.score,
    damage: state.runStats.totalDamage,
    fragments: state.fragments,
    duration,
    favorite,
  };
  renderGameOver();
  $("game-over-modal").style.display = "flex";
}

function renderGameOver() {
  const g = gameOver;
  if (!g) return;
  let favoriteItem = "—";
  if (g.favorite) {
    const item = findItem(g.favorite.id);
    if (item) favoriteItem = `${item.icon} ${item.name} (${g.favorite.count}×)`;
  }

  $("go-subtitle").textContent = t("gameover.sub", { wave: g.wave });

  const stats = [
    { label: t("gameover.wave"), value: g.wave },
    { label: t("gameover.kills"), value: g.kills },
    { label: t("gameover.score"), value: g.score },
    { label: t("gameover.damage"), value: g.damage },
    { label: t("gameover.duration"), value: g.duration },
    { label: t("gameover.favorite"), value: favoriteItem, wide: true },
    { label: t("gameover.fragments"), value: g.fragments, wide: true },
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
}

export function hideGameOver() {
  gameOver = null;
  $("game-over-modal").style.display = "none";
}

// ═══════════════════════════════════════════
//  GAME CONTROLS (PLAY/PAUSE)
// ═══════════════════════════════════════════
export function setupControls({
  onPlay,
  onPause,
  onReset,
  onSpeed,
  onMute,
  onShake,
  onRestart,
}) {
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
  $("btn-shake").addEventListener("click", () => setShakeButton(onShake()));
  setupInventoryToggle();
}

// Troca de idioma no meio da run: redesenha o que está na tela e é montado por JS.
// O catálogo de itens já foi traduzido (localizeItems) antes desta chamada.
export function refreshLanguage() {
  hideTooltip(); // o texto antigo ficaria na tela até o mouse sair do item
  renderInventory();
  updateHUD();
  if (refreshModal) refreshModal();
  if (gameOver) renderGameOver();
}

// Barra de itens recolhível. A escolha do jogador fica salva; sem escolha, aberta
const INV_COLLAPSED_KEY = "reliquary_inv_collapsed";

function readSaved(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSaved(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function setupInventoryToggle() {
  const inv = $("inventory");
  const btn = $("btn-inv-toggle");
  const apply = (collapsed) => {
    inv.classList.toggle("collapsed", collapsed);
    btn.setAttribute("aria-expanded", String(!collapsed));
  };
  apply(defaultCollapsed(readSaved(INV_COLLAPSED_KEY)));
  btn.addEventListener("click", () => {
    const collapsed = !inv.classList.contains("collapsed");
    apply(collapsed);
    if (collapsed) hideTooltip();
    writeSaved(INV_COLLAPSED_KEY, collapsed ? "1" : "0");
  });
}

// Ativo e 📳 com a tremida ligada; apagado e 📴 quando desligada
export function setShakeButton(on) {
  const btn = $("btn-shake");
  btn.textContent = on ? "📳" : "📴";
  btn.classList.toggle("active", on);
  btn.setAttribute("aria-pressed", String(on));
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
