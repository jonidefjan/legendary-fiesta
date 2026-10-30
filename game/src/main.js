// ═══════════════════════════════════════════
//  RELIQUARY - AUTO BATTLER
// ═══════════════════════════════════════════
// Ponto de entrada: carrega os itens, liga a lógica à interface e roda o loop.
//
// Módulos:
//   state.js   estado compartilhado          items.js   catálogo, sorteio, passivos
//   combat.js  dano, efeitos, inimigos       waves.js   criação das ondas
//   save.js    run salva e fragmentos        events.js  avisos da lógica para a UI
//   render.js  desenho no canvas             ui.js      DOM: inventário, HUD, modais
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
import * as render from "./render.js";
import * as ui from "./ui.js";

const ITEMS_URL = new URL("../assets/items.json", import.meta.url);
const STARTING_PICK = { options: 12, max: 4 };
const GAME_SPEEDS = [1, 2, 3];

// ─── Ligações: a lógica emite, a interface e o áudio reagem ───
on("log", ({ msg, type }) => ui.addLog(msg, type));
on("sfx", (name) => sfx[name]?.());
on("itemUsed", (id) => ui.flashItem(id));
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
  const dt = Math.min(timestamp - state.lastTime, 50) * state.gameSpeed;
  state.lastTime = timestamp;
  state.tick++;

  if (!state.running) {
    render.drawDefeatFrame();
  } else if (state.isPaused) {
    // Redesenha a tela mas não atualiza o estado do jogo
    render.drawPausedFrame();
  } else {
    updateItemTimers(dt);
    updateFrenzy(dt);
    processDots(dt);
    updateEnemies(dt);
    updatePlayerAnim(dt);

    render.drawRunningFrame();

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
function init() {
  render.setupCanvas(document.getElementById("combat-canvas"));
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
  });
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
