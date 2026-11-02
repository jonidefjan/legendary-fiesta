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
  enchantTiers,
  isActivatable,
  evolutionProgress,
  evolvedRarity,
  effectsOf,
} from "./items.js";
import { clickRate, MAX_CLICKS_PER_SECOND } from "./clicks.js";
import { t, formatNumber } from "./i18n.js";
import { defaultCollapsed, usesItemPanel, needsInvScroll } from "./layout.js";
import { itemIconHTML } from "./sprites.js";
import { runResult, formatDuration, favoriteCellHTML, createShareControls } from "./share.js";

export const isMobile =
  "ontouchstart" in window || navigator.maxTouchPoints > 0;

const $ = (id) => document.getElementById(id);

const ROMAN = ["", "I", "II", "III", "IV", "V"];

// Selo de nível: algarismo romano até o V; as formas evoluídas passam disso e viram número
const levelBadge = (level) => ROMAN[level] || String(level);

// "Nível 3/5", ou só "Nível 8" nas formas evoluídas, que não têm máximo
function levelText(item, level) {
  if (item.rarity === "mythic") return ""; // míticos não têm nível
  const max = maxLevelOf(item);
  return Number.isFinite(max) ? t("item.level", { level, max }) : t("item.levelUncapped", { level });
}

// Evolução: o item comum mostra em que vira; a forma evoluída mostra os abates para o
// próximo nível (o texto do progresso é atualizado no updateHUD)
function evolutionHTML(item, cls) {
  if (item.evolution) {
    const into = findItem(item.evolution.into);
    return `<div class="${cls}">🧬 ${t("item.evolvesInto", { name: into?.name || "", level: item.evolution.level })}</div>`;
  }
  const progress = evolutionProgress(item);
  if (!progress) return "";
  return `<div class="${cls}" data-evo="${item.id}">${evolutionText(progress)}</div>`;
}

function evolutionText({ kills, need }) {
  return `🧬 ${t("item.evolveProgress", { kills, need })}`;
}

// Os abates mudam o tempo todo: só o texto do progresso é refeito, sem redesenhar a dica
function refreshEvolution() {
  document.querySelectorAll("[data-evo]").forEach((el) => {
    const item = findItem(el.dataset.evo);
    const progress = item && evolutionProgress(item);
    if (progress) el.textContent = evolutionText(progress);
  });
}

// Encantamentos do item: os já liberados normais e os que dependem de nível apagados,
// com o aviso de em qual nível liberam. level: o nível a considerar.
function enchantsHTML(item, level, cls) {
  return enchantTiers(item, level)
    .map((tier) =>
      tier.unlocked
        ? `<div class="${cls}">${tier.text}</div>`
        : `<div class="${cls} locked"><span class="enchant-lock">🔒 ${t("item.unlocksAt", { level: tier.minLevel })}</span> ${tier.text}</div>`,
    )
    .join("");
}

