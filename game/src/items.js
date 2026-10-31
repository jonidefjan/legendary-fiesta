// ═══════════════════════════════════════════
//  ITEM DATABASE
// ═══════════════════════════════════════════
// Os itens vêm de assets/items.json. O que cada um faz está na lista "effects"
// (gatilho + tipo + parâmetros); combat.js tem uma função para cada tipo.
import { state, PLAYER_BASE } from "./state.js";
import { random } from "./random.js";
import { t, hasKey } from "./i18n.js";

// O rótulo vem do idioma atual (getter), então quem lê RARITIES[r].label sempre
// pega o texto certo, mesmo depois de trocar de idioma no meio da run
const rarity = (id, color) => ({
  get label() {
    return t(`rarity.${id}`);
  },
  color,
});

export const RARITIES = {
  common: rarity("common", "#888888"),
  uncommon: rarity("uncommon", "#4caa6a"),
  rare: rarity("rare", "#4488cc"),
  epic: rarity("epic", "#8844cc"),
  legendary: rarity("legendary", "#c9a84c"),
};

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
  localizeItems();
}

// Escreve nome, descrição, efeito e encantamento do idioma atual em cada item do
// catálogo. state.items guarda os mesmos objetos, então o inventário troca junto.
export function localizeItems() {
  for (const item of catalog) {
    item.name = t(`items.${item.id}.name`);
    item.desc = t(`items.${item.id}.desc`);
    item.effect = t(`items.${item.id}.effect`);
    item.enchant = hasKey(`items.${item.id}.enchant`) ? t(`items.${item.id}.enchant`) : null;
  }
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

// Itens cujo efeito não cresce (ex.: Pena de Fênix revive uma vez) declaram maxLevel no JSON
export function maxLevelOf(item) {
  return item.maxLevel ?? MAX_ITEM_LEVEL;
}

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
    const level = Math.min(maxLevelOf(item), itemLevel(item.id) + 1);
    state.itemLevels[item.id] = level;
    ensureTimers();
    return { leveled: true, level };
  }
  state.items.push(item);
  state.itemLevels[item.id] = 1;
  ensureTimers();
  return { leveled: false, level: 1 };
}

// Evasão não passa disso, por mais itens e níveis que existam
export const MAX_EVASION = 0.5;

// Vida máxima = base (meta.applyUpgrades) × (1 + penalidades dos itens). Idempotente:
// sempre parte de baseMaxHp, e a vida atual nunca passa do novo máximo.
export function applyMaxHp(p = state.player) {
  const mult = ownedEffects("passive").reduce(
    (sum, { effect }) => (effect.type === "stats" ? sum + (effect.maxHpMult || 0) : sum),
    1,
  );
  p.maxHp = Math.max(1, Math.round((p.baseMaxHp ?? PLAYER_BASE.maxHp) * mult));
  p.hp = Math.min(p.hp, p.maxHp);
}

// Recalcula os atributos vindos de efeitos passivos ("stats")
export function applyPassives() {
  const p = state.player;
  p.armor = p.baseArmor ?? PLAYER_BASE.armor;
  p.maxMana = PLAYER_BASE.maxMana;
  p.magicBoost = PLAYER_BASE.magicBoost;
  p.critChance = PLAYER_BASE.critChance;
  p.evasion = 0;
  p.weaponSpeed = 0;
  p.damageBoost = 0;
  for (const { item, effect } of ownedEffects("passive")) {
    if (effect.type !== "stats") continue;
    const k = levelMultiplier(item.id);
    p.armor += Math.round((effect.armor || 0) * k);
    p.maxMana += Math.round((effect.maxMana || 0) * k);
    p.magicBoost += (effect.magicBoost || 0) * k;
    p.critChance += (effect.critChance || 0) * k;
    p.evasion += (effect.evasion || 0) * k;
    p.weaponSpeed += (effect.weaponSpeed || 0) * k;
    p.damageBoost += (effect.damageBoost || 0) * k;
  }
  p.critChance = Math.min(1, p.critChance);
  p.evasion = Math.min(MAX_EVASION, p.evasion);
  applyMaxHp(p);
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

// Nível de um item que o jogador já tem (0 se não tem). Save migrado pode ter o
// item sem entrada em itemLevels: conta como nível 1.
function ownedLevel(id) {
  if (state.itemLevels[id]) return state.itemLevels[id];
  return state.items.some((i) => i.id === id) ? 1 : 0;
}

// ─── Sorteio ───
// excludeIds: itens que não podem aparecer; type: só um tipo (ex.: "weapon").
// Itens no nível máximo nunca aparecem (os que o jogador ainda não tem sempre podem).
// guaranteeLegendary: pelo menos 1 lendário entre as opções, se ainda houver algum
// sorteável; sem nenhum, o sorteio segue normal (sem aviso).
export function generateRandomItems(
  count,
  excludeIds = new Set(),
  { type, guaranteeLegendary = false } = {},
) {
  const pool = catalog.filter(
    (i) =>
      !excludeIds.has(i.id) &&
      (!type || i.type === type) &&
      ownedLevel(i.id) < maxLevelOf(i),
  );
  const selectedItems = [];
  const usedIds = new Set();

  // O lendário garantido sai primeiro e depois troca de lugar com uma opção sorteada,
  // para não ficar sempre na primeira posição
  let guaranteed = null;
  const legendaries = pool.filter((i) => i.rarity === "legendary");
  if (guaranteeLegendary && count > 0 && legendaries.length > 0) {
    guaranteed = legendaries[Math.floor(random() * legendaries.length)];
    usedIds.add(guaranteed.id);
    selectedItems.push(guaranteed);
  }

  for (let i = selectedItems.length; i < count; i++) {
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

  if (guaranteed && selectedItems.length > 1) {
    const j = Math.floor(random() * selectedItems.length);
    [selectedItems[0], selectedItems[j]] = [selectedItems[j], selectedItems[0]];
  }
  return selectedItems;
}

// ─── Recompensa: lendário garantido ───
// Depois de PITY_SCREENS telas seguidas sem lendário, a próxima garante um.
// Chefe (a cada 10 ondas) também garante. rewardsSinceLegendary vai na run salva.
export const PITY_SCREENS = 4;

export function rewardOptions(count, { boss = false } = {}) {
  const guaranteeLegendary = boss || state.rewardsSinceLegendary >= PITY_SCREENS;
  const options = generateRandomItems(count, new Set(), { guaranteeLegendary });
  // Tela sem opções não existe: não conta
  if (options.length > 0) {
    state.rewardsSinceLegendary = options.some((i) => i.rarity === "legendary")
      ? 0
      : state.rewardsSinceLegendary + 1;
  }
  return options;
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
  return hasKey(`type.${type}`) ? t(`type.${type}`) : type;
}
