// ═══════════════════════════════════════════
//  RELIQUARY - AUTO BATTLER
// ═══════════════════════════════════════════
// Ponto de entrada: carrega os itens, liga a lógica à interface e roda o loop.
//
// Módulos:
//   state.js   estado compartilhado          items.js   catálogo, sorteio, passivos
//   combat.js  dano, efeitos, inimigos       waves.js   criação das ondas
//   save.js    run salva e fragmentos        events.js  avisos da lógica para a UI
//   three/renderer.js  desenho 3D em pixel art  ui.js  DOM: inventário, HUD, modais
//   audio.js   sons (Web Audio)              fx.js      efeitos visuais (dados)
//
// Filosofia: "Quebrar o jogo é divertido" - sinergias absurdas são features
import { state, resetRun } from "./state.js";
import { on } from "./events.js";
import { sfx } from "./audio.js";
import {
  setItems,
  applyPassives,
  ensureTimers,
  starterItems,
  generateRandomItems,
} from "./items.js";
import { createWave } from "./waves.js";
import {
  processDots,
  updateItemTimers,
  updateFrenzy,
  updatePlayerAnim,
  updateEnemies,
} from "./combat.js";
import * as save from "./save.js";
import * as render from "./three/renderer.js";
import * as particles from "./particles.js";
import * as feel from "./feel.js";
import * as ui from "./ui.js";

const ITEMS_URL = new URL("../assets/items.json", import.meta.url);
const STARTING_PICK = { options: 12, max: 4 };
const GAME_SPEEDS = [1, 2, 3];

// ─── Ligações: a lógica emite, a interface e o áudio reagem ───
on("log", ({ msg, type }) => ui.addLog(msg, type));
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

// Tremida e hit-stop: sutis, pois no 3× acontecem muitos golpes por segundo
on("hit", ({ damage, weak }) => {
  if (damage >= 15 || weak) {
    feel.addShake(0.15);
    feel.hitStop(35);
  } else {
    feel.addShake(0.06);
  }
});
on("enemyDied", () => {
  feel.addShake(0.3);
  feel.hitStop(60);
});
on("playerHurt", ({ damage }) => {
  feel.addShake(Math.min(0.5, Math.max(0.15, damage / 40)));
  feel.hitStop(45);
});
on("blocked", () => feel.addShake(0.15));
on("revive", () => {
  feel.addShake(0.6);
  feel.hitStop(90);
});
on("playerDied", () => feel.addShake(0.8));

