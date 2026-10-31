// ═══════════════════════════════════════════
//  RAIOS DE LUZ (god rays) em pós-processamento
// ═══════════════════════════════════════════
// Técnica do artigo de David Holland: um único passe de tela cheia que marcha o
// raio de visão de cada pixel baixa resolução. A posição do ponto visível vem da
// profundidade da cena (câmera ortográfica: profundidade linear). Em cada passo
// testamos se o ponto no ar está iluminado pelo sol lendo o mapa de sombra
// (RGBA-empacotado no Three 0.170) e acumulamos luz espalhada numa faixa de
// altura. O resultado é somado em tom quente e quantizado em poucos degraus.
import * as THREE from "three";
import { sharedUniforms } from "./materials.js";
import { PALETTE } from "../palette.js";

// Ajustes
export const GODRAYS = {
  enabled: true,
  steps: 16, // passos por raio (12–20)
  intensity: 0.2, // pico aditivo (espaço linear)
  bandMin: 0.5, // altura mínima (mundo) da luz suspensa
  bandMax: 7, // altura máxima
  bandFade: 1.5, // suavização nas bordas da faixa
  density: 0.09, // espalhamento por unidade de mundo percorrida no ar
  levels: 4, // degraus da quantização (3–4)
  color: PALETTE.amber, // tom do sol; misturado com dourado
  colorMix: PALETTE.gold,
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tShadow;
uniform sampler2D uCloudTex;
uniform mat4 uInvProj;      // projeção inversa
uniform mat4 uCamWorld;     // vista -> mundo
uniform mat4 uShadowMatrix; // mundo -> uv/profundidade da sombra
uniform vec3 uCamForward;   // direção da câmera (mundo, unitária)
uniform vec3 uSunDir;
uniform vec2 uSize;
uniform vec2 uCloudSpeed;
uniform float uCloudScale;
uniform float uCloudStrength;
uniform float uCloudCover;
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uShadowBias;
uniform float uHasShadow;
uniform float uEnabled;
uniform int uSteps;
uniform float uIntensity;
uniform float uBandMin;
uniform float uBandMax;
uniform float uBandFade;
uniform float uDensity;
uniform float uLevels;
uniform vec3 uTint;
varying vec2 vUv;

float cloudAtt( vec3 p ) {
  vec2 ground = p.xz - p.y * uSunDir.xz / max( uSunDir.y, 0.05 );
  vec2 uv = ( ground - uCloudSpeed * uTime ) * uCloudScale;
  float n = textureLod( uCloudTex, uv, 0.0 ).r;
  return 1.0 - uCloudStrength * step( uCloudCover, n );
}

// Luz direta do sol no ponto: sombra (0/1) x nuvem
float sunAt( vec3 p ) {
  vec4 sc = uShadowMatrix * vec4( p, 1.0 );
  vec3 c = sc.xyz / sc.w;
  float lit = 1.0;
  if ( c.x >= 0.0 && c.x <= 1.0 && c.y >= 0.0 && c.y <= 1.0 && c.z <= 1.0 ) {
    lit = step( c.z + uShadowBias, unpackRGBAToDepth( textureLod( tShadow, c.xy, 0.0 ) ) );
  }
  return lit * cloudAtt( p );
}

// Ruído de gradiente intercalado: estável (fixo na grade de pixels)
float ign( vec2 p ) {
  return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
}

void main() {
  ivec2 ip = ivec2( gl_FragCoord.xy );
  vec4 base = texelFetch( tColor, ip, 0 );
  float raw = texelFetch( tDepth, ip, 0 ).r;
  // Fora: desligado, sem sombra ainda, ou céu/fundo
  if ( uEnabled < 0.5 || uHasShadow < 0.5 || raw >= 0.99999 ) {
    gl_FragColor = base;
    return;
  }
  // Ponto visível no mundo
  vec2 ndc = ( gl_FragCoord.xy / uSize ) * 2.0 - 1.0;
  vec4 v = uInvProj * vec4( ndc, raw * 2.0 - 1.0, 1.0 );
  vec3 surf = ( uCamWorld * vec4( v.xyz / v.w, 1.0 ) ).xyz;
  // Distância (ao longo do raio) até o plano próximo; ortográfica: linear
  float sMax = raw * ( uFar - uNear );
  // Raio parte do ponto visível em direção à câmera (-forward): y cresce
  float dy = -uCamForward.y; // > 0 quando a câmera olha para baixo
  if ( dy < 0.05 ) {
    gl_FragColor = base;
    return;
  }
  // Trecho do raio dentro da faixa de altura
  float s0 = max( 0.0, ( uBandMin - surf.y ) / dy );
  float s1 = min( sMax, ( uBandMax - surf.y ) / dy );
  if ( s1 <= s0 ) {
    gl_FragColor = base;
    return;
  }
  float jitter = ign( gl_FragCoord.xy );
  float stepLen = ( s1 - s0 ) / float( uSteps );
  float acc = 0.0;
  for ( int i = 0; i < 24; i++ ) {
    if ( i >= uSteps ) break;
    float s = s0 + ( float( i ) + jitter ) * stepLen;
    vec3 p = surf - uCamForward * s;
    // Faixa suave: some perto do chão e do topo
    float band = smoothstep( uBandMin, uBandMin + uBandFade, p.y )
      * ( 1.0 - smoothstep( uBandMax - uBandFade, uBandMax, p.y ) );
    acc += sunAt( p ) * band * stepLen;
  }
  float amount = clamp( acc * uDensity, 0.0, 1.0 );
  // Quantiza em degraus: bandas de luz, sem névoa lisa
  float q = floor( amount * uLevels + 0.35 ) / uLevels;
  gl_FragColor = vec4( base.rgb + uTint * ( q * uIntensity ), base.a );
}
`;

export function install(ctx) {
  const { pipeline, camera, lighting } = ctx;
  const sun = lighting?.sun;
  if (!pipeline || !sun) return null;

  // Textura reserva até o mapa de sombra existir (nasce no primeiro quadro)
  const dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  dummy.needsUpdate = true;

  const tint = new THREE.Color(GODRAYS.color).lerp(new THREE.Color(GODRAYS.colorMix), 0.35);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      tShadow: { value: dummy },
      uCloudTex: sharedUniforms.uCloudTex,
      uCloudSpeed: sharedUniforms.uCloudSpeed,
      uCloudScale: sharedUniforms.uCloudScale,
      uCloudStrength: sharedUniforms.uCloudStrength,
      uCloudCover: sharedUniforms.uCloudCover,
      uSunDir: sharedUniforms.uSunDir,
      uTime: sharedUniforms.uTime,
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uShadowMatrix: { value: new THREE.Matrix4() },
      uCamForward: { value: new THREE.Vector3(0, 0, -1) },
      uSize: { value: new THREE.Vector2(1, 1) },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uShadowBias: { value: sun.shadow.bias },
      uHasShadow: { value: 0 },
      uEnabled: { value: GODRAYS.enabled ? 1 : 0 },
      uSteps: { value: GODRAYS.steps },
      uIntensity: { value: GODRAYS.intensity },
      uBandMin: { value: GODRAYS.bandMin },
      uBandMax: { value: GODRAYS.bandMax },
      uBandFade: { value: GODRAYS.bandFade },
      uDensity: { value: GODRAYS.density },
      uLevels: { value: GODRAYS.levels },
      uTint: { value: new THREE.Vector3(tint.r, tint.g, tint.b) },
    },
    depthTest: false,
    depthWrite: false,
  });

  const u = material.uniforms;
  const dir = new THREE.Vector3();

  function syncConstants() {
    u.uSteps.value = Math.min(24, Math.max(1, Math.round(GODRAYS.steps)));
    u.uIntensity.value = GODRAYS.intensity;
    u.uBandMin.value = GODRAYS.bandMin;
    u.uBandMax.value = GODRAYS.bandMax;
    u.uBandFade.value = GODRAYS.bandFade;
    u.uDensity.value = GODRAYS.density;
    u.uLevels.value = GODRAYS.levels;
  }

  pipeline.extraPasses.push((pc) => {
    const map = sun.shadow.map;
    u.tColor.value = pc.input;
    u.tDepth.value = pc.sceneDepth;
    u.tShadow.value = map ? map.texture : dummy;
    u.uHasShadow.value = map ? 1 : 0;
    u.uShadowMatrix.value.copy(sun.shadow.matrix);
    u.uSize.value.set(pc.size.w, pc.size.h);
    pc.runQuad(material, pc.output);
  });

  return {
    beforeRender() {
      syncConstants();
      u.uInvProj.value.copy(camera.projectionMatrixInverse);
      u.uCamWorld.value.copy(camera.matrixWorld);
      camera.getWorldDirection(dir);
      u.uCamForward.value.copy(dir);
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      u.uShadowBias.value = sun.shadow.bias;
    },
    setEnabled(on) {
      GODRAYS.enabled = !!on;
      u.uEnabled.value = on ? 1 : 0;
    },
  };
}
