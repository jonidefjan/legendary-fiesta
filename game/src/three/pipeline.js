// ═══════════════════════════════════════════
//  PIPELINE DE PIXEL ART 3D
// ═══════════════════════════════════════════
// 1. cena    -> alvo baixa resolução (cor HalfFloat + profundidade), camadas 0 e noOutline
// 2. normais -> alvo baixa resolução (normal de vista + profundidade), só camada 0,
//               com MeshNormalMaterial no lugar de todos (malhas com esqueleto deformam)
// 3. contorno + brilho de borda -> alvo "post" baixa resolução
// 4. passes extras (água, god rays...) recebem a textura anterior e devolvem outra
// 5. ampliação para o canvas visível, filtro nearest, deslocada pelo resto do
//    encaixe da câmera, com a camada 2D de efeitos por cima
// Tudo em espaço linear; a conversão para sRGB acontece só no passo 5.
import * as THREE from "three";
import { LAYERS } from "./layers.js";
import { view, PAD, paddedSize } from "./view.js";

// Limiares ajustáveis do contorno (unidades de mundo / adimensionais)
export const OUTLINE = {
  depthThreshold: 0.35, // soma das diferenças de profundidade para virar contorno
  normalThreshold: 0.12, // indicador de normal para virar brilho de borda
  depthBias: 0.03, // tolerância: vizinho "não mais perto" no teste de borda convexa
  outlineDarken: 0.28, // multiplicador linear da cor no contorno (≈ 0.57 em sRGB)
  highlight: 1.55, // multiplicador linear no brilho de borda (≈ 1.2 em sRGB)
  coveredEps: 0.08, // algo sem contorno (grama) na frente: pula o efeito
  // Silhueta de personagens (alfa 0.5 no alvo de normais): contorno quase preto
  charDepthThreshold: 0.1, // diferença de profundidade bem menor: pega pés e pernas
  charGroundEps: 0.12, // chão do mesmo nível (ou mais perto) ao lado do personagem também contorna
  charColor: [0.009, 0.007, 0.018], // PALETTE.night em linear
};

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

const OUTLINE_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tSceneDepth;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform float uNear;
uniform float uFar;
uniform float uDepthThreshold;
uniform float uNormalThreshold;
uniform float uDepthBias;
uniform float uOutlineDarken;
uniform float uHighlight;
uniform float uCoveredEps;
uniform float uCharDepth;
uniform float uCharEps;
uniform vec3 uCharColor;
varying vec2 vUv;

// texelFetch: leitura exata do texel, sem derivadas (seguro em laço/condição)
ivec2 maxTexel;
ivec2 at( ivec2 p ) {
  return clamp( p, ivec2( 0 ), maxTexel );
}
// Ortográfica: profundidade já é linear
float linearDepth( sampler2D tex, ivec2 p ) {
  return -orthographicDepthToViewZ( texelFetch( tex, at( p ), 0 ).r, uNear, uFar );
}
vec3 normalAt( ivec2 p ) {
  return normalize( texelFetch( tNormal, at( p ), 0 ).rgb * 2.0 - 1.0 );
}
// Alfa do alvo de normais: 0.5 = personagem, 1 = resto
bool isChar( ivec2 p ) {
  return texelFetch( tNormal, at( p ), 0 ).a < 0.75;
}

// Contribuição de um vizinho para o contorno (x), o brilho de borda (y) e a
// silhueta de personagem (z)
vec3 neighbor( ivec2 p, float depth, vec3 normal, bool selfChar ) {
  float nDepth = linearDepth( tDepth, p );
  // Só o lado mais perto ganha contorno: linha de 1 px, sem duplicar
  float depthDiff = clamp( nDepth - depth, 0.0, 1.0 );
  vec3 nNormal = normalAt( p );
  // Borda convexa: normais divergem e o vizinho não está mais perto.
  // O viés (1,1,1) escolhe um único lado da aresta.
  float nd = dot( normal - nNormal, vec3( 1.0 ) );
  float sideIndicator = smoothstep( -0.01, 0.01, nd );
  float convex = step( -uDepthBias, nDepth - depth );
  // Silhueta: um lado é personagem e o outro não. O personagem contorna quando o
  // vizinho está mais longe; o chão ao lado contorna quando não está atrás dele.
  float edge = 0.0;
  if ( selfChar != isChar( p ) ) {
    float dd = nDepth - depth;
    edge = selfChar ? step( uCharDepth, dd ) : step( -uCharEps, dd );
  }
  return vec3( depthDiff, ( 1.0 - dot( normal, nNormal ) ) * convex * sideIndicator, edge );
}

