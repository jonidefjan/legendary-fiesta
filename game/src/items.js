// ═══════════════════════════════════════════
//  ITEM DATABASE
// ═══════════════════════════════════════════
// Os itens vêm de assets/items.json. O que cada um faz está na lista "effects"
// (gatilho + tipo + parâmetros); combat.js tem uma função para cada tipo.
import { state, PLAYER_BASE } from "./state.js";
import { random } from "./random.js";

export const RARITIES = {
  common: { label: "Comum", color: "#888888" },
  uncommon: { label: "Incomum", color: "#4caa6a" },
  rare: { label: "Raro", color: "#4488cc" },
  epic: { label: "Épico", color: "#8844cc" },
  legendary: { label: "Lendário", color: "#c9a84c" },
};

// Itens que ainda não têm efeito no código: ficam fora do sorteio até a fase de itens
export const UNIMPLEMENTED_ITEMS = new Set([
  "crystal_armor",
  "ancient_tome",
  "time_glass",
  "shadow_cloak",
  "vampiric_amulet",
  "speed_boots",
  "lucky_coin",
  "cursed_ring",
]);

// Pesos de raridade no sorteio (maior = mais comum)
const RARITY_WEIGHTS = {
  common: 40,
  uncommon: 30,
  rare: 18,
  epic: 9,
  legendary: 3,
};

let catalog = [];

export function setItems(list) {
  catalog = list;
}

export function getItems() {
  return catalog;
}

export function findItem(id) {
  return catalog.find((i) => i.id === id) || null;
}

// ─── Efeitos ───
export function effectsOf(item, trigger) {
  return (item.effects || []).filter((e) => e.trigger === trigger);
}

// Efeitos de um gatilho em todos os itens do jogador, com o item de origem
export function ownedEffects(trigger) {
  return state.items.flatMap((item) =>
    effectsOf(item, trigger).map((effect) => ({ item, effect })),
  );
}

// Itens com recarga que fazem algo ao ficar prontos: armas e itens com efeito "use"
export function isActivatable(item) {
  return (
    item.cooldown > 0 &&
    (item.type === "weapon" || effectsOf(item, "use").length > 0)
  );
}

// ─── Inventário ───
export function starterItems() {
  const weapons = catalog
    .filter((i) => i.type === "weapon" && i.rarity === "common")
    .slice(0, 1);
  const armors = catalog
    .filter((i) => i.type === "armor" && i.rarity === "common")
    .slice(0, 1);
  return [...weapons, ...armors];
}

// ─── Níveis ───
// Pegar um item que já tem sobe o nível dele: +20% no efeito principal e -5% de
// recarga por nível. No nível máximo ele sai do sorteio.
export const MAX_ITEM_LEVEL = 5;
export const LEVEL_POWER = 0.2;
export const LEVEL_COOLDOWN = 0.05;

export function itemLevel(id) {
  return state.itemLevels[id] || 1;
}

// Multiplicador do efeito principal (dano, cura, barreira, mana, duração...)
export function levelMultiplier(id) {
  return 1 + LEVEL_POWER * (itemLevel(id) - 1);
}

// Recarga com nível do item e bônus permanente de velocidade
export function effectiveCooldown(item) {
  const levelFactor = 1 - LEVEL_COOLDOWN * (itemLevel(item.id) - 1);
  const metaFactor = 1 - (state.player.cooldownBonus || 0);
  return Math.round(item.cooldown * levelFactor * metaFactor);
}

// Adiciona o item ou, se já existe, sobe o nível. Devolve { leveled, level }.
export function addItemOrLevel(item) {
  if (state.items.some((i) => i.id === item.id)) {
    const level = Math.min(MAX_ITEM_LEVEL, itemLevel(item.id) + 1);
    state.itemLevels[item.id] = level;
    ensureTimers();
    return { leveled: true, level };
  }
  state.items.push(item);
  state.itemLevels[item.id] = 1;
  ensureTimers();
  return { leveled: false, level: 1 };
}

// Recalcula os atributos vindos de efeitos passivos ("stats")
export function applyPassives() {
  const p = state.player;
  p.armor = p.baseArmor ?? PLAYER_BASE.armor;
  p.maxMana = PLAYER_BASE.maxMana;
  p.magicBoost = PLAYER_BASE.magicBoost;
  for (const { item, effect } of ownedEffects("passive")) {
    if (effect.type !== "stats") continue;
    const k = levelMultiplier(item.id);
    p.armor += Math.round((effect.armor || 0) * k);
    p.maxMana += Math.round((effect.maxMana || 0) * k);
    p.magicBoost += (effect.magicBoost || 0) * k;
  }
}

// Itens novos começam com a recarga pronta; os existentes acompanham nível e melhorias
export function ensureTimers() {
  for (const item of state.items) {
    if (item.cooldown <= 0) continue;
    const cooldown = effectiveCooldown(item);
    const timer = state.itemTimers[item.id];
    if (timer) {
      timer.cooldown = cooldown;
    } else {
      state.itemTimers[item.id] = { elapsed: cooldown, cooldown };
    }
  }
}

// ─── Sorteio ───
// excludeIds: itens que não podem aparecer; type: só um tipo (ex.: "weapon").
// Itens no nível máximo nunca aparecem.
export function generateRandomItems(count, excludeIds = new Set(), { type } = {}) {
  const pool = catalog.filter(
    (i) =>
      !UNIMPLEMENTED_ITEMS.has(i.id) &&
      !excludeIds.has(i.id) &&
      (!type || i.type === type) &&
      itemLevel(i.id) < MAX_ITEM_LEVEL,
  );
  const selectedItems = [];
  const usedIds = new Set();

  for (let i = 0; i < count; i++) {
    let item = null;
    let attempts = 0;

    // Tentar até 20 vezes para encontrar um item não repetido
    while (!item && attempts < 20) {
      const rarity = getWeightedRarity(RARITY_WEIGHTS);
      const itemsOfRarity = pool.filter((i) => i.rarity === rarity);

      if (itemsOfRarity.length > 0) {
        const randomItem =
          itemsOfRarity[Math.floor(random() * itemsOfRarity.length)];

        if (!usedIds.has(randomItem.id)) {
          item = randomItem;
          usedIds.add(randomItem.id);
        }
      }

      attempts++;
    }

    // Se não encontrou, pegar qualquer item aleatório
    if (!item) {
      const remainingItems = pool.filter((i) => !usedIds.has(i.id));
      if (remainingItems.length > 0) {
        item = remainingItems[Math.floor(random() * remainingItems.length)];
        usedIds.add(item.id);
      }
    }

    if (item) {
      selectedItems.push(item);
    }
  }

  return selectedItems;
}

export function getWeightedRarity(weights) {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = random() * totalWeight;

  for (const [rarity, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) {
      return rarity;
    }
  }

  return "common"; // Fallback
}

export function getTypeLabel(type) {
  const labels = {
    weapon: "Arma",
    armor: "Armadura",
    relic: "Relíquia",
  };
  return labels[type] || type;
}