// ═══════════════════════════════════════════
//  INVENTORY
// ═══════════════════════════════════════════
export function renderInventory() {
  $("inv-count").textContent = state.items.length;
  // Muitos itens: a caixa rola por dentro e não empurra a arena (só no celular, via CSS)
  $("inv-items").classList.toggle("inv-scroll", needsInvScroll(state.items.length));
  ["weapon", "armor", "relic"].forEach((type) => {
    const el = $("slots-" + type);
    el.innerHTML = "";
    // Míticos (clique) ocupam a caixa das relíquias
    const typeItems = state.items.filter((i) => i.type === type || (type === "relic" && i.type === "mythic"));
    typeItems.forEach((item) => {
      const slot = document.createElement("div");
      slot.className = "item-slot";
      slot.dataset.id = item.id;
      const level = itemLevel(item.id);
      if (level >= maxLevelOf(item) && maxLevelOf(item) > 1) slot.classList.add("max-level");
      if (item.rarity === "mythic") {
        slot.classList.add("mythic");
        slot.style.setProperty("--frame", RARITIES.mythic.color);
      }
      // Forma evoluída: a moldura acompanha a raridade atual
      if (item.evolvedFrom) {
        slot.classList.add("evolved");
        slot.style.setProperty("--frame", RARITIES[item.rarity].color);
      }
      slot.innerHTML = `
        <div class="item-icon">${itemIconHTML(item)}</div>
        <div class="rarity-gem rarity-${item.rarity}"></div>
        ${level > 1 ? `<div class="level-badge">${levelBadge(level)}</div>` : ""}
        <div class="cooldown-overlay" id="cd-text-${item.id}"></div>
        <div class="cd-bar" id="cd-bar-${item.id}" style="width:100%"></div>
      `;
      // Desktop: mouse events
      slot.addEventListener("mouseenter", (e) => showTooltip(item, e));
      slot.addEventListener("mouseleave", hideTooltip);
      slot.addEventListener("mousemove", (e) => moveTooltip(e));
      // Celular: toque abre o painel (sem preventDefault, para a caixa poder rolar)
      slot.addEventListener("click", () => {
        if (panelMode()) toggleItemPanel(item.id);
      });
      if (item.id === panelItemId) slot.classList.add("selected");
      el.appendChild(slot);
    });
  });
  refreshItemPanel();
}

// Contador de cliques dos itens míticos: aparece só com um deles equipado
export function updateClickCounter(now = performance.now()) {
  const el = $("click-counter");
  if (!el) return;
  const has = state.items.some((i) => effectsOf(i, "click").length > 0);
  el.hidden = !has;
  if (!has) return;
  const rate = clickRate(now);
  const text = t("hud.clicks", { n: rate, max: MAX_CLICKS_PER_SECOND });
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle("at-limit", rate >= MAX_CLICKS_PER_SECOND);
}

// Vinheta vermelha e piscada da barra de vida ao levar dano. Vários atacantes de uma vez não
// viram estroboscópio: dispara a menos de 340 ms do anterior só se for bem mais forte.
const HURT_GAP_MS = 340;
const HURT_STRONGER = 0.3;
let lastHurtAt = -Infinity;
let lastHurtPeak = 0;

