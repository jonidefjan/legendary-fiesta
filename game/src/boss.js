// ═══════════════════════════════════════════
//  CHEFES (Lich e Senhor Demônio)
// ═══════════════════════════════════════════
// CONTRATO — versão provisória; a implementação completa vem do agente de chefes.
import { createWave } from "./waves.js";

// Onda de chefe a cada 10 (10, 20, 30... no modo infinito)
export const BOSS_EVERY = 10;

export function isBossWave(wave) {
  return wave > 0 && wave % BOSS_EVERY === 0;
}

// Inimigos da onda de chefe (chefe sorteado + escolta), mesmo formato de createWave
export function createBossWave(wave, arena) {
  return createWave(wave, arena);
}

// Habilidades dos chefes vivos (invocar, área de fogo...); dt em ms de jogo
export function updateBosses(dt) {}
