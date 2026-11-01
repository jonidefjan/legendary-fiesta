// ═══════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════
// Objeto único compartilhado: os módulos leem e alteram este estado.
export const PLAYER_BASE = {
  maxHp: 100,
  armor: 0,
  critChance: 0.05,
  critMult: 1.5, // golpe crítico causa ×1,5 (a Moeda da Fortuna N5 sobe para ×2)
};

export function createPlayer(x = 180, y = 0) {
  return {
    hp: PLAYER_BASE.maxHp,
    maxHp: PLAYER_BASE.maxHp,
    baseMaxHp: PLAYER_BASE.maxHp, // vida máxima antes dos itens passivos (meta.js define)
    armor: PLAYER_BASE.armor,
    // Atributos dos itens passivos (items.applyPassives recalcula)
    critChance: PLAYER_BASE.critChance,
    critMult: PLAYER_BASE.critMult,
    elementalBoost: 0, // +0.1 = +10% de dano das armas elementais (Manto do Arcano)
    extraStacks: 0,
    reach: 0,
    regen: 0, // HP por segundo (Couraça de Batalha)
    regenTimer: 0,
    dotReduction: 0,
    damageReduction: 0,
    maxHpBonus: 0, // vida máxima ganha na run (Foice de Sangue N5; vai no save)
    evasion: 0,
    weaponSpeed: 0, // +0.15 = armas recarregam 15% mais rápido
    damageBoost: 0, // +0.5 = +50% de dano (Anel Amaldiçoado)
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
    blocksLeft: 0, // golpes que o Escudo de Ferro ainda bloqueia
    lastActivated: null, // id do último item ativado: a Pedra de Eco o repete
    // Estado dos itens na run (salvo): bônus do Pacto, contadores de Tempestade/Sprint/Colheita
    pactBonus: 0,
    counters: {},
    harvestReady: false, // Colheita: próximo ataque da Foice causa dano ×2
    empowered: 0, // Fuga: bônus de dano do próximo ataque depois de esquivar
    tide: null, // Maré: { target, stacks } (some ao trocar de alvo ou de onda)
    // Bônus das melhorias permanentes (meta.js aplica no começo da run)
    baseArmor: PLAYER_BASE.armor, // armadura antes dos itens passivos
    damageBonus: 0, // +0.05 = +5% de dano em todos os ataques
    cooldownBonus: 0, // +0.03 = recargas 3% mais rápidas
    critBonus: 0, // +0.01 = +1% de crítico (melhoria Precisão)
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
    // Formas evoluídas: abates acumulados para o próximo nível (id -> abates)
    evolveKills: {},
    running: true,
    isPaused: true,
    waveTransition: false,
    // Depois de vencer o chefe da onda 10, a run segue no modo infinito
    endless: false,
    victoryShown: false,
    // Telas de recompensa seguidas sem lendário (4 seguidas garantem um na próxima)
    rewardsSinceLegendary: 0,
    // Rerrolagens de recompensa que ainda restam nesta run (melhoria Rerrolar; vai no save)
    rerollsLeft: 0,
    runStats: { totalDamage: 0, itemUses: {}, damageByItem: {}, startTime: 0 },
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
