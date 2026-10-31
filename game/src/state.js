// ═══════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════
// Objeto único compartilhado: os módulos leem e alteram este estado.
export const PLAYER_BASE = { maxHp: 100, maxMana: 100, armor: 0, magicBoost: 0 };

export function createPlayer(x = 180, y = 0) {
  return {
    hp: PLAYER_BASE.maxHp,
    maxHp: PLAYER_BASE.maxHp,
    mana: 0,
    maxMana: PLAYER_BASE.maxMana,
    armor: PLAYER_BASE.armor,
    magicBoost: PLAYER_BASE.magicBoost,
    x,
    y,
    anim: "idle",
    animTimer: 0,
    // Frenesi (Totem Berserker): armas recarregam mais rápido enquanto dura
    berserking: false,
    berserkRemaining: 0,
    berserkSpeed: 0,
    // Itens que já usaram o gatilho de vida baixa nesta onda
    lowHpUsed: {},
    reviveUsed: false,
    nextBlockActive: false,
    barrier: 0,
    manaOverflow: 0,
    // Bônus das melhorias permanentes (meta.js aplica no começo da run)
    baseArmor: PLAYER_BASE.armor, // armadura antes dos itens passivos
    damageBonus: 0, // +0.05 = +5% de dano em todos os ataques
    cooldownBonus: 0, // +0.03 = recargas 3% mais rápidas
    charges: {},
    dots: [],
  };
}

function freshRun() {
  return {
    wave: 1,
    kills: 0,
    score: 0,
    enemies: [],
    effects: [],
    items: [],
    // Nível de cada item da run (id -> 1..MAX_ITEM_LEVEL); repetido sobe de nível
    itemLevels: {},
    itemTimers: {},
    running: true,
    isPaused: true,
    waveTransition: false,
    // Depois de vencer o chefe da onda 10, a run segue no modo infinito
    endless: false,
    victoryShown: false,
    runStats: { totalDamage: 0, itemUses: {}, startTime: 0 },
  };
}

// Progresso permanente: compras de melhorias e recordes (salvo com os fragmentos)
function freshMeta() {
  return {
    upgrades: {}, // id -> nível comprado
    best: { wave: 0, score: 0 },
    bossesBeaten: 0,
  };
}

export const state = {
  ...freshRun(),
  fragments: 0,
  meta: freshMeta(),
  player: createPlayer(),
  tick: 0,
  lastTime: 0,
  gameSpeed: 1,
};

export function resetMeta() {
  state.fragments = 0;
  state.meta = freshMeta();
}

// Começa uma run nova. Fragmentos (meta-progressão) e velocidade escolhida continuam.
export function resetRun({ x, y } = {}) {
  Object.assign(state, freshRun());
  state.player = createPlayer(x, y);
}
