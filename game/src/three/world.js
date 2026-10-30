// ═══════════════════════════════════════════
//  COORDENADAS DO MUNDO 3D (contrato entre renderer e cenário)
// ═══════════════════════════════════════════
// Unidades de mundo: 1 unidade ≈ 1 metro; o herói tem ~1,8 de altura.
// Eixos: X = linha de combate (herói à esquerda, inimigos chegando pela direita),
// Y = para cima (chão em 0), Z = profundidade (positivo = mais perto da câmera).
// A lógica do jogo continua em pixels da arena; o renderer converte x → X.
export const WORLD = {
  battleWidth: 32, // largura da arena lógica inteira em X, de -16 a 16
  groundY: 0,
  heroHeight: 1.8,
  // Faixa de combate: herói e inimigos andam em Z entre -laneHalfDepth e +laneHalfDepth.
  // O cenário não põe nada que bloqueie a visão ou o caminho aqui (só grama baixa).
  laneHalfDepth: 2.5,
  // Limites do cenário montado (além disso a câmera não mostra)
  minX: -26,
  maxX: 26,
  backZ: -18, // fundo: ruínas grandes, árvores, morro
  frontZ: 9, // frente: borda do chão, grama, pedras baixas
};

// Altura do quadro em "pixels de arte"; a largura segue a proporção da arena
export const LOW_RES_HEIGHT = 240;

// Câmera ortográfica em diorama 3/4: inclinação para baixo e altura da vista em unidades
export const CAMERA = {
  pitchDeg: 35,
  viewHeight: 16, // quanto do mundo cabe na altura da tela
  target: { x: 0, y: 0.8, z: -1.5 }, // ponto que fica no centro da tela
};
