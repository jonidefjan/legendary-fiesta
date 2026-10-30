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
export const LAYERS = {
  default: 0,
  noOutline: 1,
};