export function flashHurt(intensity, now = performance.now()) {
  try {
    if (now - lastHurtAt < HURT_GAP_MS && intensity <= lastHurtPeak + HURT_STRONGER) return;
    lastHurtAt = now;
    lastHurtPeak = intensity;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const peak = reduced ? intensity * 0.6 : intensity;
    document.getElementById("hurt-vignette")?.animate?.(
      [{ opacity: peak }, { opacity: 0 }],
      { duration: 350, easing: "ease-out" },
    );
    document.querySelector(".bar-track")?.animate?.(
      [{ boxShadow: "0 0 6px 2px rgba(255, 60, 60, 0.9)" }, { boxShadow: "0 0 0 0 rgba(255, 60, 60, 0)" }],
      { duration: 200 },
    );
  } catch {
    // sem DOM (testes) ou sem animate: o aviso é opcional
  }
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
  if (panelMode()) return; // no celular os detalhes vão para o painel
  const r = RARITIES[item.rarity];
  const level = itemLevel(item.id);
  const cooldown = isActivatable(item) ? effectiveCooldown(item) : 0;
  tooltip.innerHTML = `
    <div class="tt-name" style="color:${r.color}"><span class="inline-icon tt-icon">${itemIconHTML(item, { badge: false })}</span> ${item.name}</div>
    <div class="tt-rarity" style="color:${r.color}">${r.label}</div>
    <div class="tt-level">${levelText(item, level)}</div>
    <div class="tt-desc">${item.desc}</div>
    <div class="tt-effect">${item.effect}</div>
    ${enchantsHTML(item, level, "tt-enchant")}
    ${evolutionHTML(item, "evo-note tt-evo")}
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

// ═══════════════════════════════════════════
//  PAINEL DE ITEM (celular)
// ═══════════════════════════════════════════
// Medido a cada uso: girar a tela ou emular um aparelho muda o modo sem recarregar
function panelMode() {
  return usesItemPanel({
    hoverNone: window.matchMedia("(hover: none)").matches,
    width: window.innerWidth,
  });
}

const panel = $("item-panel");
let panelItemId = null;

function panelHTML(item) {
  const r = RARITIES[item.rarity];
  const level = itemLevel(item.id);
  const cooldown = isActivatable(item) ? effectiveCooldown(item) : 0;
  return `
    <button type="button" class="item-panel-close" id="item-panel-close" aria-label="${t("item.close")}">✕</button>
    <div class="item-panel-head">
      <div class="item-panel-icon">${itemIconHTML(item)}</div>
      <div class="item-panel-title">
        <div class="item-panel-name" id="item-panel-name" style="color:${r.color}">${item.name}</div>
        <div class="item-panel-meta"><span style="color:${r.color}">${r.label}</span> · ${getTypeLabel(item.type)}</div>
        <div class="item-panel-meta">${levelText(item, level)}${cooldown > 0 ? " · " + t("item.cooldown", { seconds: formatNumber(cooldown / 1000, 1) }) : ""}</div>
      </div>
    </div>
    <div class="item-panel-effect">${item.effect}</div>
    ${enchantsHTML(item, level, "item-panel-enchant")}
    ${evolutionHTML(item, "evo-note item-panel-evo")}
  `;
}

function markSelectedSlot() {
  document.querySelectorAll(".item-slot.selected").forEach((el) => el.classList.remove("selected"));
  if (panelItemId) {
    const slot = document.querySelector(`.item-slot[data-id="${panelItemId}"]`);
    if (slot) slot.classList.add("selected");
  }
}

function openItemPanel(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  const wasOpen = !panel.hidden;
  panelItemId = id;
  panel.innerHTML = panelHTML(item);
  panel.hidden = false;
  markSelectedSlot();
  // Foco no X só na abertura; trocar de item não rouba o foco
  if (!wasOpen) $("item-panel-close").focus({ preventScroll: true });
}

// O painel de item está aberto? (o toque que o fecha não conta como clique do mítico)
export function itemPanelOpen() {
  return !panel.hidden;
}

export function closeItemPanel() {
  panelItemId = null;
  panel.hidden = true;
  markSelectedSlot();
}

function toggleItemPanel(id) {
  if (panelItemId === id && !panel.hidden) closeItemPanel();
  else openItemPanel(id);
}

// Redesenha o painel aberto (subida de nível, troca de idioma); fecha se o item sumiu
function refreshItemPanel() {
  if (!panelItemId) return;
  if (!panelMode() || !state.items.some((i) => i.id === panelItemId)) {
    closeItemPanel();
    return;
  }
  const hadFocus = panel.contains(document.activeElement);
  panel.innerHTML = panelHTML(state.items.find((i) => i.id === panelItemId));
  if (hadFocus) $("item-panel-close").focus({ preventScroll: true });
}

panel.addEventListener("click", (e) => {
  if (e.target.closest("#item-panel-close")) closeItemPanel();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !panel.hidden) closeItemPanel();
});
// Tocar fora fecha; tocar noutro item é tratado pelo clique do próprio slot
document.addEventListener("pointerdown", (e) => {
  if (panel.hidden || e.target.closest("#item-panel, .item-slot")) return;
  closeItemPanel();
});

// ═══════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════
export function updateHUD() {
  const p = state.player;
  // Bars
  $("hp-bar").style.width = (p.hp / p.maxHp) * 100 + "%";
  $("hp-val").textContent = `${Math.max(0, Math.round(p.hp))}/${p.maxHp}`;
  refreshEvolution();


  // Header stats
  $("hdr-wave").textContent = state.wave;
  $("hdr-kills").textContent = state.kills;
  $("hdr-score").textContent = state.score;
  $("hdr-fragments").textContent = state.fragments;
  updateClickCounter();

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
  if (item.rarity === "mythic") card.classList.add("mythic");
  card.dataset.itemId = item.id;
  card.onclick = () => onClick(card);

  // Quem já tem o item vê a oferta como melhoria de nível
  const owned = state.items.some((i) => i.id === item.id);
  const level = itemLevel(item.id);
  // Forma evoluída: a carta mostra a raridade que ela terá depois de subir
  const rarityId = owned && item.evolvedFrom ? evolvedRarity(level + 1) : item.rarity;
  const rarityInfo = RARITIES[rarityId];
  const tag = owned
    ? `<div class="item-choice-tag upgrade">${t("card.upgrade", { from: level, to: level + 1 })}</div>`
    : `<div class="item-choice-tag new">${t("card.new")}</div>`;
  if (owned) card.classList.add("upgrade");
  card.innerHTML = `
    ${tag}
    <div class="item-choice-type">${getTypeLabel(item.type)}</div>
    <div class="item-choice-icon">${itemIconHTML(item)}</div>
    <div class="item-choice-name">${item.name}</div>
    <div class="item-choice-rarity rarity-${rarityId}">${rarityInfo.label}</div>
    <div class="item-choice-desc">${item.desc}</div>
    <div class="item-choice-effect">${item.effect}</div>
    ${enchantsHTML(item, owned ? level + 1 : 1, "item-choice-enchant")}
    ${item.evolution ? evolutionHTML(item, "evo-note item-choice-evo") : ""}
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
  closeItemPanel(); // o modal cobre a tela; o painel aberto ficaria preso embaixo
  modal.style.display = "flex";
}

