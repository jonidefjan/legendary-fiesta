// ═══════════════════════════════════════════
//  SAVE/LOAD SYSTEM
// ═══════════════════════════════════════════
// Duas partes: a run atual (salva no começo de cada onda e apagada ao morrer)
// e o progresso permanente (fragmentos). A run guarda só os IDs dos itens:
// mudanças no items.json valem também para quem já tem save.
import { state } from "./state.js";
import { findItem } from "./items.js";

export const RUN_KEY = "reliquary_run";
export const META_KEY = "reliquary_meta_v1";
export const SAVE_VERSION = 2;
// Versão 1: objetos de item inteiros e fragmentos junto com a run
const LEGACY_RUN_KEY = "reliquary_save_v1";

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch (error) {
    return null; // storage bloqueado: o jogo roda sem salvar
  }
}

let storage = defaultStorage();

// Os testes usam um storage em memória
export function setStorage(next) {
  storage = next;
}

function read(key) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(`❌ Erro ao ler ${key}:`, error);
    return null;
  }
}

function write(key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`❌ Erro ao salvar ${key}:`, error);
  }
}

function remove(key) {
  try {
    storage?.removeItem(key);
  } catch (error) {
    console.error(`❌ Erro ao apagar ${key}:`, error);
  }
}

// ─── Run ───
export function serializeRun() {
  return {
    version: SAVE_VERSION,
    wave: state.wave,
    kills: state.kills,
    score: state.score,
    items: state.items.map((i) => i.id),
    itemLevels: state.itemLevels,
    itemTimers: state.itemTimers,
    endless: state.endless,
    victoryShown: state.victoryShown,
    rewardsSinceLegendary: state.rewardsSinceLegendary,
    totalDamage: state.runStats.totalDamage,
    damageByItem: state.runStats.damageByItem,
    player: {
      hp: state.player.hp,
      maxHp: state.player.maxHp,
      mana: state.player.mana,
      maxMana: state.player.maxMana,
      pactBonus: state.player.pactBonus,
      counters: state.player.counters,
      harvestReady: state.player.harvestReady,
      empowered: state.player.empowered,
    },
    timestamp: Date.now(),
  };
}

export function migrateRun(data) {
  if (!data || data.version === SAVE_VERSION) return data;
  return {
    version: SAVE_VERSION,
    wave: data.wave,
    kills: data.kills,
    score: data.score,
    items: (data.items || []).map((i) => (typeof i === "string" ? i : i.id)),
    itemTimers: data.itemTimers || {},
    player: {
      hp: data.playerHp,
      maxHp: data.playerMaxHp,
      mana: data.playerMana,
      maxMana: data.playerMaxMana,
    },
    timestamp: data.timestamp,
  };
}

export function saveRun() {
  saveMeta();
  write(RUN_KEY, serializeRun());
}

// Chame loadMeta() antes: ela também lê os fragmentos de saves da versão 1
export function loadRun() {
  let data = read(RUN_KEY);
  if (!data) {
    data = read(LEGACY_RUN_KEY);
    if (data) {
      data = migrateRun(data);
      write(RUN_KEY, data);
      remove(LEGACY_RUN_KEY);
    }
  }
  if (!data) return false;
  data = migrateRun(data);

  state.wave = data.wave || 1;
  state.kills = data.kills || 0;
  state.score = data.score || 0;
  // Itens que saíram do jogo (ex.: Tomo Ancestral) são descartados, junto com nível e recarga
  state.items = (data.items || []).map(findItem).filter(Boolean);
  const owned = new Set(state.items.map((i) => i.id));
  const onlyOwned = (obj) =>
    Object.fromEntries(Object.entries(obj || {}).filter(([id]) => owned.has(id)));
  state.itemLevels = onlyOwned(data.itemLevels);
  state.itemTimers = onlyOwned(data.itemTimers);
  state.endless = !!data.endless;
  state.victoryShown = !!data.victoryShown;
  state.rewardsSinceLegendary = data.rewardsSinceLegendary || 0;
  // Saves antigos não têm o dano por item: começa vazio
  state.runStats.totalDamage = data.totalDamage || 0;
  state.runStats.damageByItem = { ...data.damageByItem };
  state.player.hp = data.player?.hp || 100;
  state.player.maxHp = data.player?.maxHp || 100;
  state.player.mana = data.player?.mana || 0;
  state.player.maxMana = data.player?.maxMana || 100;
  state.player.pactBonus = data.player?.pactBonus || 0;
  state.player.counters = { ...data.player?.counters };
  state.player.harvestReady = !!data.player?.harvestReady;
  state.player.empowered = data.player?.empowered || 0;
  return true;
}

export function clearRun() {
  remove(RUN_KEY);
  remove(LEGACY_RUN_KEY);
}

// ─── Progresso permanente ───
// Fragmentos, melhorias compradas e recordes (campos novos são opcionais em saves antigos)
export function saveMeta() {
  write(META_KEY, {
    fragments: state.fragments,
    upgrades: state.meta.upgrades,
    best: state.meta.best,
    bossesBeaten: state.meta.bossesBeaten,
  });
}

export function loadMeta() {
  const meta = read(META_KEY);
  if (meta) {
    state.fragments = meta.fragments || 0;
    state.meta.upgrades = meta.upgrades || {};
    state.meta.best = { wave: 0, score: 0, ...meta.best };
    state.meta.bossesBeaten = meta.bossesBeaten || 0;
    return;
  }
  // Save da versão 1: grava os fragmentos já na chave nova, porque loadRun apaga a antiga
  const legacy = read(LEGACY_RUN_KEY);
  if (legacy) {
    state.fragments = legacy.fragments || 0;
    saveMeta();
  }
}

export function resetAll() {
  clearRun();
  remove(META_KEY);
}

// Existe uma run salva para continuar? (sem alterar o estado)
export function hasRun() {
  return !!(read(RUN_KEY) || read(LEGACY_RUN_KEY));
}
