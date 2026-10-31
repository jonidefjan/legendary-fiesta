// ═══════════════════════════════════════════
//  MELHORIAS PERMANENTES (meta-progressão)
// ═══════════════════════════════════════════
// Fragmentos (state.fragments) compram níveis de atributos (state.meta.upgrades).
// A persistência (save.saveMeta) fica por conta de quem chama buyUpgrade.
import { state, PLAYER_BASE } from "./state.js";
import { applyMaxHp } from "./items.js";

export const BASE_COST = 20;
export const COST_GROWTH = 1.25;
export const MAX_COOLDOWN_BONUS = 0.5;

// [{ id, icon, name, desc, perLevel: { maxHp?, damageBonus?, armor?, cooldownBonus? } }]
export const UPGRADES = [
  { id: "vitality", icon: "❤️", name: "Vitalidade", desc: "+10 de vida máxima por nível", perLevel: { maxHp: 10 } },
  { id: "might", icon: "⚔️", name: "Força", desc: "+5% de dano por nível", perLevel: { damageBonus: 0.05 } },
  { id: "guard", icon: "🛡️", name: "Guarda", desc: "+2 de armadura por nível", perLevel: { armor: 2 } },
  { id: "haste", icon: "⏱️", name: "Celeridade", desc: "Recargas 3% mais rápidas por nível", perLevel: { cooldownBonus: 0.03 }, maxLevel: 16 },
];

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

// Texto do efeito de `level` níveis do upgrade, ex.: "+30 vida"
export function describeLevel(id, level = upgradeLevel(id)) {
  const u = find(id);
  if (!u) return "";
  const p = u.perLevel;
  const pct = (v) => `${Math.round(v * 100)}%`;
  if (p.maxHp) return `+${p.maxHp * level} vida`;
  if (p.damageBonus) return `+${pct(p.damageBonus * level)} dano`;
  if (p.armor) return `+${p.armor * level} armadura`;
  if (p.cooldownBonus) {
    const v = Math.min(MAX_COOLDOWN_BONUS, p.cooldownBonus * level);
    return `-${pct(v)} recarga`;
  }
  return "";
}