on("playerDied", () => {
  // A run acaba aqui: recarregar a página não pode trazê-la de volta
  save.clearRun();
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

function spawnWave(waveNum) {
  const canvas = render.getCanvas();
  state.enemies = createWave(waveNum, {
    width: canvas.width,
    height: canvas.height,
    mobile: ui.isMobile,
  });
  ui.addLog(
    `🌊 Onda ${waveNum} iniciada! ${state.enemies.length} inimigos aparecem.`,
    "kill",
  );
}

function checkWaveComplete() {
  if (state.waveTransition || !state.enemies.every((e) => e.dead)) return;
  state.waveTransition = true;
  const goldEarned = state.enemies.reduce((s, e) => s + (e.gold || 5), 0);
  state.gold += goldEarned;
  state.score += state.wave * 50;

  sfx.waveClear();

  // Recompensa a cada 2 ondas
  if (state.wave % 2 === 0) {
    ui.addLog(
      `✨ Onda ${state.wave} concluída! +${goldEarned} ouro. 🎁 Escolha sua recompensa!`,
      "kill",
    );
    setTimeout(offerReward, 1500);
  } else {
    ui.addLog(
      `✨ Onda ${state.wave} concluída! +${goldEarned} ouro. Próxima onda em 3s...`,
      "kill",
    );
    setTimeout(startNextWave, 3000);
  }
}

// A run é salva no começo de cada onda: recarregar a página repete a onda
// atual do início, sem receber de novo ouro, pontos ou recompensa.
function startNextWave() {
  const p = state.player;
  state.wave++;
  p.reviveUsed = false;
  p.berserking = false;
  p.berserkRemaining = 0;
  p.lowHpUsed = {};
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
function offerReward() {
  state.isPaused = true;
  // Itens que o jogador ainda não tem
  const owned = new Set(state.items.map((i) => i.id));
  const options = generateRandomItems(3, owned);

  if (options.length === 0) {
    ui.addLog("✨ Você já tem todos os itens disponíveis!", "item");
    startNextWave();
    resumeGame();
    return;
  }
  ui.showRewardPick(options, state.wave, pickReward);
}

function pickReward(item) {
  sfx.reward();
  state.items.push(item);
  rebuildInventory();
  ui.addLog(`✨ ${item.icon} ${item.name} adicionado ao inventário!`, "item");

  // A próxima onda começa (e é salva) já com o item; o combate volta após um instante
  startNextWave();
  setTimeout(resumeGame, 800);
}

function showStartingPick() {
  state.isPaused = true;
  ui.showInitialPick(
    generateRandomItems(STARTING_PICK.options),
    STARTING_PICK.max,
    confirmStartingPick,
  );
}

function confirmStartingPick(items) {
  state.items = items;
  state.itemTimers = {};
  rebuildInventory();
  ui.addLog(
    `🎮 Jogo iniciado com ${state.items.length} itens! Boa sorte!`,
    "item",
  );
  spawnWave(1);
  save.saveRun();
  setTimeout(resumeGame, 500);
}

// ═══════════════════════════════════════════
//  PAUSE / RESTART / RESET
// ═══════════════════════════════════════════
function pauseGame() {
  if (state.isPaused || !state.running) return;
  state.isPaused = true;
  ui.setPausedControls(true);
  ui.addLog("⏸️ Jogo pausado.", "item");
}

function resumeGame() {
  if (!state.isPaused || !state.running) return;
  state.isPaused = false;
  state.lastTime = performance.now(); // Reset timer para evitar salto no dt
  ui.setPausedControls(false);
  ui.addLog("▶️ Jogo retomado.", "item");
}

function restartGame() {
  const canvas = render.getCanvas();
  ui.hideGameOver();
  // Fragmentos persistem (meta-progressão); itens e recargas são da run
  resetRun({ x: canvas.width * 0.22, y: canvas.height * 0.55 });
  state.runStats.startTime = performance.now();
  save.clearRun();
  particles.clear();
  feel.reset();
  ui.clearLog();
  ui.addLog(
    `⚡ Mantidos ${state.fragments} fragmentos de runs anteriores.`,
    "item",
  );
  ui.renderInventory();
  ui.updateHUD();
  ui.setPausedControls(true);
  showStartingPick();
}

function resetProgress() {
  if (
    !confirm(
      "⚠️ Tem certeza que deseja resetar todo o progresso? Esta ação não pode ser desfeita!",
    )
  ) {
    return;
  }
  save.resetAll();
  ui.addLog("🔄 Progresso resetado! Recarregando...", "item");
  setTimeout(() => location.reload(), 1000);
}

// ═══════════════════════════════════════════
//  MAIN GAME LOOP
// ═══════════════════════════════════════════
let lastHudUpdate = 0;

function gameLoop(timestamp) {
  const realDt = Math.min(timestamp - state.lastTime, 50);
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
  window.addEventListener("resize", render.resizeCanvas);

  const canvas = render.getCanvas();
  state.player.x = canvas.width * 0.22;
  state.player.y = canvas.height * 0.55;
  state.runStats.startTime = performance.now();

  ui.setupControls({
    onPlay: resumeGame,
    onPause: pauseGame,
    onReset: resetProgress,
    onRestart: restartGame,
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
  // O jogo começa pausado
  ui.setPausedControls(true);

  // Progresso permanente primeiro, depois a run salva (se houver)
  save.loadMeta();
  if (save.loadRun()) {
    ui.addLog(
      `🏰 Bem-vindo de volta! Continuando da Wave ${state.wave}.`,
      "item",
    );
    rebuildInventory();
    spawnWave(state.wave);
    ui.updateHUD();
  } else {
    state.items = [];
    ui.addLog("🏰 Bem-vindo ao Reliquary! Escolha seus itens iniciais.", "item");
    showStartingPick();
  }

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
    ui.addLog("❌ Erro ao carregar itens do jogo.", "item");
  }
}

loadItems();
