// ═══════════════════════════════════════════
//  MELHORIAS PERMANENTES (meta-progressão)
// ═══════════════════════════════════════════
// Fragmentos (state.fragments) compram níveis de atributos (state.meta.upgrades).
// A persistência (save.saveMeta) fica por conta de quem chama buyUpgrade.
import { state, PLAYER_BASE } from "./state.js";
import { applyMaxHp } from "./items.js";
import { t, formatNumber } from "./i18n.js";

export const BASE_COST = 20;
export const COST_GROWTH = 1.25;
export const MAX_COOLDOWN_BONUS = 0.5;

// [{ id, icon, perLevel: { maxHp?, damageBonus?, armor?, cooldownBonus? } }]
// Nome e descrição ficam nos locales (upgrades.<id>.name|desc); use upgradeName/upgradeDesc
export const UPGRADES = [
  { id: "vitality", icon: "❤️", perLevel: { maxHp: 10 } },
  { id: "might", icon: "⚔️", perLevel: { damageBonus: 0.05 } },
  { id: "guard", icon: "🛡️", perLevel: { armor: 2 } },
  { id: "haste", icon: "⏱️", perLevel: { cooldownBonus: 0.03 }, maxLevel: 16 },
];

export const upgradeName = (id) => t(`upgrades.${id}.name`);
export const upgradeDesc = (id) => t(`upgrades.${id}.desc`);

function find(id) {
  return UPGRADES.find((u) => u.id === id);
}

export function upgradeLevel(id) {
  return state.meta.upgrades[id] || 0;
}

// Celeridade tem teto (MAX_COOLDOWN_BONUS); as outras sobem sem limite
export function isMaxed(id) {
  const u = find(id);
  return !!u?.maxLevel && upgradeLevel(id) >= u.maxLevel;
}

// Custo do próximo nível do upgrade (Infinity no nível máximo)
export function upgradeCost(id) {
  if (!find(id) || isMaxed(id)) return Infinity;
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

// Define (valores absolutos, idempotente) os atributos do jogador a partir das
// melhorias compradas: baseMaxHp (maxHp já com os itens), baseArmor, damageBonus, cooldownBonus
export function applyUpgrades(player = state.player) {
  const total = (key) =>
    UPGRADES.reduce((sum, u) => sum + (u.perLevel[key] || 0) * upgradeLevel(u.id), 0);
  player.baseMaxHp = PLAYER_BASE.maxHp + total("maxHp");
  applyMaxHp(player); // Anel Amaldiçoado reduz o máximo; o HP atual fica limitado a ele
  player.baseArmor = PLAYER_BASE.armor + total("armor");
  player.damageBonus = total("damageBonus");
  player.cooldownBonus = Math.min(MAX_COOLDOWN_BONUS, total("cooldownBonus"));
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
  return "";
}
