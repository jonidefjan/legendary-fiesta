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
  uCloudCover: { value: 0.56 }, // limiar do ruído: acima disso há nuvem
  uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.6).normalize() }, // direção PARA o sol
  uShadowFloor: { value: 0.12 }, // luz direta que sobra na sombra projetada (sombra fria, não preta)
};

let gradientMap = null;
let characterGradientMap = null;

function rampTexture(values) {
  const data = new Uint8Array(values);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Rampa de luz em 3 faixas (sombra, meia-luz, luz), sem interpolação
export function toonGradient() {
  if (!gradientMap) gradientMap = rampTexture([70, 150, 255]);
  return gradientMap;
}

// Rampa de personagens: faixa escura mais alta, para não afundar no chão escuro
// (110/190 lavava os ossos claros dos esqueletos; 90/175 mantém o detalhe da textura)
export const CHARACTER_RAMP = [90, 175, 255];
export function characterGradient() {
  if (!characterGradientMap) characterGradientMap = rampTexture(CHARACTER_RAMP);
  return characterGradientMap;
}

// ─── Injeção no shader do MeshToonMaterial ───
// Nuvens: o ruído é projetado no chão seguindo a direção do sol, então paredes
// e personagens recebem a mesma sombra que o chão abaixo deles. Limiar duro
// (step) para a borda da nuvem ficar nítida como pixel art.
const CLOUD_PARS = /* glsl */ `
uniform sampler2D uCloudTex;
uniform float uTime;
uniform float uCloudScale;
uniform vec2 uCloudSpeed;
uniform float uCloudStrength;
uniform float uCloudCover;
uniform vec3 uSunDir;
uniform float uShadowFloor;
varying vec3 vCloudWorldPos;
float get_cloud_attenuation( vec3 worldPos ) {
  vec2 ground = worldPos.xz - worldPos.y * uSunDir.xz / max( uSunDir.y, 0.05 );
  vec2 uv = ( ground - uCloudSpeed * uTime ) * uCloudScale;
  float n = texture2D( uCloudTex, uv ).r;
  return 1.0 - uCloudStrength * step( uCloudCover, n );
}
`;

// Sombra projetada vira a faixa escura (não preto) e as nuvens atenuam o sol
function patchLights(chunk) {
  let out = chunk.replace(
    "getDirectionalLightInfo( directionalLight, directLight );",
    "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= get_cloud_attenuation( vCloudWorldPos );",
  );
  out = out.replace(
    /directLight\.color \*= \( directLight\.visible && receiveShadow \) \? getShadow\( directionalShadowMap\[ i \],([^;]*?)\) : 1\.0;/,
    "directLight.color *= ( directLight.visible && receiveShadow ) ? mix( uShadowFloor, 1.0, getShadow( directionalShadowMap[ i ],$1) ) : 1.0;",
  );
  return out;
}

// Luz de contorno (rim): faixa dura e quente onde a normal se afasta da câmera,
// mais forte do lado do sol. Ortográfica: direção de vista = +Z no espaço de vista.
export const RIM = {
  edge: 0.75, // 1 - normal.z acima disso entra na faixa (faixa fina, só a borda)
  sunSide: 0.35, // intensidade do lado do sol
  shade: 0.1, // intensidade do lado oposto
  color: [1.0, 0.62, 0.3], // linear, tom do sol
};
const RIM_FRAG = /* glsl */ `
  {
    vec3 rimSun = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
    float rimBand = step( ${RIM.edge.toFixed(3)}, 1.0 - normal.z );
    float rimSide = step( 0.1, dot( normalize( normal.xy + 1e-4 ), normalize( rimSun.xy + 1e-4 ) ) );
    float rimK = rimBand * mix( ${RIM.shade.toFixed(3)}, ${RIM.sunSide.toFixed(3)}, rimSide );
    outgoingLight += vec3( ${RIM.color.map((c) => c.toFixed(3)).join(", ")} ) * rimK;
  }
  #include <opaque_fragment>`;

let patchedLights = null;

function injectToon(shader, rim) {
  Object.assign(shader.uniforms, sharedUniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vCloudWorldPos;")
    .replace(
      "#include <project_vertex>",
      `#include <project_vertex>
  vec4 cloudWorld = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    cloudWorld = batchingMatrix * cloudWorld;
  #endif
  #ifdef USE_INSTANCING
    cloudWorld = instanceMatrix * cloudWorld;
  #endif
  vCloudWorldPos = ( modelMatrix * cloudWorld ).xyz;`,
    );
  if (!patchedLights) patchedLights = patchLights(THREE.ShaderChunk.lights_fragment_begin);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${CLOUD_PARS}`)
    .replace("#include <lights_fragment_begin>", patchedLights);
  if (rim) shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", RIM_FRAG);
}

// Usar sempre esta função (e não uma arrow nova) mantém o cache de programas
function onBeforeCompileToon(shader) {
  injectToon(shader, false);
}
function onBeforeCompileRim(shader) {
  injectToon(shader, true);
}

// color: número (0xrrggbb) ou string "#rrggbb", de preferência da paleta (palette.js)
export function toonMaterial(color, options = {}) {
  const {
    emissive = 0x000000,
    map = null,
    transparent = false,
    alphaTest = 0,
    side = THREE.FrontSide,
    rim = false, // luz de contorno em faixa dura (personagens)
    character = false, // rampa de luz mais clara (separa do fundo)
  } = options;
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: character ? characterGradient() : toonGradient(),
    emissive: new THREE.Color(emissive),
    map,
    transparent,
    alphaTest,
    side,
  });
  mat.onBeforeCompile = rim ? onBeforeCompileRim : onBeforeCompileToon;
  mat.customProgramCacheKey = rim ? () => "reliquary-toon-v1-rim" : () => "reliquary-toon-v1";
  return mat;
}