// Recompensa da onda: 1 item; onPick recebe o item escolhido.
// reroll: { rerolls (restantes), show, onReroll } -> onReroll() devolve { options, rerolls }
// ou null; o botão aparece só para quem comprou a melhoria (ou ainda tem rerrolagens).
export function showRewardPick(options, wave, onPick, reroll = null) {
  const modal = $("item-choice-modal");
  const container = $("item-choices-container");
  let rerolls = reroll?.rerolls ?? 0;

  const build = () => {
    // Reescreve o cabeçalho inteiro: a escolha inicial deixa um contador de seleção nele
    const rerollBtn = reroll?.show
      ? `<button type="button" class="reroll-btn" id="reroll-btn" aria-label="${t("reward.rerollLabel", { left: rerolls })}"${rerolls > 0 ? "" : " disabled"}>${t("reward.reroll", { left: rerolls })}</button>`
      : "";
    modal.querySelector(".modal-header").innerHTML = `
    <h2>${t("reward.title")}</h2>
    <p class="modal-subtitle">${t("reward.sub", { count: options.length, wave })}</p>
    ${rerollBtn}
  `;
    const btn = modal.querySelector("#reroll-btn");
    if (btn) {
      btn.onclick = () => {
        const next = reroll.onReroll();
        if (!next) return;
        options = next.options;
        rerolls = next.rerolls;
        build();
      };
    }
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
  closeItemPanel(); // o modal cobre a tela; o painel aberto ficaria preso embaixo
  modal.style.display = "flex";
}

// ═══════════════════════════════════════════
//  GAME OVER SCREEN
// ═══════════════════════════════════════════
let gameOver = null; // dados da run congelados ao morrer; null = tela fechada

export function showGameOver() {
  // Congela o resultado ao morrer; a arma favorita guarda só o id (o nome é buscado de
  // novo se o idioma mudar)
  gameOver = runResult();
  renderGameOver();
  $("game-over-modal").style.display = "flex";
}

function renderGameOver() {
  const g = gameOver;
  if (!g) return;
  $("go-subtitle").textContent = t("gameover.sub", { wave: g.wave });

  const stats = [
    { label: t("gameover.wave"), value: g.wave },
    { label: t("gameover.kills"), value: g.kills },
    { label: t("gameover.score"), value: g.score },
    { label: t("gameover.damage"), value: g.damage },
    { label: t("gameover.duration"), value: formatDuration(g.durationMs) },
    { label: t("gameover.fragments"), value: g.fragments },
    { label: t("gameover.favorite"), value: favoriteCellHTML(g.favorite), wide: true },
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
  $("go-share").replaceChildren(createShareControls(() => gameOver));
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
    if (collapsed) {
      hideTooltip();
      closeItemPanel();
    }
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
