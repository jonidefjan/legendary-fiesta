// ═══════════════════════════════════════════
//  TELA INICIAL (Jogar, Continuar, Melhorias, recorde)
// ═══════════════════════════════════════════
// CONTRATO — versão provisória; a tela completa vem do agente de melhorias.
// Desenha dentro de #title-screen (index.html); estilos em game/title.css.

// canContinue: existe run salva. onContinue/onNewRun: escolhas do jogador.
export function showTitle({ canContinue, onContinue, onNewRun }) {
  if (canContinue) onContinue();
  else onNewRun();
}

export function hideTitle() {}
