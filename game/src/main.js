// ═══════════════════════════════════════════
//  RELIQUARY - AUTO BATTLER
// ═══════════════════════════════════════════
// Ponto de entrada: carrega os itens, liga a lógica à interface e roda o loop.
//
// Módulos:
//   state.js   estado compartilhado          items.js   catálogo, sorteio, níveis, passivos
//   combat.js  dano, efeitos, inimigos       waves.js   criação das ondas
//   boss.js    chefes e suas habilidades     meta.js    melhorias permanentes
//   save.js    run salva e progresso         events.js  avisos da lógica para a UI
//   three/renderer.js  desenho 3D em pixel art  ui.js  DOM: inventário, HUD, modais
//   ui-title.js tela inicial e loja          ui-victory.js tela de vitória
//   audio.js   sons (Web Audio)              fx.js      efeitos visuais (dados)
//   i18n.js    idioma (en/pt-BR) e t()       ../locales textos de cada idioma
//
// Fluxo da run: tela inicial → escolha de 1 arma entre 3 → ondas (recompensa a
// cada onda) → chefe na onda 10 → vitória (continuar no infinito ou encerrar).
//
// Filosofia: "Quebrar o jogo é divertido" - sinergias absurdas são features
import { state, resetRun } from "./state.js";
import { on } from "./events.js";
import { sfx } from "./audio.js";
import { t, initLang } from "./i18n.js";
import {
  setItems,
  localizeItems,
  applyPassives,
  ensureTimers,
  starterItems,
  generateRandomItems,
  rewardOptions,
  addItemOrLevel,
} from "./items.js";
import { createWave } from "./waves.js";
import {
  processDots,
  updateItemTimers,
  updateFrenzy,
  updatePlayerAnim,
  updateEnemies,
} from "./combat.js";
import * as boss from "./boss.js";
import * as meta from "./meta.js";
import * as save from "./save.js";
import * as render from "./three/renderer.js";
import * as particles from "./particles.js";
import * as feel from "./feel.js";
import * as ui from "./ui.js";
import * as title from "./ui-title.js";
import * as victory from "./ui-victory.js";
import { runResult } from "./share.js";

const ITEMS_URL = new URL("../assets/items.json", import.meta.url);
// Começa com 1 arma escolhida entre 3; o resto vem das recompensas
const STARTING_PICK = { options: 3, max: 1, type: "weapon" };
const REWARD_OPTIONS = 3;
const GAME_SPEEDS = [1, 2, 3];

// Cada run (e cada morte) troca o runId: ações agendadas de uma run que já acabou
// (recompensa, vitória, retomar) não podem rodar em cima da run seguinte.
let runId = 0;
function later(ms, fn) {
  const id = runId;
  setTimeout(() => {
    if (id === runId && state.running) fn();
  }, ms);
}
// Retomar sozinho depois de uma escolha só se o jogador não apertou Pause no meio
let autoResume = false;

// ─── Ligações: a lógica emite, a interface e o áudio reagem ───
// Troca de idioma (a página estática já foi traduzida por i18n.js): primeiro o
// catálogo de itens, que state.items referencia, depois tudo que o JS desenha
on("langChange", () => {
  localizeItems();
  ui.refreshLanguage();
  title.refreshTitle();
  victory.refreshVictory();
});
on("sfx", ({ name, detail }) => sfx[name]?.(detail));
on("itemUsed", (id) => ui.flashItem(id));
// Partículas: os eventos chegam com a posição no chão; o corpo fica ~25 px acima
const USE_PARTICLES = {
  blockNext: "shield",
  barrier: "barrier",
  heal: "heal",
  mana: "mana",
  frenzy: "frenzy",
};
// direction 1: inimigos ficam à direita, as partículas voam para longe do herói
on("hit", ({ x, y, element, damage }) => {
  const intensity = Math.min(1, damage / 25);
  particles.emit("hit", x, y - 25, { element, intensity, direction: 1 });
  if (element === "physical") {
    particles.emit("blood", x, y - 25, { intensity, direction: 1 });
  }
});
on("dotTick", ({ x, y, type }) =>
  particles.emit("dot", x, y - 25, { element: type }),
);
on("itemUse", ({ x, y, effect }) => {
  if (USE_PARTICLES[effect]) particles.emit(USE_PARTICLES[effect], x, y - 30);
});
on("blocked", ({ x, y }) => particles.emit("shield", x, y - 30));
on("playerHurt", ({ x, y, damage }) =>
  particles.emit("blood", x, y - 30, {
    intensity: Math.min(1, damage / 30),
    direction: -1,
  }),
);
on("revive", ({ x, y }) => particles.emit("revive", x, y - 30));
on("enemyDied", ({ x, y }) => particles.emit("death", x, y - 20));
// Fase 4: crítico, esquiva, congelar e cristal explodindo
on("crit", ({ x, y }) => particles.emit("crit", x, y - 25, { direction: 1 }));
on("dodge", ({ x, y }) => particles.emit("dodge", x, y - 25, { direction: 1 }));
on("freeze", ({ x, y }) => particles.emit("freeze", x, y - 25));
on("explode", ({ x, y, kind }) =>
  particles.emit(kind === "fire" ? "fireBurst" : "iceBurst", x, y - 30, { intensity: 1 }),
);
// Contágio: rastro de fogo do inimigo morto até cada alvo e brasas onde a queimadura pega
on("spread", ({ from, to }) => {
  for (const dest of to) {
    particles.emit("trail", from.x, from.y - 25, { toX: dest.x, toY: dest.y - 25 });
    particles.emit("hit", dest.x, dest.y - 25, { element: "fire", intensity: 0.4 });
  }
});

