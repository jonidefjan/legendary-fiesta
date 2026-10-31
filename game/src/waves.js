// ═══════════════════════════════════════════
//  ENEMY WAVES
// ═══════════════════════════════════════════
import { random } from "./random.js";

// shape = modelo 3D (KayKit Skeletons): minion, rogue, warrior; "mage" fica para o chefe Lich
export const ENEMY_TYPES = [
  {
    name: "Esqueleto",
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
    name: "Esqueleto Ladino",
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
    name: "Esqueleto Guerreiro",
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

// Cria os inimigos de uma onda. mobile: começam mais longe, mais lentos e batem menos
export function createWave(waveNum, { width, height, mobile = false }) {
  const groundY = height * 0.55;
  const count = 2 + waveNum;
  const hpScale = 1 + (waveNum - 1) * 0.2;
  const dmgScale = 1 + (waveNum - 1) * 0.15;

  const mobileMultiplier = mobile ? 1.4 : 1.0;
  const mobileSpeedReduction = mobile ? 0.7 : 1.0;
  const mobileDmgReduction = mobile ? 0.85 : 1.0;

  const enemies = [];
  for (let i = 0; i < count; i++) {
    const typeIdx = Math.floor(
      random() * Math.min(ENEMY_TYPES.length, Math.ceil(waveNum / 2)),
    );
    const base = ENEMY_TYPES[typeIdx];
    enemies.push({
      ...base,
      hp: Math.round(base.hp * hpScale),
      maxHp: Math.round(base.hp * hpScale),
      dmg: Math.round(base.dmg * dmgScale * mobileDmgReduction),
      speed: base.speed * mobileSpeedReduction,
      x: width * 0.6 * mobileMultiplier + i * 90 + random() * 40,
      y: groundY,
      phase: random() * Math.PI * 2,
      hurtTimer: 0,
      atkTimer: 0,
      dead: false,
      moving: true,
      dots: [],
      burning: 0,
    });
  }
  return enemies;
}
