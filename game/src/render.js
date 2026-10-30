// ═══════════════════════════════════════════
//  CANVAS & DRAWING
// ═══════════════════════════════════════════
// Duas camadas:
//   mundo  -> desenhado em 2D num canvas de origem e passado pelo shader de pixel art
//             (postfx.js). Sem WebGL, o mundo é desenhado direto no canvas visível.
//   texto  -> canvas por cima, sem shader: números de dano, nomes e avisos de tela
//             ficariam ilegíveis pixelados.
import { state } from "./state.js";
import { createPostFX } from "./postfx.js";
import * as particles from "./particles.js";

let canvas = null; // onde o mundo é desenhado (origem do shader ou o canvas visível)
let ctx = null; // contexto atual; onOverlay() troca para a camada de texto
let worldCtx = null;
let overlay = null;
let overlayCtx = null;
let postfx = null;
// Deslocamento da "câmera" (tremida de tela), aplicado ao mundo e aos textos presos a ele
const camera = { x: 0, y: 0 };

export function setupCanvas(display, overlayEl) {
  postfx = createPostFX(display);
  canvas = postfx ? postfx.source : display;
  worldCtx = canvas.getContext("2d");
  ctx = worldCtx;
  overlay = overlayEl;
  overlayCtx = overlay.getContext("2d");
}

export function getCanvas() {
  return canvas;
}

export function getPostFX() {
  return postfx;
}

export function setCamera(x, y) {
  camera.x = x;
  camera.y = y;
}

export function resizeCanvas() {
  const arena = document.getElementById("arena");
  const width = arena.clientWidth;
  const height = arena.clientHeight;
  if (postfx) {
    postfx.resize(width, height);
  } else {
    canvas.width = width;
    canvas.height = height;
  }
  overlay.width = width;
  overlay.height = height;
  state.player.y = canvas.height * 0.6;
  // Inimigos guardam o chão da hora em que nasceram; acompanham o novo tamanho
  state.enemies.forEach((en) => {
    en.y = canvas.height * 0.55;
  });
}

// Desenha na camada de texto, acompanhando a câmera
function onOverlay(draw) {
  ctx = overlayCtx;
  ctx.save();
  ctx.translate(camera.x, camera.y);
  draw();
  ctx.restore();
  ctx = worldCtx;
}

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
export function drawBackground() {
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
export function drawPlayer(p) {
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
  onOverlay(() => {
    ctx.fillStyle = "#c9a84c";
    ctx.font = "8px 'Pixelify Sans'";
    ctx.textAlign = "center";
    ctx.fillText("YOU", bodyX, headY - headR - 22);
  });
}

// ─── Draw Enemy ───
export function drawEnemy(en) {
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
  onOverlay(() => {
    ctx.fillStyle = "#c9a84c";
    ctx.font = "bold 9px 'Pixelify Sans'";
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
          ctx.font = "bold 8px 'Pixelify Sans'";
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`×${dot.stacks}`, ex + offsetX + 8, barY - 10);
          ctx.fillStyle = "#c9a84c";
        }
        offsetX += 14;
      });
    }
  });

  if (en.hurtTimer > 0) en.hurtTimer -= 1;
}

// ─── Draw Effects ───
export function drawEffects() {
  const toRemove = [];
  state.effects.forEach((ef, idx) => {
    ef.life -= 1;
    if (ef.life <= 0) {
      toRemove.push(idx);
      return;
    }
    const a = ef.life / ef.maxLife;

    // Números e textos vão para a camada sem shader
    const onTop = ef.type === "number" || ef.type === "text";
    if (onTop) {
      ctx = overlayCtx;
      ctx.save();
      ctx.translate(camera.x, camera.y);
    }
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
      ctx.font = `bold ${12 + ef.size}px 'Pixelify Sans'`;
      ctx.textAlign = "center";
      ctx.fillStyle = ef.color || "#e8c96a";
      ctx.shadowColor = ef.color || "#c9a84c";
      ctx.shadowBlur = 6;
      ctx.fillText(ef.text, ef.x, ef.y - (1 - a) * 40);
    } else if (ef.type === "text") {
      ctx.font = `bold 11px 'Pixelify Sans'`;
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
    if (onTop) {
      ctx.restore();
      ctx = worldCtx;
    }
  });

  for (let i = toRemove.length - 1; i >= 0; i--) {
    state.effects.splice(toRemove[i], 1);
  }
}

// ─── Frames ───
function beginFrame() {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  ctx = worldCtx;
  ctx.fillStyle = "#0a0810";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawWorld() {
  ctx.save();
  ctx.translate(camera.x, camera.y);
  drawBackground();
  drawPlayer(state.player);
  state.enemies.forEach((en) => drawEnemy(en));
  particles.draw(ctx);
  drawEffects();
  ctx.restore();
}

// Passa o mundo pelo shader (sem WebGL, ele já está no canvas visível)
function present() {
  postfx?.render();
}

// Escurece a tela e escreve um aviso centralizado na camada de texto
function drawScreenMessage(dim, title, subtitle, titleFont, subtitleFont, gap) {
  const W = overlay.width,
    H = overlay.height;
  const c = overlayCtx;
  c.fillStyle = `rgba(0,0,0,${dim})`;
  c.fillRect(0, 0, W, H);
  c.fillStyle = "#c9a84c";
  c.font = titleFont;
  c.textAlign = "center";
  c.fillText(title, W / 2, H / 2 - gap.title);
  c.fillStyle = "#a08860";
  c.font = subtitleFont;
  c.fillText(subtitle, W / 2, H / 2 + gap.subtitle);
}

export function drawRunningFrame(dt = 16) {
  beginFrame();
  particles.update(dt);
  drawWorld();
  present();
  if (state.waveTransition) {
    drawScreenMessage(
      0.3,
      `ONDA ${state.wave} CONCLUÍDA`,
      "Preparando próxima onda...",
      "bold 22px 'Pixelify Sans'",
      "14px 'Pixelify Sans'",
      { title: 15, subtitle: 15 },
    );
  }
}

export function drawPausedFrame() {
  beginFrame();
  drawWorld();
  present();
  drawScreenMessage(
    0.5,
    "⏸️ PAUSADO",
    "Pressione Play para continuar",
    "bold 36px 'Pixelify Sans'",
    "16px 'Pixelify Sans'",
    { title: 0, subtitle: 40 },
  );
}

export function drawDefeatFrame() {
  beginFrame();
  drawBackground();
  present();
  drawScreenMessage(
    0.6,
    "DERROTADO",
    `Onda ${state.wave} · Score: ${state.score}`,
    "bold 32px 'Pixelify Sans'",
    "16px 'Pixelify Sans'",
    { title: 20, subtitle: 20 },
  );
}
