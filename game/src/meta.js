// ═══════════════════════════════════════════
//  MELHORIAS PERMANENTES (meta-progressão)
// ═══════════════════════════════════════════
// Fragmentos (state.fragments) compram níveis de atributos (state.meta.upgrades).
// A persistência (save.saveMeta) fica por conta de quem chama buyUpgrade.
import { state, PLAYER_BASE } from "./state.js";
import { applyMaxHp, pityScreens } from "./items.js";
import { t, formatNumber } from "./i18n.js";

export const BASE_COST = 20;
export const COST_GROWTH = 1.25;
export const MAX_COOLDOWN_BONUS = 0.5;

// Opções de recompensa: 3, e 4 com Mais uma opção
export const BASE_REWARD_OPTIONS = 3;

// [{ id, icon, perLevel, maxLevel?, costs? }]
// perLevel: { maxHp?, damageBonus?, armor?, cooldownBonus?, critChance?, extraOptions?,
//             rerolls?, pityReduction? }. costs: custo de cada nível (sem isso, a curva
// BASE_COST × COST_GROWTH^nível). Nome e descrição ficam nos locales
// (upgrades.<id>.name|desc); use upgradeName/upgradeDesc
export const UPGRADES = [
  { id: "vitality", icon: "❤️", perLevel: { maxHp: 10 } },
  { id: "might", icon: "⚔️", perLevel: { damageBonus: 0.05 } },
  { id: "guard", icon: "🛡️", perLevel: { armor: 5 } },
  { id: "haste", icon: "⏱️", perLevel: { cooldownBonus: 0.03 }, maxLevel: 16 },
  { id: "precision", icon: "🎯", perLevel: { critChance: 0.01 }, maxLevel: 15 },
  { id: "extraOption", icon: "🃏", perLevel: { extraOptions: 1 }, maxLevel: 1, costs: [400] },
  { id: "reroll", icon: "🔄", perLevel: { rerolls: 1 }, maxLevel: 3, costs: [100, 250, 500] },
  { id: "luck", icon: "🍀", perLevel: { pityReduction: 1 }, maxLevel: 2, costs: [200, 600] },
];

// Itens míticos: compra única na loja do menu (não são melhorias com nível)
export const MYTHIC_COST = 100;
export const MYTHIC_IDS = ["elemental_click", "seismic_finger"];

export function isMythicUnlocked(id) {
  return (state.meta.unlockedItems || []).includes(id);
}

// Gasta os fragmentos e libera o item; devolve true se comprou
export function unlockMythic(id) {
  if (!MYTHIC_IDS.includes(id) || isMythicUnlocked(id) || state.fragments < MYTHIC_COST) return false;
  state.fragments -= MYTHIC_COST;
  (state.meta.unlockedItems ||= []).push(id);
  return true;
}

export const upgradeName = (id) => t(`upgrades.${id}.name`);
export const upgradeDesc = (id) => t(`upgrades.${id}.desc`);

function find(id) {
  return UPGRADES.find((u) => u.id === id);
}

export function upgradeLevel(id) {
  return state.meta.upgrades[id] || 0;
}

// Melhorias com nível máximo (Celeridade, Precisão e as de recompensa) param nele
export function isMaxed(id) {
  const u = find(id);
  return !!u?.maxLevel && upgradeLevel(id) >= u.maxLevel;
}

// Custo do próximo nível do upgrade (Infinity no nível máximo)
export function upgradeCost(id) {
  const u = find(id);
  if (!u || isMaxed(id)) return Infinity;
  if (u.costs) return u.costs[upgradeLevel(id)] ?? Infinity;
  return Math.round(BASE_COST * Math.pow(COST_GROWTH, upgradeLevel(id)));
}

// Gasta fragmentos e sobe um nível; devolve true se comprou
export function buyUpgrade(id) {
  if (!find(id) || isMaxed(id)) return false;
  const cost = upgradeCost(id);
  if (state.fragments < cost) return false;
  state.fragments -= cost;
  state.meta.upgrades[id] = upgradeLevel(id) + 1;
  return true;
}

function totalOf(key) {
  return UPGRADES.reduce((sum, u) => sum + (u.perLevel[key] || 0) * upgradeLevel(u.id), 0);
}

// Quantas opções a tela de recompensa mostra
export function rewardOptionCount() {
  return BASE_REWARD_OPTIONS + totalOf("extraOptions");
}

// Rerrolagens de recompensa no começo de cada run
export function rerollsPerRun() {
  return totalOf("rerolls");
}

// Define (valores absolutos, idempotente) os atributos do jogador a partir das
// melhorias compradas: baseMaxHp (maxHp já com os itens), baseArmor, damageBonus,
// cooldownBonus, critBonus (applyPassives soma ao crítico base)
export function applyUpgrades(player = state.player) {
  player.baseMaxHp = PLAYER_BASE.maxHp + totalOf("maxHp");
  applyMaxHp(player); // Anel Amaldiçoado reduz o máximo; o HP atual fica limitado a ele
  player.baseArmor = PLAYER_BASE.armor + totalOf("armor");
  player.damageBonus = totalOf("damageBonus");
  player.cooldownBonus = Math.min(MAX_COOLDOWN_BONUS, totalOf("cooldownBonus"));
  player.critBonus = totalOf("critChance");
}

// Texto do efeito de `level` níveis do upgrade, ex.: "+30 vida" (no idioma atual)
export function describeLevel(id, level = upgradeLevel(id)) {
  const u = find(id);
  if (!u) return "";
  const p = u.perLevel;
  const pct = (v) => formatNumber(Math.round(v * 100));
  if (p.maxHp) return t("upgrades.effect.maxHp", { n: p.maxHp * level });
  if (p.damageBonus) return t("upgrades.effect.damage", { n: pct(p.damageBonus * level) });
  if (p.armor) return t("upgrades.effect.armor", { n: p.armor * level });
  if (p.cooldownBonus) {
    const v = Math.min(MAX_COOLDOWN_BONUS, p.cooldownBonus * level);
    return t("upgrades.effect.cooldown", { n: pct(v) });
  }
  if (p.critChance) return t("upgrades.effect.crit", { n: pct(p.critChance * level) });
  if (p.extraOptions) return t("upgrades.effect.options", { n: BASE_REWARD_OPTIONS + p.extraOptions * level });
  if (p.rerolls) return t("upgrades.effect.rerolls", { n: p.rerolls * level });
  if (p.pityReduction) return t("upgrades.effect.luck", { n: pityScreens(level, false) });
  return "";
}
