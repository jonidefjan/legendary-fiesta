// ═══════════════════════════════════════════
//  ITEM DATABASE
// ═══════════════════════════════════════════
// Os itens vêm de assets/items.json. O que cada um faz está na lista "effects"
// (gatilho + tipo + parâmetros); combat.js tem uma função para cada tipo.
import { state, PLAYER_BASE } from "./state.js";
import { random } from "./random.js";
import { emit } from "./events.js";
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

// Forma evoluída: a raridade acompanha o nível (marcos), então vira getter. O JSON guarda a
// raridade ao evoluir (incomum); quem lê item.rarity sempre pega a atual.
export const EVOLVED_RARITY_STEPS = [
  [20, "legendary"],
  [15, "epic"],
  [10, "rare"],
  [0, "uncommon"],
];

export function evolvedRarity(level) {
  return EVOLVED_RARITY_STEPS.find(([from]) => level >= from)[1];
}

export function setItems(list) {
  catalog = list;
  for (const item of catalog) {
    if (!item.evolvedFrom) continue;
    Object.defineProperty(item, "rarity", {
      get: () => evolvedRarity(itemLevel(item.id)),
      configurable: true,
      enumerable: true,
    });
  }
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
    item.enchantExtra = hasKey(`items.${item.id}.enchantExtra`)
      ? t(`items.${item.id}.enchantExtra`)
      : null;
  }
}

// Encantamentos do item em ordem, com o nível em que cada um libera: o texto base vale
// do nível `enchantLevel` (padrão 1) e o extra do `enchantExtraLevel` (padrão 5).
// level: nível a avaliar (o das cartas de recompensa é o nível que o item terá).
export function enchantTiers(item, level = itemLevel(item.id)) {
  const tiers = [];
  if (item.enchant) tiers.push({ text: item.enchant, minLevel: item.enchantLevel ?? 1 });
  if (item.enchantExtra) tiers.push({ text: item.enchantExtra, minLevel: item.enchantExtraLevel ?? 5 });
  return tiers.map((tier) => ({ ...tier, unlocked: level >= tier.minLevel }));
}

export function getItems() {
  return catalog;
}

export function findItem(id) {
  return catalog.find((i) => i.id === id) || null;
}

// ─── Efeitos ───
// Efeito com "minLevel" (encantamentos de nível 3 e 5) só vale depois de o item chegar lá
export function effectsOf(item, trigger) {
  const level = itemLevel(item.id);
  return (item.effects || []).filter((e) => e.trigger === trigger && (e.minLevel ?? 1) <= level);
}

