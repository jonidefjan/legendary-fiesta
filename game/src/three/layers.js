// ═══════════════════════════════════════════
//  CAMADAS (THREE.Layers) DO RENDERER
// ═══════════════════════════════════════════
// Contrato com o cenário: objetos que NÃO devem ganhar contorno nem brilho de
// borda (grama em billboard, folhagem, partículas 3D) vão para a camada
// noOutline:  mesh.layers.set(LAYERS.noOutline)
// Eles continuam visíveis e projetam sombra; só ficam fora do buffer de
// normais/profundidade usado pelo pós-processo de contorno.
// Alternativa sem importar este arquivo: mesh.userData.noOutline = true
// (o renderer move o objeto para a camada ao montar o cenário).
// Personagens ficam na camada character: entram na cor, mas o passe de normais os
// desenha à parte, com alfa 0.5 no alvo de normais (fundo e cenário = alfa 1).
// Quem lê normals.a pode usar alfa < 0.75 para saber "é personagem".
export const LAYERS = {
  default: 0,
  noOutline: 1,
  character: 2,
};