// Tremida e hit-stop: sutis, pois no 3× acontecem muitos golpes por segundo
on("hit", ({ damage, weak }) => {
  if (damage >= 15 || weak) {
    feel.addShake(0.15);
    feel.hitStop(35, state.gameSpeed);
  } else {
    feel.addShake(0.06);
  }
});
on("enemyDied", () => {
  feel.addShake(0.3);
  feel.hitStop(60, state.gameSpeed);
});
on("playerHurt", ({ damage }) => {
  feel.addShake(Math.min(0.5, Math.max(0.15, damage / 40)));
  feel.hitStop(45, state.gameSpeed);
});
on("blocked", () => feel.addShake(0.15));
on("crit", () => {
  feel.addShake(0.12);
  feel.hitStop(30, state.gameSpeed);
});
on("explode", () => {
  feel.addShake(0.35);
  feel.hitStop(50, state.gameSpeed);
});
on("revive", () => {
  feel.addShake(0.6);
  feel.hitStop(90, state.gameSpeed);
});

// Habilidades dos chefes: partículas no chefe e tremida proporcional ao perigo
on("bossAbility", ({ kind, x, y }) => {
  if (kind === "summon") {
    particles.emit("hit", x, y - 30, { element: "shadow", intensity: 1 });
    particles.emit("death", x - 50, y - 10);
    particles.emit("death", x + 50, y - 10);
    feel.addShake(0.25);
  } else if (kind === "nova") {
    for (const dx of [-60, -30, 0, 30, 60]) {
      particles.emit("hit", x + dx, y - 20, { element: "fire", intensity: 1 });
    }
    particles.emit("hit", state.player.x, state.player.y - 25, {
      element: "fire",
      intensity: 1,
      direction: -1,
    });
    feel.addShake(0.5);
    feel.hitStop(70, state.gameSpeed);
  } else if (kind === "enrage") {
    particles.emit("frenzy", x, y - 40, { intensity: 1 });
    feel.addShake(0.4);
  }
});

on("playerDied", () => {
  // A run acaba aqui: recarregar a página não pode trazê-la de volta
  runId++;
  save.clearRun();
  recordBest();
  save.saveMeta();
  setTimeout(ui.showGameOver, 1200);
});

// ═══════════════════════════════════════════
//  INVENTORY & WAVES
// ═══════════════════════════════════════════
function rebuildInventory() {
  if (state.items.length === 0) state.items = starterItems();
  applyPassives();
  ensureTimers();
  ui.renderInventory();
}

function recordBest() {
  const best = state.meta.best;
  best.wave = Math.max(best.wave, state.wave);
  best.score = Math.max(best.score, state.score);
}

function spawnWave(waveNum) {
  const canvas = render.getCanvas();
  const arena = {
    width: canvas.width,
    height: canvas.height,
    mobile: ui.isMobile,
    // Ninguém nasce fora da tela: o herói ataca o mais próximo, visível ou não
    maxX: render.visibleLogicRight(),
  };
  state.enemies = boss.isBossWave(waveNum)
    ? boss.createBossWave(waveNum, arena)
    : createWave(waveNum, arena);
}

function checkWaveComplete() {
  if (!state.running || state.waveTransition) return;
  if (!state.enemies.every((e) => e.dead)) return;
  state.waveTransition = true;
  state.score += state.wave * 50;
  sfx.waveClear();

  if (boss.isBossWave(state.wave)) {
    // Salvo junto com a run (próxima onda ou fim da run): salvar aqui deixaria
    // recarregar a página e repetir o chefe para ganhar os fragmentos de novo
    state.meta.bossesBeaten++;
    // Primeira vitória da run (onda 10): tela de vitória; no infinito segue normal
    if (!state.victoryShown) {
      state.victoryShown = true;
      later(1500, offerVictory);
      return;
    }
    // Chefe do infinito: a recompensa garante um lendário
    later(1500, () => offerReward({ boss: true }));
    return;
  }
  later(1500, offerReward);
}

