// ═══════════════════════════════════════════
//  TELA DE VITÓRIA (depois do chefe da onda 10)
// ═══════════════════════════════════════════
// CONTRATO — versão provisória; a tela completa vem do agente de chefes.
// Desenha dentro de #victory-modal (index.html); estilos em game/boss.css.

// stats: { wave, kills, score, totalDamage, durationMs, fragments, bossName }
export function showVictory({ stats, onContinue, onEnd }) {
  onContinue();
}

export function hideVictory() {}