// Efeito com "every" se repete a cada N níveis depois do minLevel (marcos das formas
// evoluídas, que sobem sem limite): nível 20 e every 10 conta 1 em 20..29, 2 em 30..39...
export function effectCount(item, effect) {
  if (!effect.every) return 1;
  return 1 + Math.floor((itemLevel(item.id) - (effect.minLevel ?? 1)) / effect.every);
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
// Pegar um item que já tem sobe o nível dele. Regra por item: o JSON declara o que cresce
// ("damage" + "damagePerLevel", ou perLevel: { damage: 3 }) e, quando um valor muda de
// vez num nível, "<chave>At": { "5": valor }. Sem declaração o valor é fixo.
// No nível máximo o item sai do sorteio; as formas evoluídas não têm máximo.
export const MAX_ITEM_LEVEL = 5;

// Itens cujo efeito não cresce (ex.: Pena de Fênix revive uma vez) declaram maxLevel no JSON
export function maxLevelOf(item) {
  if (item.evolvedFrom) return Infinity;
  return item.maxLevel ?? MAX_ITEM_LEVEL;
}

export function itemLevel(id) {
  return state.itemLevels[id] || 1;
}

// Crescimento por nível declarado em `obj` (item ou efeito) para `key`; null se não declara
export function perLevelOf(obj, key) {
  const v = obj.perLevel?.[key] ?? obj[`${key}PerLevel`];
  return typeof v === "number" ? v : null;
}

// Valor que muda de vez a partir de um nível ("<chave>At": { "3": 0.6, "5": 1 }): o do
// maior nível já alcançado; undefined se o item ainda não chegou em nenhum
export function stepOf(obj, key, level) {
  const steps = obj[`${key}At`];
  if (!steps) return undefined;
  const reached = Object.keys(steps)
    .map(Number)
    .filter((from) => from <= level)
    .sort((a, b) => b - a)[0];
  return reached == null ? undefined : steps[reached];
}

// Valor de `key` no nível do item: o degrau alcançado ("At") ou base + crescimento × (nível - 1)
export function levelValue(item, obj, key, base = obj[key] ?? 0) {
  const level = itemLevel(item.id);
  const step = stepOf(obj, key, level);
  if (step !== undefined) return step;
  const per = perLevelOf(obj, key);
  return per != null ? base + per * (level - 1) : base;
}

// Recarga com o nível do item ("cooldownPerLevel", em ms e negativo, no item) e o bônus
// permanente de velocidade
export function effectiveCooldown(item) {
  const per = perLevelOf(item, "cooldown") ?? 0;
  const levelCooldown = item.cooldown + per * (itemLevel(item.id) - 1);
  // Auras de ritmo fixo (Armadura Cristalina, Escama) não aceleram com a melhoria Pressa
  const metaFactor = item.fixedRate ? 1 : 1 - (state.player.cooldownBonus || 0);
  return Math.max(100, Math.round(levelCooldown * metaFactor));
}

// Adiciona o item ou, se já existe, sobe o nível. Devolve { leveled, level, evolvedTo }.
export function addItemOrLevel(item) {
  if (state.items.some((i) => i.id === item.id)) {
    const level = Math.min(maxLevelOf(item), itemLevel(item.id) + 1);
    state.itemLevels[item.id] = level;
    if (state.evolveKills[item.id]) state.evolveKills[item.id] = 0; // nível novo, meta nova
    const into = evolutionTarget(item, level);
    if (into) {
      evolveItem(item, into);
      return { leveled: true, level, evolvedTo: into.id };
    }
    applyPassives();
    ensureTimers();
    return { leveled: true, level };
  }
  state.items.push(item);
  state.itemLevels[item.id] = 1;
  ensureTimers();
  return { leveled: false, level: 1 };
}

// ─── Evolução dos itens comuns ───
// O item com `evolution: { into, level }` vira outro (`evolvedFrom` no JSON) ao chegar no
// nível. A forma evoluída continua subindo sem limite, por recompensa e por abates.
// Abates para o próximo nível: 20 e ×1,5 a cada nível (20, 30, 45, 68...).
export const EVOLVE_KILLS_BASE = 20;
export const EVOLVE_KILLS_GROWTH = 1.5;

// A forma evoluída que o item vira neste nível (ou null)
function evolutionTarget(item, level) {
  if (!item.evolution || level < item.evolution.level) return null;
  return findItem(item.evolution.into);
}

// Troca o item pela forma evoluída, no mesmo lugar, levando nível e recarga
function evolveItem(item, into) {
  const index = state.items.findIndex((i) => i.id === item.id);
  state.items[index] = into;
  state.itemLevels[into.id] = state.itemLevels[item.id];
  delete state.itemLevels[item.id];
  if (state.itemTimers[item.id]) {
    state.itemTimers[into.id] = state.itemTimers[item.id];
    delete state.itemTimers[item.id];
  }
  state.evolveKills[into.id] = 0;
  // Estatísticas e "último item ativado" passam para o id novo
  for (const bag of [state.runStats.damageByItem, state.runStats.itemUses]) {
    if (bag?.[item.id] != null) {
      bag[into.id] = (bag[into.id] || 0) + bag[item.id];
      delete bag[item.id];
    }
  }
  if (state.player.lastActivated === item.id) state.player.lastActivated = into.id;
  applyPassives();
  ensureTimers();
  emit("evolved", { from: item.id, to: into.id });
}

// Save antigo (de antes da evolução) pode ter o item base já no nível da evolução
export function migrateEvolutions() {
  for (const item of [...state.items]) {
    const into = evolutionTarget(item, itemLevel(item.id));
    if (into) evolveItem(item, into);
  }
}

// Abates necessários para sair deste nível (`from`: nível em que a forma nasceu)
export function killsForNextLevel(level, from = 5) {
  return Math.round(EVOLVE_KILLS_BASE * EVOLVE_KILLS_GROWTH ** Math.max(0, level - from));
}

// Progresso da forma evoluída: { kills, need }; null para os outros itens
export function evolutionProgress(item) {
  if (!item.evolvedFrom) return null;
  const from = findItem(item.evolvedFrom)?.evolution?.level;
  return {
    kills: state.evolveKills[item.id] || 0,
    need: killsForNextLevel(itemLevel(item.id), from),
  };
}

// Sobe um nível sem passar pela recompensa (abates)
export function levelUpItem(item) {
  const level = itemLevel(item.id) + 1;
  state.itemLevels[item.id] = level;
  state.evolveKills[item.id] = 0;
  applyPassives();
  ensureTimers();
  emit("itemLeveled", { id: item.id, level });
}

// Chamada a cada abate: as formas evoluídas ganham 1 de progresso e sobem ao chegar na meta
export function addEvolutionKill() {
  for (const item of [...state.items]) {
    const progress = evolutionProgress(item);
    if (!progress) continue;
    state.evolveKills[item.id] = progress.kills + 1;
    if (progress.kills + 1 >= progress.need) levelUpItem(item);
  }
}

// Esquiva não passa disso, por mais itens e níveis que existam
export const MAX_EVASION = 0.4;

// Vida máxima = base (meta.applyUpgrades) × (1 + penalidades dos itens). Idempotente:
// sempre parte de baseMaxHp, e a vida atual nunca passa do novo máximo.
export function applyMaxHp(p = state.player) {
  const mult = ownedEffects("passive").reduce(
    (sum, { item, effect }) =>
      effect.type === "stats" ? sum + levelValue(item, effect, "maxHpMult", effect.maxHpMult || 0) : sum,
    1,
  );
  // maxHpBonus: vida máxima ganha na run (Foice de Sangue)
  const base = (p.baseMaxHp ?? PLAYER_BASE.maxHp) + (p.maxHpBonus || 0);
  p.maxHp = Math.max(1, Math.round(base * mult));
  p.hp = Math.min(p.hp, p.maxHp);
}

// Recalcula os atributos vindos de efeitos passivos ("stats")
export function applyPassives() {
  const p = state.player;
  p.armor = p.baseArmor ?? PLAYER_BASE.armor;
  p.critChance = PLAYER_BASE.critChance + (p.critBonus || 0); // Precisão (loja)
  p.critMult = PLAYER_BASE.critMult;
  p.evasion = 0;
  p.weaponSpeed = 0;
  p.damageBoost = 0;
  p.elementalBoost = 0; // Manto do Arcano: dano extra das armas elementais
  p.extraStacks = 0; // Manto do Arcano N3: +1 stack nos efeitos elementais
  p.reach = 0; // Manto do Arcano N5: +1 alcance nos saltos e respingos
  p.regen = 0; // HP por segundo
  p.dotReduction = 0; // fração do dano contínuo recebido que some
  p.damageReduction = 0; // fração do dano recebido que some (depois da armadura)
  for (const { item, effect } of ownedEffects("passive")) {
    if (effect.type !== "stats") continue;
    // Marcos repetidos (every) somam uma vez por repetição
    const v = (key) => levelValue(item, effect, key, effect[key] || 0) * effectCount(item, effect);
    p.armor += Math.round(v("armor"));
    p.critChance += v("critChance");
    p.evasion += v("evasion");
    p.weaponSpeed += v("weaponSpeed");
    p.damageBoost += v("damageBoost");
    p.elementalBoost += v("elementalBoost");
    p.extraStacks += Math.round(v("extraStacks"));
    p.reach += Math.round(v("reach"));
    p.regen += v("regen");
    p.dotReduction += v("dotReduction");
    if (effect.critMult) p.critMult = Math.max(p.critMult, effect.critMult);
    p.damageReduction += v("damageReduction");
  }
  p.dotReduction = Math.min(0.9, p.dotReduction);
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

// Entra no sorteio? A forma evoluída só aparece para quem a tem (como "subir de nível"), e
// o item base some depois de evoluir
function offerable(item) {
  if (item.evolvedFrom) return ownedLevel(item.id) > 0;
  if (item.evolution && ownedLevel(item.evolution.into) > 0) return false;
  return ownedLevel(item.id) < maxLevelOf(item);
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
      offerable(i),
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
// Depois de PITY_SCREENS telas seguidas sem lendário, a próxima garante um; a melhoria
// Sorte lendária encurta isso (1 por nível). Chefe (a cada 10 ondas) também garante.
// rewardsSinceLegendary vai na run salva.
export const PITY_SCREENS = 4;

export function pityScreens(luckLevel = state.meta?.upgrades?.luck || 0) {
  return Math.max(1, PITY_SCREENS - luckLevel);
}

export function rewardOptions(count, { boss = false, exclude = new Set() } = {}) {
  const guaranteeLegendary = boss || state.rewardsSinceLegendary >= pityScreens();
  const options = generateRandomItems(count, exclude, { guaranteeLegendary });
  // Tela sem opções não existe: não conta
  if (options.length > 0) {
    state.rewardsSinceLegendary = options.some((i) => i.rarity === "legendary")
      ? 0
      : state.rewardsSinceLegendary + 1;
  }
  return options;
}

// Tela de recompensa com rerrolagem: reroll() gasta uma das state.rerollsLeft e sorteia de novo
// (devolve null sem rerrolagens). A tela conta uma vez só para o lendário garantido: o
// sorteio novo parte da contagem de antes da primeira.
export function rewardOffer(count, { boss = false } = {}) {
  const pityBefore = state.rewardsSinceLegendary;
  const draw = (exclude = new Set()) => {
    state.rewardsSinceLegendary = pityBefore;
    return rewardOptions(count, { boss, exclude });
  };
  const offer = { options: draw() };
  offer.reroll = () => {
    if (state.rerollsLeft <= 0) return null;
    state.rerollsLeft--;
    // Rerrolar evita as opções atuais; se o sorteio não enche a tela, aceita repetir
    let next = draw(new Set(offer.options.map((i) => i.id)));
    if (next.length < count) next = draw();
    offer.options = next;
    return offer.options;
  };
  return offer;
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