// A run é salva no começo de cada onda: recarregar a página repete a onda
// atual do início, sem receber de novo pontos ou recompensa.
function startNextWave() {
  const p = state.player;
  state.wave++;
  p.reviveUsed = false;
  p.berserking = false;
  p.berserkRemaining = 0;
  p.lowHpUsed = {};
  p.dots = []; // queimadura do chefe não passa para a onda seguinte
  p.hp = Math.min(p.maxHp, p.hp + 20);
  spawnWave(state.wave);
  state.waveTransition = false;
  p.anim = "idle";
  ui.updateHUD();
  save.saveRun();
}

// ═══════════════════════════════════════════
//  ESCOLHA DE ITENS
// ═══════════════════════════════════════════
function offerReward({ boss = false } = {}) {
  state.isPaused = true;
  // Itens novos ou que ainda podem subir de nível; chefe e 4 telas sem lendário garantem um
  const options = rewardOptions(REWARD_OPTIONS, { boss });

  if (options.length === 0) {
    startNextWave();
    resumeGame();
    return;
  }
  ui.showRewardPick(options, state.wave, pickReward);
}

function pickReward(item) {
  sfx.reward();
  const { leveled, level } = addItemOrLevel(item);
  rebuildInventory();

  // A próxima onda começa (e é salva) já com o item; o combate volta após um instante
  startNextWave();
  autoResume = true;
  later(800, () => autoResume && resumeGame());
}

function showStartingPick() {
  state.isPaused = true;
  ui.showInitialPick(
    generateRandomItems(STARTING_PICK.options, new Set(), {
      type: STARTING_PICK.type,
    }),
    STARTING_PICK.max,
    confirmStartingPick,
  );
}

function confirmStartingPick(items) {
  state.items = [];
  state.itemLevels = {};
  state.itemTimers = {};
  items.forEach(addItemOrLevel);
  rebuildInventory();
  spawnWave(1);
  save.saveRun();
  autoResume = true;
  later(500, () => autoResume && resumeGame());
}

// ═══════════════════════════════════════════
//  VITÓRIA
// ═══════════════════════════════════════════
function offerVictory() {
  state.isPaused = true;
  recordBest();
  victory.showVictory({
    stats: {
      ...runResult(),
      bossKind: state.enemies.find((e) => e.isBoss)?.kind || "",
    },
    onContinue: () => {
      victory.hideVictory();
      state.endless = true;
      // A primeira recompensa do infinito vem logo após o chefe da onda 10: garante lendário
      offerReward({ boss: true });
    },
    onEnd: endRun,
  });
}

// Encerrar a run por escolha (depois da vitória): guarda o resultado e volta ao início
function endRun() {
  victory.hideVictory();
  recordBest();
  save.clearRun();
  save.saveMeta();
  showTitleScreen();
}

// ═══════════════════════════════════════════
//  TELA INICIAL, NOVA RUN, CONTINUAR
// ═══════════════════════════════════════════
function showTitleScreen() {
  state.isPaused = true;
  ui.setPausedControls(true);
  title.showTitle({
    canContinue: save.hasRun(),
    onContinue: () => {
      title.hideTitle();
      continueRun();
    },
    onNewRun: () => {
      title.hideTitle();
      startNewRun();
    },
  });
}

function prepareRun() {
  runId++;
  autoResume = false;
  const canvas = render.getCanvas();
  resetRun({ x: canvas.width * 0.22, y: canvas.height * 0.55 });
  meta.applyUpgrades(state.player);
  state.player.hp = state.player.maxHp;
  state.runStats.startTime = performance.now();
  particles.clear();
  feel.reset();
}

function startNewRun() {
  prepareRun();
  save.clearRun();
  ui.renderInventory();
  ui.updateHUD();
  ui.setPausedControls(true);
  showStartingPick();
}

function continueRun() {
  prepareRun();
  if (!save.loadRun()) {
    startNewRun();
    return;
  }
  // A vida salva vale; os bônus vêm das melhorias atuais
  meta.applyUpgrades(state.player);
  state.player.hp = Math.min(state.player.hp, state.player.maxHp);
  rebuildInventory();
  spawnWave(state.wave);
  ui.updateHUD();
  ui.setPausedControls(true);
}

