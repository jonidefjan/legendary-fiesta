// ═══════════════════════════════════════════
//  RELIQUARY - AUTO BATTLER MVP
// ═══════════════════════════════════════════
//
// Sistemas Implementados:
// ✓ Sistema Elemental com Resistências (fire, water, ice, lightning, physical, shadow)
// ✓ DoT (Damage over Time) com Stacking até 5x (burning, poison, bleeding)
// ✓ Fragmentos de Poder (meta-progressão que persiste entre runs)
// ✓ Encantamentos com Triggers Mecânicos (ignition, shadow, overflow, fury)
// ✓ Feedback Visual de Sinergias (resistido, fraco, DoT icons)
//
// Filosofia: "Quebrar o jogo é divertido" - sinergias absurdas são features
//

// ═══════════════════════════════════════════
//  ITEM DATABASE
// ═══════════════════════════════════════════
const RARITIES = {
  common: { label: "Comum", color: "#888888" },
  uncommon: { label: "Incomum", color: "#4caa6a" },
  rare: { label: "Raro", color: "#4488cc" },
  epic: { label: "Épico", color: "#8844cc" },
  legendary: { label: "Lendário", color: "#c9a84c" },
};

// ITEMS será carregado do arquivo JSON
let ITEMS = [];

// ═══════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════
const PLAYER_BASE = { maxHp: 100, maxMana: 100, armor: 0, magicBoost: 0 };
const SAVE_KEY = "reliquary_save_v1";

const state = {
  wave: 1,
  kills: 0,
  score: 0,
  gold: 0,
  fragments: 0,
  player: {
    hp: 100,
    maxHp: 100,
    mana: 0,
    maxMana: 100,
    armor: 0,
    magicBoost: 0,
    x: 180,
    y: 0,
    anim: "idle",
    animTimer: 0,
    berserking: false,
    berserkEnd: 0,
    reviveUsed: false,
    charges: {},
    dots: [],
    elementalStatus: {},
  },
  enemies: [],
  effects: [],
  projectiles: [],
  items: [],
  itemTimers: {},
  log: [],
  tick: 0,
  lastTime: 0,
  running: true,
  isPaused: true,
  waveTransition: false,
  gameSpeed: 1,
  runStats: { totalDamage: 0, itemUses: {}, startTime: 0 },
};

// ═══════════════════════════════════════════
//  SOUND EFFECTS (WebAudio)
// ═══════════════════════════════════════════
const sfx = (() => {
  let actx = null;
  let muted = false;

  function getCtx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }

  function tone(freq, dur, type = "square", vol = 0.04, slideTo = 0, delay = 0) {
    if (muted) return;
    const a = getCtx();
    if (!a) return;
    try {
      const t0 = a.currentTime + delay;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo > 0) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      }
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch (e) {
      /* áudio é opcional — nunca quebra o jogo */
    }
  }

  return {
    toggleMute() {
      muted = !muted;
      return muted;
    },
    hit() {
      tone(220, 0.08, "square", 0.03, 140);
    },
    enemyHit() {
      tone(160, 0.1, "sawtooth", 0.03, 90);
    },
    block() {
      tone(900, 0.07, "triangle", 0.05, 500);
    },
    kill() {
      tone(300, 0.16, "square", 0.04, 620);
    },
    heal() {
      tone(520, 0.12, "sine", 0.04, 780);
    },
    waveClear() {
      tone(392, 0.12, "triangle", 0.05);
      tone(523, 0.2, "triangle", 0.05, 0, 0.12);
    },
    reward() {
      tone(523, 0.1, "sine", 0.05);
      tone(659, 0.1, "sine", 0.05, 0, 0.1);
      tone(784, 0.18, "sine", 0.05, 0, 0.2);
    },
    death() {
      tone(220, 0.6, "sawtooth", 0.05, 55);
    },
  };
})();

// ═══════════════════════════════════════════
//  SAVE/LOAD SYSTEM
// ═══════════════════════════════════════════
function saveGameState() {
  try {
    const saveData = {
      wave: state.wave,
      kills: state.kills,
      score: state.score,
      gold: state.gold,
      fragments: state.fragments,
      items: state.items,
      itemTimers: state.itemTimers,
      playerHp: state.player.hp,
      playerMaxHp: state.player.maxHp,
      playerMana: state.player.mana,
      playerMaxMana: state.player.maxMana,
      timestamp: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    console.log("💾 Jogo salvo!");
  } catch (error) {
    console.error("❌ Erro ao salvar:", error);
  }
}

function loadGameState() {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (!saved) return false;

    const saveData = JSON.parse(saved);

    // Restaurar estado
    state.wave = saveData.wave || 1;
    state.kills = saveData.kills || 0;
    state.score = saveData.score || 0;
    state.gold = saveData.gold || 0;
    state.fragments = saveData.fragments || 0;
    state.items = saveData.items || [];
    state.itemTimers = saveData.itemTimers || {};
    state.player.hp = saveData.playerHp || 100;
    state.player.maxHp = saveData.playerMaxHp || 100;
    state.player.mana = saveData.playerMana || 0;
    state.player.maxMana = saveData.playerMaxMana || 100;

    console.log(`✅ Jogo carregado! Wave ${state.wave}`);
    return true;
  } catch (error) {
    console.error("❌ Erro ao carregar:", error);
    return false;
  }
}

function resetGameState() {
  if (
    !confirm(
      "⚠️ Tem certeza que deseja resetar todo o progresso? Esta ação não pode ser desfeita!",
    )
  ) {
    return;
  }

  try {
    localStorage.removeItem(SAVE_KEY);
    addLog("🔄 Progresso resetado! Recarregando...", "item");

    setTimeout(() => {
      location.reload();
    }, 1000);
  } catch (error) {
    console.error("❌ Erro ao resetar:", error);
  }
}

// ═══════════════════════════════════════════
//  INVENTORY SETUP
// ═══════════════════════════════════════════
function buildInventory() {
  // Se é a primeira vez, inicializar com itens básicos
  if (state.items.length === 0) {
    const weapons = ITEMS.filter(
      (i) => i.type === "weapon" && i.rarity === "common",
    ).slice(0, 1);
    const armors = ITEMS.filter(
      (i) => i.type === "armor" && i.rarity === "common",
    ).slice(0, 1);
    state.items = [...weapons, ...armors];
  }

  // Apply passive bonuses
  state.player.armor = 0;
  state.player.maxMana = 100;
  state.player.magicBoost = 0;
  for (const item of state.items) {
    if (item.passive) {
      if (item.armor) state.player.armor += item.armor;
      if (item.manaBonus) state.player.maxMana += item.manaBonus;
      if (item.magicBoost) state.player.magicBoost += item.magicBoost;
    }
    if (item.cooldown > 0) {
      state.itemTimers[item.id] = state.itemTimers[item.id] || {
        elapsed: item.cooldown,
        cooldown: item.cooldown,
      };
    }
  }

  renderInventory();
}

