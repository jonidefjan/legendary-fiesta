// ═══════════════════════════════════════════
//  ENEMY WAVES
// ═══════════════════════════════════════════
import { random } from "./random.js";
import { t, hasKey } from "./i18n.js";

// shape = modelo 3D (KayKit Skeletons): minion, rogue, warrior; "mage" fica para o chefe Lich
export const ENEMY_TYPES = [
  {
    kind: "skeleton",
    shape: "minion",
    hp: 35,
    dmg: 6,
    speed: 0.4,
    size: 18,
    atkInterval: 2000,
    xp: 10,
    fragments: 2,
    resist: { fire: 0, water: 0, ice: 0.2, lightning: 0.3, physical: 0 },
  },
  {
    kind: "rogue",
    shape: "rogue",
    hp: 25,
    dmg: 8,
    speed: 0.7,
    size: 16,
    atkInterval: 1600,
    xp: 8,
    fragments: 1,
    resist: { fire: -0.2, water: 0, ice: 0, lightning: 0, physical: 0.1 },
  },
  {
    kind: "warrior",
    shape: "warrior",
    hp: 55,
    dmg: 14,
    speed: 0.3,
    size: 22,
    atkInterval: 2500,
    xp: 20,
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

// Nome exibido do inimigo no idioma atual (overlay, log, vitória). O dado guarda só
// o id estável (kind); sem kind (inimigos de teste) cai no name que o objeto tiver.
export function enemyName(en) {
  if (en.summoned) return t("enemies.summoned");
  const key = `enemies.${en.kind}`;
  return en.kind && hasKey(key) ? t(key) : en.name || "";
}

// Escalas da onda (vida +20%, dano +15% por onda); mobile bate menos
export function waveScales(waveNum, mobile = false) {
  return {
    hp: 1 + (waveNum - 1) * 0.2,
    dmg: (1 + (waveNum - 1) * 0.15) * (mobile ? 0.85 : 1),
  };
}

// Fila de entrada: do ponto inicial (mais longe no celular) até a borda direita
// visível (maxX). Ondas grandes ficam mais juntas em vez de nascer fora da tela;
// sem maxX o espaçamento é o de sempre (90 px)
const LINEUP_SPACING = 90;
const LINEUP_JITTER = 40;

export function lineupX(index, count, { width, mobile = false, maxX = Infinity }) {
  const start = Math.min(width * 0.6 * (mobile ? 1.4 : 1), maxX - LINEUP_JITTER);
  const room = maxX - LINEUP_JITTER - start;
  const spacing =
    count > 1 ? Math.max(0, Math.min(LINEUP_SPACING, room / (count - 1))) : 0;
  return start + index * spacing + random() * LINEUP_JITTER;
}

// Um inimigo comum da onda: index e count posicionam ele na fila de entrada
export function createEnemy(typeIdx, waveNum, arena, index = 0, count = 1) {
  const { height, mobile = false } = arena;
  const base = ENEMY_TYPES[typeIdx];
  const scales = waveScales(waveNum, mobile);
  const groundY = height * 0.55;
  const mobileSpeedReduction = mobile ? 0.7 : 1.0;
  return {
    ...base,
    hp: Math.round(base.hp * scales.hp),
    maxHp: Math.round(base.hp * scales.hp),
    dmg: Math.round(base.dmg * scales.dmg),
    speed: base.speed * mobileSpeedReduction,
    x: lineupX(index, count, arena),
    y: groundY,
    phase: random() * Math.PI * 2,
    hurtTimer: 0,
    atkTimer: 0,
    dead: false,
    moving: true,
    dots: [],
    burning: 0,
  };
}

// Cria os inimigos de uma onda. mobile: começam mais longe, mais lentos e batem menos
export function createWave(waveNum, arena) {
  const count = 2 + waveNum;
  const enemies = [];
  for (let i = 0; i < count; i++) {
    const typeIdx = Math.floor(
      random() * Math.min(ENEMY_TYPES.length, Math.ceil(waveNum / 2)),
    );
    enemies.push(createEnemy(typeIdx, waveNum, arena, i, count));
  }
  return enemies;
}
