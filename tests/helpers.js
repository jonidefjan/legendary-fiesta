// Utilidades dos testes: catálogo real do items.json, runs prontas e eventos capturados
import { readFileSync } from "node:fs";
import { state, resetRun, PLAYER_BASE } from "../game/src/state.js";
import {
  setItems,
  findItem,
  applyPassives,
  ensureTimers,
} from "../game/src/items.js";
import { setRandom } from "../game/src/random.js";
import { on, clearListeners } from "../game/src/events.js";

// Os 5% de crítico base deixariam os testes de dano aleatórios: aqui começa em 0.
// Testes de crítico definem state.player.critChance (ou usam REAL_CRIT_CHANCE).
export const REAL_CRIT_CHANCE = PLAYER_BASE.critChance;
PLAYER_BASE.critChance = 0;

export const ITEMS = JSON.parse(
  readFileSync(new URL("../game/assets/items.json", import.meta.url), "utf8"),
);
setItems(ITEMS);

export function item(id) {
  const found = findItem(id);
  if (!found) throw new Error(`item ${id} não existe no items.json`);
  return found;
}

export function enemy(overrides = {}) {
  return {
    name: "Alvo",
    hp: 1000,
    maxHp: 1000,
    dmg: 10,
    x: 200,
    y: 300,
    resist: {},
    dots: [],
    dead: false,
    moving: false,
    atkTimer: 0,
    atkInterval: 2000,
    xp: 10,
    gold: 5,
    fragments: 2,
    ...overrides,
  };
}

// Run nova com estes itens (recargas prontas) e inimigos; aleatoriedade real
export function setupRun(itemIds = [], enemies = [enemy()]) {
  resetRun({ x: 100, y: 300 });
  clearListeners();
  setRandom(null);
  state.items = itemIds.map(item);
  applyPassives();
  ensureTimers();
  state.enemies = enemies;
  state.isPaused = false;
  return state;
}

export function fixedRandom(value) {
  setRandom(() => value);
}

export function captureEvents() {
  const events = [];
  for (const type of ["log", "sfx", "itemUsed", "playerDied"]) {
    on(type, (payload) => events.push({ type, payload }));
  }
  return events;
}

export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}