void main() {
  maxTexel = textureSize( tColor, 0 ) - 1;
  ivec2 p = ivec2( gl_FragCoord.xy );
  vec4 color = texelFetch( tColor, p, 0 );
  float raw = texelFetch( tDepth, p, 0 ).r;
  float depth = linearDepth( tDepth, p );
  float sceneDepth = linearDepth( tSceneDepth, p );
  vec3 normal = normalAt( p );
  bool selfChar = isChar( p );
  vec3 sum = neighbor( p + ivec2( 0, 1 ), depth, normal, selfChar )
    + neighbor( p + ivec2( 0, -1 ), depth, normal, selfChar )
    + neighbor( p + ivec2( 1, 0 ), depth, normal, selfChar )
    + neighbor( p + ivec2( -1, 0 ), depth, normal, selfChar );
  // Fundo (sem nada com contorno) ou grama/folhagem na frente: cor pura
  bool skip = raw >= 0.99999 || sceneDepth < depth - uCoveredEps;
  if ( !skip && sum.z > 0.5 ) {
    color.rgb = uCharColor;
  } else if ( !skip && sum.x > uDepthThreshold ) {
    color.rgb *= uOutlineDarken;
  } else if ( !skip && sum.y > uNormalThreshold ) {
    color.rgb *= uHighlight;
  }
  gl_FragColor = color;
}
`;

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tFx;
uniform vec2 uInner;
uniform vec2 uPadded;
uniform vec2 uShift;
uniform float uPad;
uniform float uFxOn;
varying vec2 vUv;
void main() {
  // Pixel da tela -> texel do quadro com margem, deslocado pelo resto do encaixe
  vec2 p = vUv * uInner + uPad + uShift;
  vec2 uv = p / uPadded;
  vec3 col = texture2D( tScene, uv ).rgb;
  if ( uFxOn > 0.5 ) {
    vec4 fx = texture2D( tFx, uv );
    // Alfa em 4 degraus: efeitos 2D ficam blocados como o resto
    float a = floor( fx.a * 4.0 + 0.3 ) / 4.0;
    col = mix( col, fx.rgb, clamp( a, 0.0, 1.0 ) );
  }
  gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
  #include <colorspace_fragment>
}
`;

function makeTarget(w, h, { type = THREE.UnsignedByteType, depth = false } = {}) {
  const target = new THREE.WebGLRenderTarget(w, h, {
    type,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: depth,
  });
  if (depth) {
    target.depthTexture = new THREE.DepthTexture(w, h);
    target.depthTexture.type = THREE.UnsignedIntType;
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.magFilter = THREE.NearestFilter;
  }
  return target;
}

const prevClearColor = new THREE.Color();

