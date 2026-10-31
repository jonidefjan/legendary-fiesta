// ═══════════════════════════════════════════
//  MELHORIAS PERMANENTES (meta-progressão)
// ═══════════════════════════════════════════
// CONTRATO — versão provisória; a implementação completa vem do agente de melhorias.
// Fragmentos (state.fragments) compram níveis de atributos (state.meta.upgrades).
import { state, PLAYER_BASE } from "./state.js";

// [{ id, icon, name, desc, perLevel: { maxHp?, damageBonus?, armor?, cooldownBonus? } }]
export const UPGRADES = [];

export function upgradeLevel(id) {
  return state.meta.upgrades[id] || 0;
}

// Custo do próximo nível do upgrade
export function upgradeCost(id) {
  return Infinity;
}

// Gasta fragmentos e sobe um nível; devolve true se comprou
export function buyUpgrade(id) {
  return false;
}

// Define (valores absolutos, idempotente) os atributos do jogador a partir das
// melhorias compradas: maxHp, baseArmor, damageBonus, cooldownBonus
export function applyUpgrades(player = state.player) {
  player.maxHp = PLAYER_BASE.maxHp;
  player.baseArmor = PLAYER_BASE.armor;
  player.damageBonus = 0;
  player.cooldownBonus = 0;
}
