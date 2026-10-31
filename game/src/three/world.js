// ═══════════════════════════════════════════
//  COORDENADAS DO MUNDO 3D (contrato entre renderer e cenário)
// ═══════════════════════════════════════════
// Unidades de mundo: 1 unidade ≈ 1 metro; o herói tem ~1,8 de altura.
// Eixos: X = linha de combate (herói à esquerda, inimigos chegando pela direita),
// Y = para cima (chão em 0), Z = profundidade (positivo = mais perto da câmera).
// A lógica do jogo continua em pixels da arena; o renderer converte x → X.
export const WORLD = {
  battleWidth: 20, // largura da arena lógica inteira em X, de -10 a 10 (herói em X ≈ -5,6)
  groundY: 0,
  heroHeight: 1.8,
  // Faixa de combate: herói e inimigos andam em Z entre -laneHalfDepth e +laneHalfDepth.
  // O cenário não põe nada que bloqueie a visão ou o caminho aqui (só grama baixa).
  laneHalfDepth: 2.5,
  // Limites do cenário montado (além disso a câmera não mostra)
  minX: -26,
  maxX: 26,
  // A vista mostra o chão de z≈-17,8 (fundo) a z≈13,5 (frente) numa arena quadrada
  // (meia altura 9, o máximo no celular em pé); abaixo de 1:1 só desce até ~17,5.
  // Por isso o cenário vai além: nenhuma faixa vazia em nenhuma proporção de tela.
  backZ: -20, // fundo: ruínas grandes, árvores, morro (planalto liso depois de -18)
  frontZ: 18, // frente: borda do chão, grama, pedras baixas
};

// Altura do quadro em "pixels de arte"; a largura segue a proporção da arena
export const LOW_RES_HEIGHT = 240;

// Câmera ortográfica em diorama 3/4: inclinação para baixo e altura da vista em unidades
export const CAMERA = {
  pitchDeg: 35,
  viewHeight: 12.5, // quanto do mundo cabe na altura da tela (25% mais aberta que os 10 originais)
  target: { x: 0, y: 0.8, z: -1 }, // ponto que fica no centro da tela
};

const COT_PITCH = 1 / Math.tan((CAMERA.pitchDeg * Math.PI) / 180);

// Um personagem em (x, z), com essa altura, pode aparecer no reflexo da água
// (rect = { minX, maxX, minZ, maxZ, y })? A câmera não gira em Y, então o reflexo fica
// no mesmo X; no plano da água, um ponto a h acima dele aparece h·cot(inclinação) mais
// perto da câmera em Z. Folga generosa (braços, armas, chefes): uma altura em X e meia
// altura a mais em cima. Na dúvida responde sim (só serve para pular desenho).
export function reflectsInWater(x, z, height, rect) {
  if (x + height < rect.minX || x - height > rect.maxX) return false;
  const reachZ = (WORLD.groundY - rect.y + height * 1.5) * COT_PITCH;
  return z + reachZ >= rect.minZ && z - height <= rect.maxZ;
}