// ═══════════════════════════════════════════
//  PAUSE / RESET
// ═══════════════════════════════════════════
function pauseGame() {
  if (state.isPaused || !state.running) return;
  autoResume = false;
  state.isPaused = true;
  ui.setPausedControls(true);
}

function resumeGame() {
  if (!state.isPaused || !state.running) return;
  state.isPaused = false;
  state.lastTime = performance.now(); // Reset timer para evitar salto no dt
  ui.setPausedControls(false);
}

function resetProgress() {
  if (!confirm(t("controls.resetConfirm"))) {
    return;
  }
  save.resetAll();
  setTimeout(() => location.reload(), 1000);
}

// ═══════════════════════════════════════════
//  MAIN GAME LOOP
// ═══════════════════════════════════════════
let lastHudUpdate = 0;

function gameLoop(timestamp) {
  // Logo depois de retomar, o timestamp do rAF pode ser anterior a lastTime
  const realDt = Math.max(0, Math.min(timestamp - state.lastTime, 50));
  const dt = realDt * state.gameSpeed;
  state.lastTime = timestamp;
  state.tick++;

  if (!state.running) {
    render.setCamera(0, 0);
    render.drawDefeatFrame();
  } else if (state.isPaused) {
    // Redesenha a tela mas não atualiza o estado do jogo
    render.setCamera(0, 0);
    render.drawPausedFrame();
  } else {
    const f = feel.update(realDt);
    render.setCamera(f.x, f.y);
    if (f.frozen) {
      // Hit-stop: nada avança (nem as partículas), só redesenha
      render.drawRunningFrame(0);
      requestAnimationFrame(gameLoop);
      return;
    }
    updateItemTimers(dt);
    updateFrenzy(dt);
    processDots(dt);
    updateEnemies(dt);
    boss.updateBosses(dt);
    updatePlayerAnim(dt);

    render.drawRunningFrame(dt);

    if (timestamp - lastHudUpdate > 50) {
      lastHudUpdate = timestamp;
      ui.updateHUD();
    }
    checkWaveComplete();
  }

  requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
// localStorage/matchMedia podem lançar erro (modo privado, bloqueios)
function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeMatchMedia() {
  return typeof window.matchMedia === "function"
    ? (q) => window.matchMedia(q)
    : null;
}

function init() {
  render.setupCanvas(
    document.getElementById("combat-canvas"),
    document.getElementById("overlay-canvas"),
  );
  render.resizeCanvas();
  // A arena muda de altura quando a barra de itens abre ou fecha, não só com a janela
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => render.resizeCanvas()).observe(
      document.getElementById("arena"),
    );
  } else {
    window.addEventListener("resize", render.resizeCanvas);
  }

  const canvas = render.getCanvas();
  state.player.x = canvas.width * 0.22;
  state.player.y = canvas.height * 0.55;

  ui.setupControls({
    onPlay: resumeGame,
    onPause: pauseGame,
    onReset: resetProgress,
    // "Jogar novamente" na derrota volta à tela inicial (para comprar melhorias)
    onRestart: () => {
      ui.hideGameOver();
      showTitleScreen();
    },
    onSpeed: () => {
      const idx = GAME_SPEEDS.indexOf(state.gameSpeed);
      state.gameSpeed = GAME_SPEEDS[(idx + 1) % GAME_SPEEDS.length];
      return state.gameSpeed;
    },
    onMute: () => sfx.toggleMute(),
    onShake: () => {
      feel.setShakeEnabled(!feel.isShakeEnabled());
      feel.savePrefs(safeStorage());
      return feel.isShakeEnabled();
    },
  });
  feel.loadPrefs(safeStorage(), safeMatchMedia());
  ui.setShakeButton(feel.isShakeEnabled());
  ui.setPausedControls(true);

  save.loadMeta();
  ui.updateHUD(); // tira o texto estático em inglês da barra de onda (e mostra o recorde salvo)
  showTitleScreen();

  state.lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════
//  CARREGAR ITENS DO JSON
// ═══════════════════════════════════════════
async function loadItems() {
  try {
    const response = await fetch(ITEMS_URL);
    if (!response.ok) {
      throw new Error("Erro ao carregar items.json");
    }
    setItems(await response.json());
    init();
  } catch (error) {
    console.error("❌ Erro ao carregar itens:", error);
    // Sem o log na tela, o jogador precisa ver o erro de algum jeito
    const box = document.createElement("div");
    box.className = "load-error";
    box.setAttribute("role", "alert");
    box.textContent = t("log.loadError");
    document.body.appendChild(box);
  }
}

// O idioma precisa estar definido antes de setItems (que traduz o catálogo)
initLang();
loadItems();