export function createPipeline(canvas, fxCanvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(1); // o tamanho já vem em px físicos
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap; // sombra nítida, sem PCF
  renderer.shadowMap.autoUpdate = false; // só o passo de cor atualiza a sombra

  const { w, h } = paddedSize();
  const sceneTarget = makeTarget(w, h, { type: THREE.HalfFloatType, depth: true });
  const normalTarget = makeTarget(w, h, { depth: true });
  const postA = makeTarget(w, h, { type: THREE.HalfFloatType });
  const postB = makeTarget(w, h, { type: THREE.HalfFloatType });
  const normalMaterial = new THREE.MeshNormalMaterial();
  // Personagens: mesma normal, mas alfa 0.5 (sem mistura) marca a silhueta
  const charNormalMaterial = new THREE.MeshNormalMaterial({
    transparent: true,
    opacity: 0.5,
    blending: THREE.NoBlending,
  });
  const normalClear = new THREE.Color().setRGB(0.5, 0.5, 1, THREE.LinearSRGBColorSpace);

  const fxTexture = new THREE.CanvasTexture(fxCanvas);
  fxTexture.colorSpace = THREE.SRGBColorSpace;
  fxTexture.minFilter = THREE.NearestFilter;
  fxTexture.magFilter = THREE.NearestFilter;
  fxTexture.generateMipmaps = false;
  let fxW = fxCanvas.width;
  let fxH = fxCanvas.height;

  const outlineMaterial = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: OUTLINE_FRAG,
    uniforms: {
      tColor: { value: sceneTarget.texture },
      tSceneDepth: { value: sceneTarget.depthTexture },
      tDepth: { value: normalTarget.depthTexture },
      tNormal: { value: normalTarget.texture },
      uNear: { value: view.camera.near },
      uFar: { value: view.camera.far },
      uDepthThreshold: { value: OUTLINE.depthThreshold },
      uNormalThreshold: { value: OUTLINE.normalThreshold },
      uDepthBias: { value: OUTLINE.depthBias },
      uOutlineDarken: { value: OUTLINE.outlineDarken },
      uHighlight: { value: OUTLINE.highlight },
      uCoveredEps: { value: OUTLINE.coveredEps },
      uCharDepth: { value: OUTLINE.charDepthThreshold },
      uCharEps: { value: OUTLINE.charGroundEps },
      uCharColor: { value: new THREE.Vector3(...OUTLINE.charColor) },
    },
    depthTest: false,
    depthWrite: false,
  });

  const finalMaterial = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: FINAL_FRAG,
    uniforms: {
      tScene: { value: postA.texture },
      tFx: { value: fxTexture },
      uInner: { value: new THREE.Vector2(view.lowW, view.lowH) },
      uPadded: { value: new THREE.Vector2(w, h) },
      uShift: { value: view.shift },
      uPad: { value: PAD },
      uFxOn: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
  });

  // Triângulo/quad de tela cheia reaproveitado por todos os passes
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outlineMaterial);
  quad.frustumCulled = false;
  quadScene.add(quad);

  function runQuad(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCamera);
  }

  // Passes extras entre o contorno e a ampliação. Cada um é
  // (ctx) => void, onde ctx = { renderer, input, output, runQuad, scene, camera,
  // sceneDepth, outlineDepth, normals, size }. Deve desenhar em ctx.output
  // (use ctx.runQuad(material, ctx.output)). O resultado vira a entrada do próximo.
  const extraPasses = [];

  function setSize(cssW, cssH, dpr) {
    renderer.setSize(Math.round(cssW * dpr), Math.round(cssH * dpr), false);
    const s = paddedSize();
    // O canvas de efeitos já foi redimensionado: realoca o storage da textura
    if (fxCanvas.width !== fxW || fxCanvas.height !== fxH) {
      fxW = fxCanvas.width;
      fxH = fxCanvas.height;
      fxTexture.dispose();
    }
    for (const t of [sceneTarget, normalTarget, postA, postB]) t.setSize(s.w, s.h);
    finalMaterial.uniforms.uInner.value.set(view.lowW, view.lowH);
    finalMaterial.uniforms.uPadded.value.set(s.w, s.h);
    outlineMaterial.uniforms.uNear.value = view.camera.near;
    outlineMaterial.uniforms.uFar.value = view.camera.far;
  }

  function render(scene, camera, { fx = true } = {}) {
    // 1. cor (a sombra é atualizada só aqui)
    camera.layers.enable(LAYERS.noOutline);
    camera.layers.enable(LAYERS.character);
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(sceneTarget);
    renderer.render(scene, camera);

    // 2. normais + profundidade sem a camada noOutline
    camera.layers.disable(LAYERS.noOutline);
    camera.layers.disable(LAYERS.character);
    const background = scene.background;
    const prevClear = renderer.getClearColor(prevClearColor);
    const prevAlpha = renderer.getClearAlpha();
    scene.background = null;
    scene.overrideMaterial = normalMaterial;
    renderer.setClearColor(normalClear, 1);
    renderer.setRenderTarget(normalTarget);
    renderer.render(scene, camera);
    // 2b. personagens por cima (mesmo depth buffer, sem limpar), alfa 0.5
    camera.layers.set(LAYERS.character);
    scene.overrideMaterial = charNormalMaterial;
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(scene, camera);
    renderer.autoClear = prevAuto;
    camera.layers.enable(LAYERS.default);
    scene.overrideMaterial = null;
    scene.background = background;
    renderer.setClearColor(prevClear, prevAlpha);
    camera.layers.enable(LAYERS.noOutline);
    camera.layers.enable(LAYERS.character);

    // 3. contorno
    runQuad(outlineMaterial, postA);

    // 4. extras (ping-pong entre postA e postB)
    let input = postA;
    let output = postB;
    for (const pass of extraPasses) {
      pass({
        renderer,
        input: input.texture,
        output,
        runQuad,
        scene,
        camera,
        sceneDepth: sceneTarget.depthTexture,
        outlineDepth: normalTarget.depthTexture,
        normals: normalTarget.texture,
        size: paddedSize(),
      });
      [input, output] = [output, input];
    }

    // 5. ampliação para a tela
    finalMaterial.uniforms.tScene.value = input.texture;
    finalMaterial.uniforms.uFxOn.value = fx ? 1 : 0;
    if (fx) fxTexture.needsUpdate = true;
    runQuad(finalMaterial, null);
  }

  return {
    renderer,
    render,
    setSize,
    extraPasses,
    targets: { scene: sceneTarget, normal: normalTarget },
    uniforms: { outline: outlineMaterial.uniforms, final: finalMaterial.uniforms },
  };
}
