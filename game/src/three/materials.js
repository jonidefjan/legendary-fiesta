// ═══════════════════════════════════════════
//  MATERIAIS TOON COMPARTILHADOS
// ═══════════════════════════════════════════
// Contrato usado por cenário e personagens: toonMaterial(cor, opções).
// A assinatura não muda; o renderer pode enriquecer o shader por dentro
// (sombra de nuvens, contorno integrado à luz) sem quebrar quem chama.
import * as THREE from "three";

// Uniforms globais lidos por todos os materiais toon (atualizados pelo renderer)
export const sharedUniforms = {
  uTime: { value: 0 }, // segundos
  uCloudTex: { value: null }, // textura de ruído das nuvens (renderer cria)
  uCloudScale: { value: 0.035 }, // repetição do ruído por unidade de mundo
  uCloudSpeed: { value: new THREE.Vector2(0.5, 0.15) }, // unidades de mundo por segundo
  uCloudStrength: { value: 0.4 }, // 0 = sem sombra de nuvem, 1 = sombra cheia
};

let gradientMap = null;

// Rampa de luz em 3 faixas (sombra, meia-luz, luz), sem interpolação
export function toonGradient() {
  if (!gradientMap) {
    const data = new Uint8Array([70, 150, 255]);
    gradientMap = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.generateMipmaps = false;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

// color: número (0xrrggbb) ou string "#rrggbb", de preferência da paleta (palette.js)
export function toonMaterial(color, options = {}) {
  const {
    emissive = 0x000000,
    map = null,
    transparent = false,
    alphaTest = 0,
    side = THREE.FrontSide,
  } = options;
  return new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: toonGradient(),
    emissive: new THREE.Color(emissive),
    map,
    transparent,
    alphaTest,
    side,
  });
}
