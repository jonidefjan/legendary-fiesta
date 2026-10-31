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
//
// Fluxo da run: tela inicial → escolha de 1 arma entre 3 → ondas (recompensa a
// cada onda) → chefe na onda 10 → vitória (continuar no infinito ou encerrar).
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

const ITEMS_URL = new URL("../assets/items.json", import.meta.url);
// Começa com 1 arma escolhida entre 3; o resto vem das recompensas
const STARTING_PICK = { options: 3, max: 1, type: "weapon" };
const REWARD_OPTIONS = 3;
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
on("revive", () => {
  feel.addShake(0.6);
  feel.hitStop(90, state.gameSpeed);
});

on("playerDied", () => {
  // A run acaba aqui: recarregar a página não pode trazê-la de volta
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
  };
  state.enemies = boss.isBossWave(waveNum)
    ? boss.createBossWave(waveNum, arena)
    : createWave(waveNum, arena);
  ui.addLog(
    `🌊 Onda ${waveNum} iniciada! ${state.enemies.length} inimigos aparecem.`,
    "kill",
  );
}

function checkWaveComplete() {
  if (state.waveTransition || !state.enemies.every((e) => e.dead)) return;
  state.waveTransition = true;
  state.score += state.wave * 50;
  sfx.waveClear();

  if (boss.isBossWave(state.wave)) {
    state.meta.bossesBeaten++;
    save.saveMeta();
    // Primeira vitória da run (onda 10): tela de vitória; no infinito segue normal
    if (!state.victoryShown) {
      state.victoryShown = true;
      ui.addLog(`👑 Chefe derrotado na onda ${state.wave}!`, "kill");
      setTimeout(offerVictory, 1500);
      return;
    }
  }

  ui.addLog(
    `✨ Onda ${state.wave} concluída! 🎁 Escolha sua recompensa!`,
    "kill",
  );
  setTimeout(offerReward, 1500);
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
  // Itens novos ou que ainda podem subir de nível
  const options = generateRandomItems(REWARD_OPTIONS);

  if (options.length === 0) {
    ui.addLog("✨ Todos os itens já estão no nível máximo!", "item");
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
  ui.addLog(
    leveled
      ? `⬆️ ${item.icon} ${item.name} subiu para o nível ${level}!`
      : `✨ ${item.icon} ${item.name} adicionado ao inventário!`,
    "item",
  );

  // A próxima onda começa (e é salva) já com o item; o combate volta após um instante
  startNextWave();
  setTimeout(resumeGame, 800);
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
  ui.addLog(`🎮 Run iniciada com ${items.map((i) => i.name).join(", ")}!`, "item");
  spawnWave(1);
  save.saveRun();
  setTimeout(resumeGame, 500);
}

// ═══════════════════════════════════════════
//  VITÓRIA
// ═══════════════════════════════════════════
function offerVictory() {
  state.isPaused = true;
  recordBest();
  save.saveMeta();
  victory.showVictory({
    stats: {
      wave: state.wave,
      kills: state.kills,
      score: state.score,
      totalDamage: state.runStats.totalDamage,
      durationMs: performance.now() - (state.runStats.startTime || 0),
      fragments: state.fragments,
      bossName: state.enemies.find((e) => e.isBoss)?.name || "",
    },
    onContinue: () => {
      victory.hideVictory();
      state.endless = true;
      ui.addLog("♾️ Modo infinito: as ondas continuam, com chefe a cada 10.", "kill");
      offerReward();
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
  const canvas = render.getCanvas();
  resetRun({ x: canvas.width * 0.22, y: canvas.height * 0.55 });
  meta.applyUpgrades(state.player);
  state.player.hp = state.player.maxHp;
  state.runStats.startTime = performance.now();
  particles.clear();
  feel.reset();
  ui.clearLog();
}

function startNewRun() {
  prepareRun();
  save.clearRun();
  ui.addLog(
    `⚡ ${state.fragments} fragmentos guardados para melhorias.`,
    "item",
  );
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
  ui.addLog(`🏰 Bem-vindo de volta! Continuando da onda ${state.wave}.`, "item");
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
  window.addEventListener("resize", render.resizeCanvas);

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
  ui.addLog("🏰 Bem-vindo ao Reliquary!", "item");
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
    ui.addLog("❌ Erro ao carregar itens do jogo.", "item");
  }
}

loadItems();
