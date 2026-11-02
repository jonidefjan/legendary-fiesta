// ═══════════════════════════════════════════
//  ENEMY WAVES
// ═══════════════════════════════════════════
import { random } from "./random.js";
import { t, hasKey } from "./i18n.js";
import { isRearAt } from "./combat.js";

// shape = modelo 3D (KayKit Skeletons): minion, rogue, warrior; "mage" é do chefe Lich e do
// Esqueleto Mago (RANGED_TYPES, abaixo)
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

// Atiradores: estacionários, nascem no fundo da arena e disparam projéteis (combat.js).
// Ficam fora de ENEMY_TYPES porque o sorteio de createWave, a escolta dos chefes e os
// invocados do Lich usam índices de ENEMY_TYPES. minWave = primeira onda em que aparece.
export const RANGED_TYPES = [
  {
    kind: "archer",
    shape: "rogue",
    hp: 22,
    dmg: 7,
    speed: 0,
    size: 16,
    atkInterval: 2200,
    xp: 14,
    fragments: 3,
    ranged: true,
    projectile: "arrow", // rápida (~0,9 px/ms)
    minWave: 11,
    resist: { fire: -0.2, water: 0, ice: 0, lightning: 0, physical: 0.1 },
  },
  {
    kind: "mage",
    shape: "mage",
    hp: 28,
    dmg: 9,
    speed: 0,
    size: 18,
    atkInterval: 2800,
    xp: 18,
    fragments: 4,
    ranged: true,
    projectile: "orb", // lenta (~0,5 px/ms)
    minWave: 13,
    resist: { fire: 0, water: 0, ice: 0.3, lightning: -0.2, physical: -0.1 },
  },
];

// Nome exibido do inimigo no idioma atual (overlay, log, vitória). O dado guarda só
// o id estável (kind); sem kind (inimigos de teste) cai no name que o objeto tiver.
export function enemyName(en) {
  if (en.summoned) return t("enemies.summoned");
  const key = `enemies.${en.kind}`;
  return en.kind && hasKey(key) ? t(key) : en.name || "";
}

// Escalas da onda (vida +20%, dano +15% por onda); mobile bate menos.
// Late game: da onda 11 em diante, cada onda acima da 10 multiplica a vida por 1,15 e o
// dano por 1,08 (comuns e chefes, que também usam waveScales). Ondas 1 a 10 não mudam.
export const LATE_WAVE = 10;
export const LATE_HP = 1.15;
export const LATE_DMG = 1.08;

export function waveScales(waveNum, mobile = false) {
  const over = Math.max(0, waveNum - LATE_WAVE);
  return {
    hp: (1 + (waveNum - 1) * 0.2) * LATE_HP ** over,
    dmg: (1 + (waveNum - 1) * 0.15) * (mobile ? 0.85 : 1) * LATE_DMG ** over,
  };
}

// Quantos atiradores a onda tem: só no late game (a partir da 11, depois do primeiro chefe); teto 4. Eles ocupam vagas do total
// (2 + onda), então o número de inimigos não muda.
export function rangedCount(waveNum) {
  if (waveNum < 11) return 0;
  if (waveNum <= 20) return 2;
  if (waveNum <= 30) return 3;
  return 4;
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

// Atiradores ficam perto da borda direita visível, com folga para o modelo aparecer
// inteiro; cada um ~45 px mais perto do herói que o anterior. Sempre na linha de trás
// (isRearAt) e dentro de maxX; sem maxX usa 90% da largura.
const RANGED_EDGE = 30;
const RANGED_STEP = 45;

export function rangedSpawnX(index, count, { width, maxX = Infinity, playerX = width * 0.22 }) {
  const edge = Number.isFinite(maxX) ? maxX - RANGED_EDGE : width * 0.9;
  // playerX: posição real do herói (a spawnWave informa); width * 0.22 é a reserva dos testes
  const rightX = Number.isFinite(maxX) ? maxX : edge; // a linha de trás vale a partir de maxX
  // Menor x ainda na linha de trás (arena estreita no celular aperta o espaçamento)
  let rearMin = playerX;
  while (!isRearAt(rearMin, playerX, rightX) && rearMin < edge) rearMin += 1;
  const step = count > 1 ? Math.max(0, Math.min(RANGED_STEP, (edge - rearMin) / (count - 1))) : 0;
  return edge - index * step;
}

// Monta o inimigo a partir do tipo base, já com as escalas da onda e a posição x
function buildEnemy(base, waveNum, arena, x) {
  const { height, mobile = false } = arena;
  const scales = waveScales(waveNum, mobile);
  const groundY = height * 0.55;
  const mobileSpeedReduction = mobile ? 0.7 : 1.0;
  return {
    ...base,
    hp: Math.round(base.hp * scales.hp),
    maxHp: Math.round(base.hp * scales.hp),
    dmg: Math.round(base.dmg * scales.dmg),
    speed: base.speed * mobileSpeedReduction,
    x,
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

// Um inimigo comum da onda: index e count posicionam ele na fila de entrada
export function createEnemy(typeIdx, waveNum, arena, index = 0, count = 1) {
  const x = lineupX(index, count, arena);
  return buildEnemy(ENEMY_TYPES[typeIdx], waveNum, arena, x);
}

// Um atirador: sorteia entre os já liberados na onda, nasce parado no fundo da arena.
// Ocupa uma vaga da fila, mas não usa lineupX.
export function createRanged(waveNum, arena, index = 0, count = 1) {
  const open = RANGED_TYPES.filter((type) => type.minWave <= waveNum);
  const base = open[Math.min(open.length - 1, Math.floor(random() * open.length))];
  const en = buildEnemy(base, waveNum, arena, rangedSpawnX(index, count, arena));
  en.moving = false; // nunca anda
  return en;
}

// Cria os inimigos de uma onda. mobile: começam mais longe, mais lentos e batem menos.
// Os atiradores ocupam vagas do total (2 + onda); onda de chefe (múltiplo de 10) tem
// regras próprias em boss.js e não leva atirador aqui.
export function createWave(waveNum, arena) {
  const count = 2 + waveNum;
  const ranged = waveNum % 10 === 0 ? 0 : rangedCount(waveNum);
  const regular = count - ranged;
  const enemies = [];
  for (let i = 0; i < regular; i++) {
    const typeIdx = Math.floor(
      random() * Math.min(ENEMY_TYPES.length, Math.ceil(waveNum / 2)),
    );
    enemies.push(createEnemy(typeIdx, waveNum, arena, i, regular));
  }
  for (let i = 0; i < ranged; i++) enemies.push(createRanged(waveNum, arena, i, ranged));
  return enemies;
}