function renderInventory() {
  ["weapon", "armor", "relic"].forEach((type) => {
    const el = document.getElementById("slots-" + type);
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

// ═══════════════════════════════════════════
//  TOOLTIP
// ═══════════════════════════════════════════
const tooltip = document.getElementById("tooltip");
let tooltipItem = null;
const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;

function showTooltip(item, e) {
  tooltipItem = item;
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
  tooltipItem = null;
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
//  CANVAS & DRAWING
// ═══════════════════════════════════════════
const canvas = document.getElementById("combat-canvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  const arena = document.getElementById("arena");
  canvas.width = arena.clientWidth;
  canvas.height = arena.clientHeight;
  state.player.y = canvas.height * 0.6;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ─── Draw helpers ───
function drawRoundRect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawBar(x, y, w, h, pct, color, bg = "#1c1710") {
  drawRoundRect(x, y, w, h, 2, bg, "#3a2e1e");
  drawRoundRect(x, y, w * Math.max(0, Math.min(1, pct)), h, 2, color, null);
}

// ─── Background ───
function drawBackground() {
  const W = canvas.width,
    H = canvas.height;
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, "#0a0810");
  sky.addColorStop(1, "#1a1220");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.55);

  // Ground
  const gnd = ctx.createLinearGradient(0, H * 0.55, 0, H);
  gnd.addColorStop(0, "#1a140a");
  gnd.addColorStop(1, "#0e0c08");
  ctx.fillStyle = gnd;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);

  // Ground line
  ctx.strokeStyle = "#3a2e1e";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.55);
  ctx.lineTo(W, H * 0.55);
  ctx.stroke();

  // Stars
  ctx.fillStyle = "rgba(200,180,150,0.6)";
  const stars = [
    [50, 30],
    [120, 60],
    [200, 20],
    [320, 45],
    [450, 15],
    [560, 40],
    [650, 25],
    [700, 55],
    [80, 90],
    [250, 80],
    [380, 95],
    [500, 70],
    [620, 85],
  ];
  stars.forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.arc(sx % W, sy, 0.8, 0, Math.PI * 2);
    ctx.fill();
  });

  // Moon
  ctx.fillStyle = "#d4c4a0";
  ctx.beginPath();
  ctx.arc(W - 60, 50, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1220";
  ctx.beginPath();
  ctx.arc(W - 52, 44, 18, 0, Math.PI * 2);
  ctx.fill();

  // Distant ruins
  ctx.fillStyle = "#1a1510";
  const ruins = [
    [W * 0.3, H * 0.4],
    [W * 0.5, H * 0.35],
    [W * 0.7, H * 0.42],
  ];
  ruins.forEach(([rx, ry]) => {
    ctx.fillRect(rx - 8, ry, 16, H * 0.55 - ry);
    ctx.fillRect(rx - 14, ry - 10, 5, 10);
    ctx.fillRect(rx + 9, ry - 8, 5, 8);
  });

  // Torch lights (atmospheric)
  const t = state.tick * 0.002;
  [W * 0.15, W * 0.85].forEach((tx) => {
    const flicker = 0.15 + 0.05 * Math.sin(t * 7 + tx);
    const tg = ctx.createRadialGradient(tx, H * 0.52, 0, tx, H * 0.52, 60);
    tg.addColorStop(0, `rgba(255,160,40,${flicker})`);
    tg.addColorStop(1, "transparent");
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, H);
    // Torch post
    ctx.fillStyle = "#3a2e1e";
    ctx.fillRect(tx - 2, H * 0.46, 4, H * 0.55 - H * 0.46);
    // Flame
    const ft = state.tick * 0.004;
    ctx.fillStyle = "#ff9a20";
    ctx.beginPath();
    ctx.ellipse(tx + Math.sin(ft * 3) * 2, H * 0.44, 4, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffcc60";
    ctx.beginPath();
    ctx.ellipse(tx + Math.sin(ft * 2) * 1, H * 0.455, 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ─── Draw Player ───
function drawPlayer(p) {
  const t = state.tick * 0.003;
  const groundY = p.y;
  const bodyH = 52;
  const headR = 12;
  const anim = p.anim || "idle";
  const berserking = p.berserking;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(p.x, groundY + 4, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Berserk aura
  if (berserking) {
    const ag = ctx.createRadialGradient(
      p.x,
      groundY - bodyH / 2,
      0,
      p.x,
      groundY - bodyH / 2,
      50,
    );
    ag.addColorStop(0, "rgba(255,50,0,0.2)");
    ag.addColorStop(1, "transparent");
    ctx.fillStyle = ag;
    ctx.fillRect(p.x - 60, groundY - bodyH - 20, 120, bodyH + 40);
  }

  // Robe / body
  const bodyX = p.x;
  const bodyY = groundY;
  let legSwing = 0,
    armSwing = 0,
    bodyBob = 0;

  if (anim === "idle") {
    bodyBob = Math.sin(t * 2) * 1.5;
  } else if (anim === "slash") {
    armSwing = Math.sin(t * 10) * 0.8;
    bodyBob = Math.abs(Math.sin(t * 10)) * -3;
  } else if (anim === "fire_slash") {
    armSwing = Math.sin(t * 10) * 1.0;
  } else if (anim === "double_slash") {
    armSwing = Math.sin(t * 16) * 0.7;
    bodyBob = Math.sin(t * 16) * -2;
  } else if (anim === "lightning") {
    bodyBob = Math.sin(t * 20) * -2;
  } else if (anim === "heal") {
    bodyBob = Math.abs(Math.sin(t * 6)) * -4;
  } else if (anim === "berserk") {
    bodyBob = Math.sin(t * 15) * -3;
    armSwing = Math.sin(t * 15) * 1.2;
  }

  const bY = bodyY + bodyBob;

  // Legs
  ctx.strokeStyle = berserking ? "#cc4422" : "#5a4a2e";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  const walkPhase = anim === "idle" ? 0 : state.tick * 0.01;
  const lLeg = Math.sin(walkPhase) * (anim === "idle" ? 3 : 12);
  const rLeg = -lLeg;

  ctx.beginPath();
  ctx.moveTo(bodyX, bY - 10);
  ctx.lineTo(bodyX - 6 + lLeg, bY + 18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bodyX, bY - 10);
  ctx.lineTo(bodyX + 6 + rLeg, bY + 18);
  ctx.stroke();

  // Boots
  ctx.fillStyle = "#3a2a18";
  ctx.beginPath();
  ctx.ellipse(bodyX - 6 + lLeg, bY + 20, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(bodyX + 6 + rLeg, bY + 20, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body / robe
  const robeColor = berserking ? "#3a1818" : "#2a2018";
  ctx.fillStyle = robeColor;
  ctx.beginPath();
  ctx.moveTo(bodyX - 14, bY);
  ctx.lineTo(bodyX + 14, bY);
  ctx.lineTo(bodyX + 10, bY - bodyH + 10);
  ctx.lineTo(bodyX - 10, bY - bodyH + 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = berserking ? "#cc4422" : "#5a4a2e";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Chest details
  ctx.strokeStyle = berserking ? "#ff6633" : "#c9a84c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bodyX, bY - 18);
  ctx.lineTo(bodyX, bY - bodyH + 12);
  ctx.stroke();

  // Weapon arm (right)
  const armAngle = armSwing * 0.6;
  ctx.save();
  ctx.translate(bodyX + 10, bY - bodyH + 24);
  ctx.rotate(armAngle);
  ctx.strokeStyle = berserking ? "#cc4422" : "#5a4a2e";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(16, 16);
  ctx.stroke();
  // Sword
  const weapon = state.items.find((i) => i.type === "weapon");
  if (weapon) {
    const wActive = state.itemTimers[weapon.id]?.elapsed >= weapon.cooldown;
    ctx.strokeStyle = wActive ? "#e8c96a" : "#888";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.lineTo(34, 34);
    ctx.stroke();
    // Guard
    ctx.strokeStyle = "#5a4a2e";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(14, 22);
    ctx.lineTo(24, 12);
    ctx.stroke();
  }
  ctx.restore();

  // Shield arm (left)
  ctx.save();
  ctx.translate(bodyX - 10, bY - bodyH + 24);
  ctx.rotate(-armAngle * 0.5);
  ctx.strokeStyle = berserking ? "#cc4422" : "#5a4a2e";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-10, 12);
  ctx.stroke();
  // Shield or off-hand
  const armor = state.items.find((i) => i.type === "armor");
  if (armor && (armor.id === "iron_shield" || armor.id === "dragonscale")) {
    ctx.fillStyle = armor.id === "dragonscale" ? "#1a3a1a" : "#3a3a3a";
    ctx.strokeStyle = armor.id === "dragonscale" ? "#4aaa4a" : "#5a5a5a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, 6);
    ctx.lineTo(-18, 8);
    ctx.lineTo(-20, 22);
    ctx.lineTo(-8, 24);
    ctx.lineTo(-2, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // Head
  const headY = bY - bodyH + headR;
  ctx.fillStyle = berserking ? "#cc8866" : "#c4a880";
  ctx.beginPath();
  ctx.arc(bodyX, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = berserking ? "#882222" : "#3a2a18";
  ctx.beginPath();
  ctx.arc(bodyX, headY - 2, headR, Math.PI, 0);
  ctx.fill();

  // Eyes
  const eyeGlow = berserking ? "#ff4422" : "#4488ff";
  ctx.fillStyle = eyeGlow;
  ctx.beginPath();
  ctx.arc(bodyX - 4, headY, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bodyX + 4, headY, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // HP bar
  const hpPct = state.player.hp / state.player.maxHp;
  drawBar(bodyX - 25, headY - headR - 18, 50, 5, hpPct, "#cc3333");
  ctx.fillStyle = "#c9a84c";
  ctx.font = "8px Cinzel";
  ctx.textAlign = "center";
  ctx.fillText("YOU", bodyX, headY - headR - 22);
}

// ─── Draw Enemy ───
function drawEnemy(en) {
  if (en.dead) return;
  const t = state.tick * 0.003;
  const groundY = en.y;
  const hpPct = en.hp / en.maxHp;
  const phase = en.phase || 0;
  const ex = en.x;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(
    ex,
    groundY + 4,
    en.size * 0.9,
    en.size * 0.25,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Hurt flash
  const flash = en.hurtTimer > 0 ? Math.sin(en.hurtTimer * 0.3) * 0.5 + 0.5 : 0;

  ctx.save();
  ctx.globalAlpha = 1 - flash * 0.3;

  // Body
  const bodyColor = en.color || "#882222";
  const sz = en.size;

  if (en.shape === "skeleton") {
    // Skeleton
    ctx.strokeStyle = flash > 0.5 ? "#ffffff" : "#c8c8c8";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    // Spine
    ctx.beginPath();
    ctx.moveTo(ex, groundY);
    ctx.lineTo(ex, groundY - sz * 1.5);
    ctx.stroke();
    // Ribs
    for (let i = 0; i < 3; i++) {
      const ry = groundY - sz * 0.5 - i * sz * 0.22;
      ctx.beginPath();
      ctx.moveTo(ex, ry);
      ctx.lineTo(ex - sz * 0.5, ry + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex, ry);
      ctx.lineTo(ex + sz * 0.5, ry + 4);
      ctx.stroke();
    }
    // Arms
    const atkAngle = Math.sin(t * 8 + phase) * 0.8;
    ctx.save();
    ctx.translate(ex - sz * 0.3, groundY - sz * 1.1);
    ctx.rotate(-atkAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-sz * 0.6, sz * 0.4);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(ex + sz * 0.3, groundY - sz * 1.1);
    ctx.rotate(atkAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(sz * 0.6, sz * 0.4);
    ctx.stroke();
    ctx.restore();
    // Skull
    ctx.fillStyle = flash > 0.5 ? "#ffffff" : "#dcdcdc";
    ctx.beginPath();
    ctx.arc(ex, groundY - sz * 1.65, sz * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(ex - sz * 0.12, groundY - sz * 1.7, sz * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + sz * 0.12, groundY - sz * 1.7, sz * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (en.shape === "goblin") {
    // Goblin
    const col = flash > 0.5 ? "#ffffff" : en.color || "#4a8a4a";
    // Body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(ex, groundY - sz * 0.6, sz * 0.5, sz * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.beginPath();
    ctx.arc(ex, groundY - sz * 1.4, sz * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Ears
    ctx.beginPath();
    ctx.moveTo(ex - sz * 0.35, groundY - sz * 1.5);
    ctx.lineTo(ex - sz * 0.55, groundY - sz * 1.75);
    ctx.lineTo(ex - sz * 0.25, groundY - sz * 1.45);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ex + sz * 0.35, groundY - sz * 1.5);
    ctx.lineTo(ex + sz * 0.55, groundY - sz * 1.75);
    ctx.lineTo(ex + sz * 0.25, groundY - sz * 1.45);
    ctx.closePath();
    ctx.fill();
    // Eyes
    ctx.fillStyle = "#ff4400";
    ctx.beginPath();
    ctx.arc(ex - sz * 0.15, groundY - sz * 1.42, sz * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + sz * 0.15, groundY - sz * 1.42, sz * 0.08, 0, Math.PI * 2);
    ctx.fill();
    // Arms
    const ga = Math.sin(t * 10 + phase) * 0.6;
    ctx.strokeStyle = col;
    ctx.lineWidth = sz * 0.18;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ex - sz * 0.45, groundY - sz * 0.9);
    ctx.lineTo(ex - sz * 0.8, groundY - sz * 0.5 + ga * sz * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex + sz * 0.45, groundY - sz * 0.9);
    ctx.lineTo(ex + sz * 0.8, groundY - sz * 0.5 - ga * sz * 0.3);
    ctx.stroke();
  } else if (en.shape === "demon") {
    // Demon
    const col = flash > 0.5 ? "#ff8888" : "#882222";
    const col2 = flash > 0.5 ? "#ffaaaa" : "#cc4444";
    // Body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ex - sz * 0.5, groundY);
    ctx.lineTo(ex + sz * 0.5, groundY);
    ctx.lineTo(ex + sz * 0.4, groundY - sz * 1.3);
    ctx.lineTo(ex - sz * 0.4, groundY - sz * 1.3);
    ctx.closePath();
    ctx.fill();
    // Horns
    ctx.fillStyle = col2;
    ctx.beginPath();
    ctx.moveTo(ex - sz * 0.25, groundY - sz * 1.3);
    ctx.lineTo(ex - sz * 0.4, groundY - sz * 1.8);
    ctx.lineTo(ex - sz * 0.1, groundY - sz * 1.35);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ex + sz * 0.25, groundY - sz * 1.3);
    ctx.lineTo(ex + sz * 0.4, groundY - sz * 1.8);
    ctx.lineTo(ex + sz * 0.1, groundY - sz * 1.35);
    ctx.closePath();
    ctx.fill();
    // Face
    ctx.fillStyle = "#ff2222";
    ctx.beginPath();
    ctx.arc(ex - sz * 0.15, groundY - sz * 1.1, sz * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + sz * 0.15, groundY - sz * 1.1, sz * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Wings
    const wa = Math.sin(t * 6 + phase) * 0.3;
    ctx.fillStyle = "rgba(136,34,34,0.6)";
    ctx.save();
    ctx.translate(ex - sz * 0.4, groundY - sz * 0.9);
    ctx.rotate(-0.3 + wa);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-sz * 0.7, -sz * 0.3);
    ctx.lineTo(-sz * 0.5, sz * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(ex + sz * 0.4, groundY - sz * 0.9);
    ctx.rotate(0.3 - wa);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(sz * 0.7, -sz * 0.3);
    ctx.lineTo(sz * 0.5, sz * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    // Generic blob
    ctx.fillStyle = flash > 0.5 ? "#ffffff" : bodyColor;
    ctx.beginPath();
    ctx.arc(ex, groundY - sz, sz, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // HP bar above enemy
  const barW = Math.max(40, sz * 2.2);
  const barY =
    groundY -
    (en.shape === "skeleton"
      ? sz * 2.1
      : en.shape === "demon"
        ? sz * 2
        : sz * 1.9) -
    8;
  drawBar(ex - barW / 2, barY, barW, 5, hpPct, "#cc3333");
  ctx.fillStyle = "#c9a84c";
  ctx.font = "bold 9px Cinzel";
  ctx.textAlign = "center";
  ctx.fillText(en.name, ex, barY - 3);

  // DoT indicators
  if (en.dots && en.dots.length > 0) {
    const dotIcons = { burning: "🔥", poison: "☠️", bleeding: "💉" };
    let offsetX = (-12 * en.dots.length) / 2;
    en.dots.forEach((dot) => {
      ctx.font = "12px Arial";
      ctx.fillText(dotIcons[dot.type] || "✨", ex + offsetX, barY - 14);
      // Stack count
      if (dot.stacks > 1) {
        ctx.font = "bold 8px Cinzel";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`×${dot.stacks}`, ex + offsetX + 8, barY - 10);
        ctx.fillStyle = "#c9a84c";
      }
      offsetX += 14;
    });
  }

  if (en.hurtTimer > 0) en.hurtTimer -= 1;
}

// ─── Draw Effects ───
function drawEffects() {
  const toRemove = [];
  state.effects.forEach((ef, idx) => {
    ef.life -= 1;
    if (ef.life <= 0) {
      toRemove.push(idx);
      return;
    }
    const a = ef.life / ef.maxLife;

    ctx.save();
    ctx.globalAlpha = a;

    if (ef.type === "slash") {
      ctx.strokeStyle = ef.color || "#e8c96a";
      ctx.lineWidth = 3 * a;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ef.x - 25, ef.y - 20);
      ctx.quadraticCurveTo(ef.x, ef.y - 30, ef.x + 25, ef.y - 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ef.x - 20, ef.y);
      ctx.quadraticCurveTo(ef.x + 5, ef.y - 20, ef.x + 30, ef.y + 5);
      ctx.stroke();
    } else if (ef.type === "fire") {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + ef.life * 0.1;
        const r = (1 - a) * 40;
        const px = ef.x + Math.cos(angle) * r;
        const py = ef.y + Math.sin(angle) * r * 0.5 - ef.life;
        ctx.fillStyle = i % 2 === 0 ? "#ff6600" : "#ffaa00";
        ctx.beginPath();
        ctx.arc(px, py, 5 * a, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (ef.type === "lightning") {
      ctx.strokeStyle = "#66aaff";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#4488ff";
      ctx.shadowBlur = 8;
      let lx = ef.x,
        ly = ef.y;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      for (let i = 0; i < 8; i++) {
        lx += (Math.random() - 0.5) * 20;
        ly -= 15;
        ctx.lineTo(lx, ly);
      }
      ctx.stroke();
    } else if (ef.type === "heal") {
      ctx.fillStyle = "#44cc88";
      const r = (1 - a) * 30;
      ctx.beginPath();
      ctx.arc(ef.x, ef.y - r, 8 * a, 0, Math.PI * 2);
      ctx.fill();
      // Cross
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(ef.x - 3, ef.y - r - 10 * a, 6, 20 * a);
      ctx.fillRect(ef.x - 10 * a, ef.y - r - 3, 20 * a, 6);
    } else if (ef.type === "mana_orb") {
      ctx.fillStyle = "#8844cc";
      ctx.shadowColor = "#aa66ff";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(ef.x, ef.y - (1 - a) * 20, 8 * a, 0, Math.PI * 2);
      ctx.fill();
    } else if (ef.type === "shield") {
      ctx.strokeStyle = "#6699ff";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#4466cc";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, 30 * (2 - a), 0, Math.PI * 2);
      ctx.stroke();
    } else if (ef.type === "berserk") {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + ef.life * 0.05;
        const r = 20 + (1 - a) * 20;
        ctx.fillStyle = i % 3 === 0 ? "#ff4422" : "#ff8844";
        ctx.beginPath();
        ctx.arc(
          ef.x + Math.cos(ang) * r,
          ef.y + Math.sin(ang) * r * 0.6,
          4 * a,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else if (ef.type === "death") {
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const r = (1 - a) * 50;
        ctx.fillStyle = "#8844cc";
        ctx.globalAlpha = a * 0.8;
        ctx.beginPath();
        ctx.arc(
          ef.x + Math.cos(ang) * r,
          ef.y + Math.sin(ang) * r * 0.5,
          4 * a,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else if (ef.type === "number") {
      ctx.font = `bold ${12 + ef.size}px Cinzel`;
      ctx.textAlign = "center";
      ctx.fillStyle = ef.color || "#e8c96a";
      ctx.shadowColor = ef.color || "#c9a84c";
      ctx.shadowBlur = 6;
      ctx.fillText(ef.text, ef.x, ef.y - (1 - a) * 40);
    } else if (ef.type === "text") {
      ctx.font = `bold 11px Cinzel`;
      ctx.textAlign = "center";
      ctx.fillStyle = ef.color || "#e8c96a";
      ctx.shadowColor = ef.color || "#c9a84c";
      ctx.shadowBlur = 8;
      ctx.fillText(ef.text, ef.x, ef.y - (1 - a) * 30);
    } else if (ef.type === "dragon_roar") {
      ctx.strokeStyle = "#4aaa4a";
      ctx.lineWidth = 2 * a;
      ctx.shadowColor = "#66cc66";
      ctx.shadowBlur = 15;
      for (let i = 0; i < 4; i++) {
        const r = 20 + i * 20 + (1 - a) * 30;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, r, 0, Math.PI * 2);
        ctx.globalAlpha = a * (1 - i * 0.2);
        ctx.stroke();
      }
    } else if (ef.type === "phoenix") {
      ctx.fillStyle = "#ffaa22";
      ctx.shadowColor = "#ff6600";
      ctx.shadowBlur = 20;
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2 + ef.life * 0.05;
        const r = (1 - a) * 60;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(
          ef.x + Math.cos(ang) * r,
          ef.y + Math.sin(ang) * r * 0.6,
          6 * a,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    ctx.restore();
  });

  for (let i = toRemove.length - 1; i >= 0; i--) {
    state.effects.splice(toRemove[i], 1);
  }
}

// ─── Spawn Effects ───
function spawnEffect(type, x, y, opts = {}) {
  state.effects.push({
    type,
    x,
    y,
    life: opts.life || 40,
    maxLife: opts.life || 40,
    ...opts,
  });
}

function spawnNumber(x, y, text, color, size = 0) {
  spawnEffect("number", x, y, {
    text: String(text),
    color,
    size,
    life: 60,
    maxLife: 60,
  });
}

// ═══════════════════════════════════════════
//  ENEMY WAVES
// ═══════════════════════════════════════════
const ENEMY_TYPES = [
  {
    name: "Esqueleto",
    shape: "skeleton",
    hp: 35,
    dmg: 6,
    speed: 0.4,
    size: 18,
    atkInterval: 2000,
    xp: 10,
    gold: 5,
    fragments: 2,
    resist: { fire: 0, water: 0, ice: 0.2, lightning: 0.3, physical: 0 },
  },
  {
    name: "Goblin",
    shape: "goblin",
    hp: 25,
    dmg: 8,
    speed: 0.7,
    size: 16,
    atkInterval: 1600,
    xp: 8,
    gold: 4,
    fragments: 1,
    resist: { fire: -0.2, water: 0, ice: 0, lightning: 0, physical: 0.1 },
  },
  {
    name: "Demônio",
    shape: "demon",
    hp: 55,
    dmg: 14,
    speed: 0.3,
    size: 22,
    atkInterval: 2500,
    xp: 20,
    gold: 10,
    fragments: 5,
    resist: {
      fire: 0.5,
      water: -0.3,
      ice: 0.1,
      lightning: 0,
      physical: 0.2,
    },
  },
];

function spawnWave(waveNum) {
  const W = canvas.width,
    H = canvas.height;
  const groundY = H * 0.55;
  state.enemies = [];
  const count = 2 + waveNum;
  const hpScale = 1 + (waveNum - 1) * 0.2;
  const dmgScale = 1 + (waveNum - 1) * 0.15;

  // Ajustes para mobile
  const mobileMultiplier = isMobile ? 1.4 : 1.0; // Inimigos começam mais longe
  const mobileSpeedReduction = isMobile ? 0.7 : 1.0; // Velocidade reduzida em mobile
  const mobileDmgReduction = isMobile ? 0.85 : 1.0; // Dano reduzido em mobile

  for (let i = 0; i < count; i++) {
    const typeIdx = Math.floor(
      Math.random() * Math.min(ENEMY_TYPES.length, Math.ceil(waveNum / 2)),
    );
    const base = ENEMY_TYPES[typeIdx];
    state.enemies.push({
      ...base,
      hp: Math.round(base.hp * hpScale),
      maxHp: Math.round(base.hp * hpScale),
      dmg: Math.round(base.dmg * dmgScale * mobileDmgReduction),
      speed: base.speed * mobileSpeedReduction,
      x: W * 0.6 * mobileMultiplier + i * 90 + Math.random() * 40,
      y: groundY,
      phase: Math.random() * Math.PI * 2,
      hurtTimer: 0,
      atkTimer: 0,
      dead: false,
      moving: true,
      dots: [],
      burning: 0,
    });
  }
  addLog(`🌊 Onda ${waveNum} iniciada! ${count} inimigos aparecem.`, "kill");
}

// ═══════════════════════════════════════════
//  ITEM ACTIVATION LOGIC
// ═══════════════════════════════════════════
function activateItem(item) {
  const p = state.player;
  const enemies = state.enemies.filter((e) => !e.dead);
  if (enemies.length === 0) return;
  // Alvo: inimigo mais próximo do jogador
  const target = enemies.reduce((closest, en) =>
    Math.abs(en.x - p.x) < Math.abs(closest.x - p.x) ? en : closest,
  );

  let activated = false;

  if (item.type === "weapon") {
    const hits = item.hits || 1;
    let totalDmg = 0;
    for (let h = 0; h < hits; h++) {
      let dmg = item.baseDmg + (item.bonusDmg || 0);
      if (p.berserking) dmg = Math.round(dmg * 1.4);
      // Mana overflow boost
      if (p.manaOverflow) {
        dmg = Math.round(dmg * 1.25);
        if (h === 0) addLog(`🔮 Transbordamento: +25% de dano!`, "item");
        p.manaOverflow = false;
      }
      // Dragonscale fury
      if (p.hp / p.maxHp < 0.4) {
        const ds = state.items.find((i) => i.id === "dragonscale");
        if (ds) dmg = Math.round(dmg * 1.3);
      }

      // Apply elemental damage with resistances
      const element = item.dmgType || "physical";
      const actualDmg = applyElementalDamage(target, dmg, element, "player");
      totalDmg += actualDmg;

      // Enchant: ignite (ember blade)
      if (item.id === "ember_blade" && Math.random() < 0.25) {
        applyDot(target, "burning", 3, 4, true);
        addLog(`🔥 ${target.name} está queimando! (DoT stacking)`, "dmg");
      }

      // Enchant: shadow (shadow dagger)
      if (item.id === "shadow_dagger" && Math.random() < 0.3) {
        const timerRef = state.itemTimers[item.id];
        timerRef.elapsed = Math.min(timerRef.cooldown, timerRef.elapsed + 500);
        addLog(`🌑 Sombra: recarga reduzida!`, "item");
      }

      // Thunder staff chain (hits multiple enemies)
      if (item.id === "thunder_staff" && h === 0) {
        const nearbyEnemies = state.enemies
          .filter((e) => !e.dead && e !== target)
          .slice(0, 2);
        nearbyEnemies.forEach((en) => {
          const chainDmg = Math.round(dmg * 0.5);
          applyElementalDamage(en, chainDmg, "lightning", "player");
          spawnEffect("lightning", en.x, en.y - 20, {
            life: 25,
            color: "#66aaff",
          });
        });
        if (nearbyEnemies.length > 0) {
          addLog(
            `⚡ Relâmpago ricocheteou em ${nearbyEnemies.length} alvos!`,
            "item",
          );
        }
      }
    }
    addLog(`⚔ ${item.name}: ${totalDmg} de dano em ${target.name}!`, "dmg");
    sfx.hit();

    // Anim
    const animMap = {
      rusted_sword: "slash",
      ember_blade: "fire_slash",
      shadow_dagger: "double_slash",
      thunder_staff: "lightning",
    };
    p.anim = animMap[item.id] || "slash";

    // Spawn weapon effect
    const efType =
      item.id === "ember_blade"
        ? "fire"
        : item.id === "thunder_staff"
          ? "lightning"
          : "slash";
    spawnEffect(efType, target.x, target.y - 20, {
      life: 35,
      color: item.id === "shadow_dagger" ? "#aa66ee" : undefined,
    });
    activated = true;
  } else if (item.type === "armor" && !item.passive) {
    if (item.id === "iron_shield") {
      p.nextBlockActive = true;
      spawnEffect("shield", p.x, p.y - 40, { life: 40 });
      addLog(`🔰 Escudo de Ferro: próximo ataque bloqueado!`, "item");
      p.anim = "block";
      activated = true;
    } else if (item.id === "dragonscale") {
      p.barrier = item.barrier;
      spawnEffect("dragon_roar", p.x, p.y - 40, { life: 50 });
      addLog(
        `🐉 Escama Dracônica: barreira de ${item.barrier} HP ativada!`,
        "item",
      );
      p.anim = "berserk";
      activated = true;
    }
  } else if (item.type === "relic") {
    if (item.id === "health_crystal") {
      const charges = (p.charges["health_crystal"] || 0) + 1;
      p.charges["health_crystal"] = charges;
      const bonus = Math.floor(charges / 10) * 3;
      const healAmt = item.healAmt + bonus;
      p.hp = Math.min(p.maxHp, p.hp + healAmt);
      spawnEffect("heal", p.x, p.y - 50, { life: 45 });
      spawnNumber(p.x, p.y - 60, `+${healAmt}`, "#44cc88", 2);
      addLog(`💎 Cristal Vital: restaura ${healAmt} HP.`, "heal");
      sfx.heal();
      p.anim = "heal";
      activated = true;
    } else if (item.id === "mana_stone") {
      const overflow = p.mana >= p.maxMana;
      p.mana = Math.min(p.maxMana, p.mana + item.manaRegen);
      spawnEffect("mana_orb", p.x, p.y - 50, { life: 35 });
      if (overflow) {
        p.manaOverflow = true;
        addLog(
          `🔮 Pedra de Mana: transbordamento! Próximo ataque +25%.`,
          "item",
        );
      } else {
        addLog(`🔮 Pedra de Mana: +${item.manaRegen} Mana.`, "item");
      }
      p.anim = "heal";
      activated = true;
    } else if (item.id === "berserker_totem") {
      p.berserking = true;
      p.berserkEnd = performance.now() + item.duration;
      spawnEffect("berserk", p.x, p.y - 40, { life: 60 });
      addLog(`🪬 Totem Berserker: Frenesi ativado por 3 segundos!`, "item");
      p.anim = "berserk";
      activated = true;
    }
  }

  if (activated) {
    // Estatísticas da run
    state.runStats.itemUses[item.id] =
      (state.runStats.itemUses[item.id] || 0) + 1;
    // Flash slot in DOM
    const slot = document.querySelector(`.item-slot[data-id="${item.id}"]`);
    if (slot) {
      slot.classList.add("active");
      setTimeout(() => slot.classList.remove("active"), 600);
    }
    state.itemTimers[item.id].elapsed = 0;
  }
}

// ═══════════════════════════════════════════
//  ENEMY ATTACKS PLAYER
// ═══════════════════════════════════════════
function enemyAttack(en) {
  const p = state.player;
  let dmg = en.dmg;

  // Block
  if (p.nextBlockActive) {
    p.nextBlockActive = false;
    // Parry: reflect 5 dmg
    const shield = state.items.find((i) => i.id === "iron_shield");
    if (shield) {
      en.hp -= 5;
      en.hurtTimer = 12;
      addLog(`🔰 Parry! Bloqueio reflete 5 de dano para ${en.name}!`, "item");
    } else {
      addLog(`🔰 Ataque bloqueado!`, "item");
    }
    sfx.block();
    spawnEffect("shield", p.x, p.y - 40, { life: 25 });
    return;
  }

  // Barrier
  if (p.barrier > 0) {
    const absorbed = Math.min(dmg, p.barrier);
    p.barrier -= absorbed;
    const reflected = Math.round(absorbed * 0.2);
    en.hp -= reflected;
    dmg -= absorbed;
    if (reflected > 0)
      addLog(
        `🐉 Barreira reflete ${reflected} de dano para ${en.name}!`,
        "item",
      );
    if (dmg <= 0) {
      addLog(`🐉 Barreira absorve o ataque!`, "item");
      return;
    }
  }

  // Armor reduction
  dmg = Math.max(1, Math.round(dmg * (1 - p.armor / 100)));

  // Mage robe absorb
  const robe = state.items.find((i) => i.id === "mage_robe");
  if (robe) {
    const manaAbsorb = Math.round(dmg * 0.3);
    p.mana = Math.min(p.maxMana, p.mana + manaAbsorb);
    if (manaAbsorb > 0)
      addLog(`🧥 Manto absorve: +${manaAbsorb} Mana.`, "item");
  }

  p.hp -= dmg;
  sfx.enemyHit();
  spawnNumber(p.x - 20, p.y - 60, `-${dmg}`, "#ff6666", 2);
  addLog(`💀 ${en.name} ataca: ${dmg} de dano!`, "dmg");

  // Death / revive
  if (p.hp <= 0) {
    const feather = state.items.find((i) => i.id === "phoenix_feather");
    if (feather && !p.reviveUsed) {
      p.reviveUsed = true;
      p.hp = Math.round(p.maxHp * feather.reviveAmt);
      // Reset cooldowns (enchant)
      Object.keys(state.itemTimers).forEach((id) => {
        state.itemTimers[id].elapsed = state.itemTimers[id].cooldown;
      });
      spawnEffect("phoenix", p.x, p.y - 40, { life: 80 });
      addLog(
        `🪶 Pena de Fênix: você renasceu com ${p.hp} HP! Todos os recargas zeradas!`,
        "kill",
      );
    } else {
      p.hp = 0;
      addLog(`☠️ Você foi derrotado na onda ${state.wave}!`, "kill");
      sfx.death();
      state.running = false;
      setTimeout(showGameOverScreen, 1200);
    }
  }
}

// ═══════════════════════════════════════════
//  WAVE COMPLETION
// ═══════════════════════════════════════════
function checkWaveComplete() {
  if (state.enemies.every((e) => e.dead) && !state.waveTransition) {
    state.waveTransition = true;
    const goldEarned = state.enemies.reduce((s, e) => s + (e.gold || 5), 0);
    state.gold += goldEarned;
    state.score += state.wave * 50;

    sfx.waveClear();

    // Salvar progresso após completar wave
    saveGameState();

    // Verificar se deve oferecer recompensa (a cada 2 waves)
    const shouldOfferReward = state.wave % 2 === 0;

    if (shouldOfferReward) {
      addLog(
        `✨ Onda ${state.wave} concluída! +${goldEarned} ouro. 🎁 Escolha sua recompensa!`,
        "kill",
      );
      setTimeout(() => {
        showWaveRewardSelection();
      }, 1500);
    } else {
      addLog(
        `✨ Onda ${state.wave} concluída! +${goldEarned} ouro. Próxima onda em 3s...`,
        "kill",
      );
      setTimeout(() => {
        startNextWave();
      }, 3000);
    }
  }
}

function startNextWave() {
  state.wave++;
  state.player.reviveUsed = false;
  state.player.berserking = false;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + 20);
  spawnWave(state.wave);
  state.waveTransition = false;
  state.player.anim = "idle";
  updateUI();
}

// ═══════════════════════════════════════════
//  SISTEMA DE RECOMPENSA DE WAVE (a cada 2 waves)
// ═══════════════════════════════════════════
function showWaveRewardSelection() {
  state.isPaused = true;

  const modal = document.getElementById("item-choice-modal");
  const container = document.getElementById("item-choices-container");
  const header = modal.querySelector("h2");
  const instruction = modal.querySelector("p");

  // Atualizar textos do modal
  header.textContent = "🎁 Recompensa da Onda!";
  instruction.innerHTML = `
    <div style="text-align: center; line-height: 1.6;">
      <strong>Escolha 1 item de 3 opções</strong><br>
      <span style="font-size: 0.9em; opacity: 0.8;">Wave ${state.wave} concluída</span>
    </div>
  `;

  container.innerHTML = "";

  // Gerar 3 itens aleatórios
  const rewardItems = generateRandomItems(3);

  rewardItems.forEach((item) => {
    const card = document.createElement("div");
    card.className = "item-choice-card";
    card.dataset.itemId = item.id;
    card.onclick = () => selectWaveReward(item, card);

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

    container.appendChild(card);
  });

  modal.style.display = "flex";
}

function selectWaveReward(item, card) {
  sfx.reward();
  // Adicionar item ao inventário
  state.items.push(item);

  // Inicializar timer se necessário
  if (item.cooldown > 0) {
    state.itemTimers[item.id] = {
      elapsed: item.cooldown,
      cooldown: item.cooldown,
    };
  }

  // Reconstruir inventário
  buildInventory();

  // Fechar modal
  const modal = document.getElementById("item-choice-modal");
  modal.style.display = "none";

  // Log
  addLog(`✨ ${item.icon} ${item.name} adicionado ao inventário!`, "item");

  // Salvar
  saveGameState();

  // Iniciar próxima wave após breve delay
  setTimeout(() => {
    startNextWave();
    resumeGame();
  }, 800);
}

// ═══════════════════════════════════════════
//  SISTEMA DE ESCOLHA DE ITEM
// ═══════════════════════════════════════════
const itemSelectionState = {
  selectedItems: [],
  maxSelections: 4,
  availableItems: [],
};

function showInitialItemSelection() {
  // Pausar o jogo
  state.isPaused = true;

  // Resetar seleção
  itemSelectionState.selectedItems = [];
  itemSelectionState.maxSelections = 4;

  // Gerar 12 itens aleatórios
  itemSelectionState.availableItems = generateRandomItems(12);

  // Renderizar modal
  const modal = document.getElementById("item-choice-modal");
  const container = document.getElementById("item-choices-container");

  // Atualizar header
  const modalHeader = modal.querySelector(".modal-header");
  modalHeader.innerHTML = `
    <h2>⚔️ Escolha Seus Itens Iniciais</h2>
    <p class="modal-subtitle">Selecione até 4 itens para começar sua jornada</p>
    <div class="selection-counter">
      <span id="selection-count">0</span> / ${itemSelectionState.maxSelections} selecionados
    </div>
  `;

  container.innerHTML = "";

  itemSelectionState.availableItems.forEach((item) => {
    const card = document.createElement("div");
    card.className = "item-choice-card";
    card.dataset.itemId = item.id;
    card.onclick = () => toggleItemSelection(item, card);

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

    container.appendChild(card);
  });

  // Adicionar botão de confirmação
  const confirmBtn = document.createElement("div");
  confirmBtn.className = "confirm-selection-btn";
  confirmBtn.id = "confirm-selection-btn";
  confirmBtn.innerHTML = "Iniciar Jogo";
  confirmBtn.onclick = confirmItemSelection;
  container.appendChild(confirmBtn);

  modal.style.display = "flex";
}

function toggleItemSelection(item, card) {
  const isSelected = itemSelectionState.selectedItems.some(
    (i) => i.id === item.id,
  );

  if (isSelected) {
    // Remover seleção
    itemSelectionState.selectedItems = itemSelectionState.selectedItems.filter(
      (i) => i.id !== item.id,
    );
    card.classList.remove("selected");
  } else {
    // Adicionar seleção se não atingiu o limite
    if (
      itemSelectionState.selectedItems.length < itemSelectionState.maxSelections
    ) {
      itemSelectionState.selectedItems.push(item);
      card.classList.add("selected");
    } else {
      addLog(
        `⚠️ Você já selecionou o máximo de ${itemSelectionState.maxSelections} itens!`,
        "item",
      );
      return;
    }
  }

  // Atualizar contador
  const counter = document.getElementById("selection-count");
  if (counter) {
    counter.textContent = itemSelectionState.selectedItems.length;
  }

  // Atualizar botão de confirmação
  const confirmBtn = document.getElementById("confirm-selection-btn");
  if (confirmBtn) {
    if (itemSelectionState.selectedItems.length > 0) {
      confirmBtn.classList.add("active");
    } else {
      confirmBtn.classList.remove("active");
    }
  }
}

function confirmItemSelection() {
  if (itemSelectionState.selectedItems.length === 0) {
    addLog("⚠️ Selecione pelo menos 1 item para continuar!", "item");
    return;
  }

  // Adicionar itens selecionados ao inventário
  state.items = [...itemSelectionState.selectedItems];

  // Inicializar timers
  state.items.forEach((item) => {
    if (item.cooldown > 0) {
      state.itemTimers[item.id] = {
        elapsed: item.cooldown,
        cooldown: item.cooldown,
      };
    }
  });

  // Reconstruir inventário
  buildInventory();

  // Fechar modal
  const modal = document.getElementById("item-choice-modal");
  modal.style.display = "none";

  // Iniciar o jogo
  addLog(
    `🎮 Jogo iniciado com ${state.items.length} itens! Boa sorte!`,
    "item",
  );
  spawnWave(1);

  // Salvar itens selecionados
  saveGameState();

  // Retomar jogo
  setTimeout(() => {
    resumeGame();
  }, 500);
}

function generateRandomItems(count) {
  // Pesos de raridade (maior = mais comum)
  const rarityWeights = {
    common: 40,
    uncommon: 30,
    rare: 18,
    epic: 9,
    legendary: 3,
  };

  const selectedItems = [];
  const usedIds = new Set();

  for (let i = 0; i < count; i++) {
    let item = null;
    let attempts = 0;

    // Tentar até 20 vezes para encontrar um item não repetido
    while (!item && attempts < 20) {
      // Sortear raridade baseado nos pesos
      const rarity = getWeightedRarity(rarityWeights);

      // Pegar itens dessa raridade
      const itemsOfRarity = ITEMS.filter((i) => i.rarity === rarity);

      if (itemsOfRarity.length > 0) {
        const randomItem =
          itemsOfRarity[Math.floor(Math.random() * itemsOfRarity.length)];

        if (!usedIds.has(randomItem.id)) {
          item = randomItem;
          usedIds.add(randomItem.id);
        }
      }

      attempts++;
    }

    // Se não encontrou, pegar qualquer item aleatório
    if (!item) {
      const remainingItems = ITEMS.filter((i) => !usedIds.has(i.id));
      if (remainingItems.length > 0) {
        item =
          remainingItems[Math.floor(Math.random() * remainingItems.length)];
        usedIds.add(item.id);
      }
    }

    if (item) {
      selectedItems.push(item);
    }
  }

  return selectedItems;
}

function getWeightedRarity(weights) {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (const [rarity, weight] of Object.entries(weights)) {
    random -= weight;
    if (random <= 0) {
      return rarity;
    }
  }

  return "common"; // Fallback
}

function getTypeLabel(type) {
  const labels = {
    weapon: "Arma",
    armor: "Armadura",
    relic: "Relíquia",
  };
  return labels[type] || type;
}

// ═══════════════════════════════════════════
//  ELEMENTAL & DOT SYSTEM
// ═══════════════════════════════════════════
function applyElementalDamage(target, baseDmg, element, source) {
  if (!target.resist) target.resist = {};
  const resist = target.resist[element] || 0;
  const finalDmg = Math.max(1, Math.round(baseDmg * (1 - resist)));

  target.hp -= finalDmg;
  target.hurtTimer = 15;
  if (source === "player") state.runStats.totalDamage += finalDmg;

  // Visual feedback based on resistance
  let color = "#ff4444";
  if (resist > 0.3)
    color = "#888888"; // Resisted
  else if (resist < -0.1) color = "#ffaa22"; // Weak to element

  spawnNumber(
    target.x,
    target.y - 40,
    `-${finalDmg}`,
    color,
    resist < -0.1 ? 5 : 4,
  );

  // Show resistance feedback
  if (resist > 0.3) {
    spawnEffect("text", target.x, target.y - 60, {
      life: 30,
      text: "RESISTIDO",
      color: "#888888",
    });
  } else if (resist < -0.1) {
    spawnEffect("text", target.x, target.y - 60, {
      life: 30,
      text: "FRACO!",
      color: "#ffaa22",
    });
  }

  return finalDmg;
}

function applyDot(target, type, damage, duration, stackable = true) {
  if (!target.dots) target.dots = [];

  // Stack or refresh
  const existing = target.dots.find((d) => d.type === type);
  if (existing && stackable) {
    existing.stacks = Math.min(5, existing.stacks + 1);
    existing.duration = duration;
    existing.damage = damage;
  } else if (existing) {
    existing.duration = duration;
  } else {
    target.dots.push({ type, damage, duration, stacks: 1, tickTimer: 0 });
  }

  // Visual feedback
  const icons = { burning: "🔥", poison: "☠️", bleeding: "💉" };
  spawnEffect("text", target.x, target.y - 50, {
    life: 40,
    text: icons[type] || "✨",
    color: type === "burning" ? "#ff6600" : "#88ff00",
  });
}

function processDots(dt) {
  [...state.enemies, state.player].forEach((entity) => {
    if (!entity.dots || entity.dead || entity.hp <= 0) return;

    entity.dots = entity.dots.filter((dot) => {
      dot.tickTimer += dt;

      if (dot.tickTimer >= 1000) {
        dot.tickTimer = 0;
        const dmg = Math.round(dot.damage * dot.stacks);
        entity.hp -= dmg;
        entity.hurtTimer = 8;

        const colors = {
          burning: "#ff8800",
          poison: "#88ff00",
          bleeding: "#ff0000",
        };
        spawnNumber(
          entity.x,
          entity.y - 30,
          `-${dmg}`,
          colors[dot.type] || "#ff8800",
          0,
        );

        dot.duration--;
      }

      return dot.duration > 0;
    });
  });
}

// ═══════════════════════════════════════════
//  UI UPDATE
// ═══════════════════════════════════════════
function updateUI() {
  const p = state.player;

  // Player bars
  document.getElementById("hp-bar").style.width = (p.hp / p.maxHp) * 100 + "%";
  document.getElementById("hp-val").textContent =
    `${Math.max(0, Math.round(p.hp))}/${p.maxHp}`;
  document.getElementById("mana-bar").style.width =
    (p.mana / p.maxMana) * 100 + "%";
  document.getElementById("mana-val").textContent =
    `${Math.round(p.mana)}/${p.maxMana}`;

  // Header stats
  document.getElementById("hdr-wave").textContent = state.wave;
  document.getElementById("hdr-kills").textContent = state.kills;
  document.getElementById("hdr-score").textContent = state.score;
  document.getElementById("hdr-fragments").textContent = state.fragments;

  // Wave info bar
  document.getElementById("inv-wave").textContent = `Onda ${state.wave}`;
  const alive = state.enemies.filter((e) => !e.dead).length;
  document.getElementById("inv-enemies").textContent =
    `${alive} inimigo${alive !== 1 ? "s" : ""}`;
  document.getElementById("inv-gold").textContent = `⚙ ${state.gold} ouro`;
}

// ═══════════════════════════════════════════
//  MAIN GAME LOOP
// ═══════════════════════════════════════════
let lastItemUpdate = 0;

function gameLoop(timestamp) {
  const dt = Math.min(timestamp - state.lastTime, 50) * state.gameSpeed;
  state.lastTime = timestamp;
  state.tick++;

  if (!state.running) {
    drawBackground();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#c9a84c";
    ctx.font = "bold 32px Cinzel";
    ctx.textAlign = "center";
    ctx.fillText("DERROTADO", canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillStyle = "#a08860";
    ctx.font = "16px Cinzel";
    ctx.fillText(
      `Onda ${state.wave} · Score: ${state.score}`,
      canvas.width / 2,
      canvas.height / 2 + 20,
    );
    requestAnimationFrame(gameLoop);
    return;
  }

  if (state.isPaused) {
    // Redesenha a tela mas não atualiza o estado do jogo
    const W = canvas.width,
      H = canvas.height;
    const groundY = H * 0.55;

    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawEffects();
    drawPlayer(state.player);
    state.enemies.forEach((en) => drawEnemy(en));

    // Overlay de pausa
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#c9a84c";
    ctx.font = "bold 36px Cinzel";
    ctx.textAlign = "center";
    ctx.fillText("⏸️ PAUSADO", W / 2, H / 2);
    ctx.fillStyle = "#a08860";
    ctx.font = "16px Cinzel";
    ctx.fillText("Pressione Play para continuar", W / 2, H / 2 + 40);

    requestAnimationFrame(gameLoop);
    return;
  }

  const W = canvas.width,
    H = canvas.height;
  const groundY = H * 0.55;

  // ─ Update item timers ─
  for (const item of state.items) {
    if (item.cooldown <= 0) continue;
    const timer = state.itemTimers[item.id];
    if (timer.elapsed < timer.cooldown) {
      timer.elapsed += dt;
    }
    // Auto-trigger when ready
    if (timer.elapsed >= timer.cooldown && state.enemies.some((e) => !e.dead)) {
      // Berserker totem: auto-trigger below 25% HP
      if (
        item.id === "berserker_totem" &&
        state.player.hp / state.player.maxHp < 0.25 &&
        !state.player.berserking
      ) {
        activateItem(item);
      } else if (
        item.type === "weapon" ||
        item.type === "relic" ||
        (item.type === "armor" && !item.passive)
      ) {
        activateItem(item);
      }
    }
  }

  // ─ Berserk end ─
  if (state.player.berserking && timestamp > state.player.berserkEnd) {
    state.player.berserking = false;
    state.player.anim = "idle";
    addLog(`🪬 Frenesi terminou.`, "item");
  }

  // ─ Process DoTs ─
  processDots(dt);

  // ─ Enemy movement & attack ─
  const playerX = state.player.x;
  state.enemies.forEach((en) => {
    if (en.dead) return;
    const dist = en.x - playerX;
    const combatDist = 80;

    if (dist > combatDist && en.moving) {
      en.x -= en.speed * dt * 0.06;
    } else {
      en.moving = false;
      en.atkTimer = (en.atkTimer || 0) + dt;
      if (en.atkTimer >= en.atkInterval) {
        en.atkTimer = 0;
        enemyAttack(en);
      }
    }

    // Kill check
    if (en.hp <= 0 && !en.dead) {
      en.dead = true;
      state.kills++;
      state.score += en.xp;
      state.gold += en.gold || 0;
      state.fragments += en.fragments || 1;
      sfx.kill();
      spawnEffect("death", en.x, en.y - 30, { life: 50 });
      spawnNumber(en.x, en.y - 50, `+${en.xp} XP`, "#c9a84c", 3);
      if (en.fragments > 0) {
        spawnNumber(en.x - 20, en.y - 65, `⚡${en.fragments}`, "#aa66ee", 2);
      }
      addLog(
        `💀 ${en.name} foi derrotado! +${en.fragments || 1} fragmentos.`,
        "kill",
      );
    }
  });

  // ─ Idle anim reset ─
  if (state.player.animTimer > 0) {
    state.player.animTimer -= dt;
  } else if (state.player.anim !== "idle" && !state.player.berserking) {
    state.player.anim = "idle";
  }

  // ─ DRAW ─
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawEffects();
  drawPlayer(state.player);
  state.enemies.forEach((en) => drawEnemy(en));

  // Wave transition overlay
  if (state.waveTransition) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#c9a84c";
    ctx.font = "bold 22px Cinzel";
    ctx.textAlign = "center";
    ctx.fillText(`ONDA ${state.wave} CONCLUÍDA`, W / 2, H / 2 - 15);
    ctx.font = "14px Cinzel";
    ctx.fillStyle = "#a08860";
    ctx.fillText("Preparando próxima onda...", W / 2, H / 2 + 15);
  }

  // ─ Update HUD ─
  if (timestamp - lastItemUpdate > 50) {
    lastItemUpdate = timestamp;
    updateHUD();
  }

  checkWaveComplete();
  requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════
//  HUD UPDATE
// ═══════════════════════════════════════════
function updateHUD() {
  const p = state.player;
  // Bars
  document.getElementById("hp-bar").style.width = (p.hp / p.maxHp) * 100 + "%";
  document.getElementById("hp-val").textContent =
    `${Math.max(0, Math.round(p.hp))}/${p.maxHp}`;
  document.getElementById("mana-bar").style.width =
    (p.mana / p.maxMana) * 100 + "%";
  document.getElementById("mana-val").textContent =
    `${Math.round(p.mana)}/${p.maxMana}`;

  // Header stats
  document.getElementById("hdr-wave").textContent = state.wave;
  document.getElementById("hdr-kills").textContent = state.kills;
  document.getElementById("hdr-score").textContent = state.score;
  document.getElementById("hdr-fragments").textContent = state.fragments;

  // Wave info bar
  document.getElementById("inv-wave").textContent = `Onda ${state.wave}`;
  const alive = state.enemies.filter((e) => !e.dead).length;
  document.getElementById("inv-enemies").textContent =
    `${alive} inimigo${alive !== 1 ? "s" : ""}`;
  document.getElementById("inv-gold").textContent = `⚙ ${state.gold} ouro`;

  // Item cooldown bars
  state.items.forEach((item) => {
    if (item.cooldown <= 0) return;
    const timer = state.itemTimers[item.id];
    const slot = document.querySelector(`.item-slot[data-id="${item.id}"]`);
    if (!slot) return;
    const pct = Math.min(1, timer.elapsed / timer.cooldown);
    const bar = document.getElementById("cd-bar-" + item.id);
    const cdText = document.getElementById("cd-text-" + item.id);

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
function addLog(msg, type = "") {
  const panel = document.getElementById("log-panel");
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

// ═══════════════════════════════════════════
//  GAME OVER SCREEN
// ═══════════════════════════════════════════
function showGameOverScreen() {
  const modal = document.getElementById("game-over-modal");
  const statsEl = document.getElementById("go-stats");
  const subtitle = document.getElementById("go-subtitle");

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
    const item = ITEMS.find((i) => i.id === topId);
    if (item) favoriteItem = `${item.icon} ${item.name} (${topCount}×)`;
  }

  subtitle.textContent = `Você caiu na onda ${state.wave}.`;

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

  statsEl.innerHTML = stats
    .map(
      (s) => `
      <div class="go-stat${s.wide ? " wide" : ""}">
        <div class="go-stat-label">${s.label}</div>
        <div class="go-stat-value">${s.value}</div>
      </div>`,
    )
    .join("");

  modal.style.display = "flex";
}

// ═══════════════════════════════════════════
//  RESTART
// ═══════════════════════════════════════════
function restartGame() {
  state.wave = 1;
  state.kills = 0;
  state.score = 0;
  state.gold = 0;
  // Fragments persist (meta-progression)
  state.effects = [];
  state.projectiles = [];
  state.player = {
    hp: 100,
    maxHp: 100,
    mana: 0,
    maxMana: 100,
    armor: 0,
    magicBoost: 0,
    x: canvas.width * 0.22,
    y: canvas.height * 0.55,
    anim: "idle",
    animTimer: 0,
    berserking: false,
    berserkEnd: 0,
    reviveUsed: false,
    charges: {},
    dots: [],
    elementalStatus: {},
  };
  state.running = true;
  state.isPaused = false;
  state.waveTransition = false;
  state.runStats = {
    totalDamage: 0,
    itemUses: {},
    startTime: performance.now(),
  };
  document.getElementById("log-panel").innerHTML = "";
  addLog(
    `⚡ Mantidos ${state.fragments} fragmentos de runs anteriores.`,
    "item",
  );
  buildInventory();
  spawnWave(1);

  // Resetar botões de controle
  const btnPlay = document.getElementById("btn-play");
  const btnPause = document.getElementById("btn-pause");
  if (btnPlay) {
    btnPlay.disabled = true;
    btnPlay.classList.remove("active");
  }
  if (btnPause) {
    btnPause.disabled = false;
    btnPause.classList.add("active");
  }
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
function init() {
  state.player.x = canvas.width * 0.22;
  state.player.y = canvas.height * 0.55;
  state.runStats.startTime = performance.now();

  // Tentar carregar jogo salvo
  const hasSavedGame = loadGameState();

  if (hasSavedGame) {
    // Jogo carregado - reconstruir inventário e iniciar wave atual
    addLog(`🏰 Bem-vindo de volta! Continuando da Wave ${state.wave}.`, "item");
    buildInventory();
    spawnWave(state.wave);
    updateUI();
  } else {
    // Novo jogo - limpar inventário e mostrar seleção
    state.items = [];
    addLog("🏰 Bem-vindo ao Reliquary! Escolha seus itens iniciais.", "item");
    showInitialItemSelection();
  }

  state.lastTime = performance.now();
  requestAnimationFrame(gameLoop);

  // Configurar controles
  setupGameControls();
}

// ═══════════════════════════════════════════
//  GAME CONTROLS (PLAY/PAUSE)
// ═══════════════════════════════════════════
function setupGameControls() {
  const btnPlay = document.getElementById("btn-play");
  const btnPause = document.getElementById("btn-pause");
  const btnReset = document.getElementById("btn-reset");
  const btnSpeed = document.getElementById("btn-speed");
  const btnMute = document.getElementById("btn-mute");
  const btnRestart = document.getElementById("btn-restart");

  if (!btnPlay || !btnPause) return;

  // Inicialmente, Play está ativo e Pause desabilitado (jogo inicia pausado)
  btnPlay.disabled = false;
  btnPlay.classList.add("active");
  btnPause.disabled = true;
  btnPause.classList.remove("active");

  btnPlay.addEventListener("click", () => {
    if (!state.isPaused) return;
    resumeGame();
  });

  btnPause.addEventListener("click", () => {
    if (state.isPaused) return;
    pauseGame();
  });

  if (btnReset) {
    btnReset.addEventListener("click", resetGameState);
  }

  if (btnSpeed) {
    const speeds = [1, 2, 3];
    btnSpeed.addEventListener("click", () => {
      const idx = speeds.indexOf(state.gameSpeed);
      state.gameSpeed = speeds[(idx + 1) % speeds.length];
      btnSpeed.textContent = `⏩ ${state.gameSpeed}×`;
      btnSpeed.classList.toggle("active", state.gameSpeed > 1);
    });
  }

  if (btnMute) {
    btnMute.addEventListener("click", () => {
      const muted = sfx.toggleMute();
      btnMute.textContent = muted ? "🔇" : "🔊";
    });
  }

  if (btnRestart) {
    btnRestart.addEventListener("click", () => {
      document.getElementById("game-over-modal").style.display = "none";
      restartGame();
    });
  }
}

function pauseGame() {
  if (state.isPaused || !state.running) return;

  state.isPaused = true;
  const btnPlay = document.getElementById("btn-play");
  const btnPause = document.getElementById("btn-pause");

  if (btnPlay) {
    btnPlay.disabled = false;
    btnPlay.classList.add("active");
  }
  if (btnPause) {
    btnPause.disabled = true;
    btnPause.classList.remove("active");
  }

  addLog("⏸️ Jogo pausado.", "item");
}

function resumeGame() {
  if (!state.isPaused || !state.running) return;

  state.isPaused = false;
  state.lastTime = performance.now(); // Reset timer para evitar salto no dt

  const btnPlay = document.getElementById("btn-play");
  const btnPause = document.getElementById("btn-pause");

  if (btnPlay) {
    btnPlay.disabled = true;
    btnPlay.classList.remove("active");
  }
  if (btnPause) {
    btnPause.disabled = false;
    btnPause.classList.add("active");
  }

  addLog("▶️ Jogo retomado.", "item");
}

// ═══════════════════════════════════════════
//  CARREGAR ITENS DO JSON
// ═══════════════════════════════════════════
async function loadItems() {
  try {
    const response = await fetch("assets/items.json");
    if (!response.ok) {
      throw new Error("Erro ao carregar items.json");
    }
    ITEMS = await response.json();
    console.log(`✅ ${ITEMS.length} itens carregados com sucesso!`);
    init();
  } catch (error) {
    console.error("❌ Erro ao carregar itens:", error);
    addLog("❌ Erro ao carregar itens do jogo.", "item");
  }
}

// Inicializar o jogo após carregar os itens
loadItems();
