// ═══════════════════════════════════════════
//  LIMITADOR DE CLIQUES (itens míticos)
// ═══════════════════════════════════════════
// Os itens míticos agem a cada clique na arena, até MAX_CLICKS_PER_SECOND por segundo.
// Janela deslizante de 1 s sobre o tempo real (não depende da velocidade do jogo): o
// clique excedente é ignorado. Sem DOM; quem chama passa o relógio (ms).
export const MAX_CLICKS_PER_SECOND = 8;
export const CLICK_WINDOW_MS = 1000;

let stamps = [];

function prune(now) {
  // Um clique sai da janela quando completa 1 s inteiro
  while (stamps.length > 0 && now - stamps[0] >= CLICK_WINDOW_MS) stamps.shift();
}

// Registra o clique e devolve true se ele vale; false se o limite da janela já foi atingido
export function tryClick(now) {
  prune(now);
  if (stamps.length >= MAX_CLICKS_PER_SECOND) return false;
  stamps.push(now);
  return true;
}

// Cliques que valeram no último segundo (o contador da tela)
export function clickRate(now) {
  prune(now);
  return stamps.length;
}

export function resetClicks() {
  stamps = [];
}
