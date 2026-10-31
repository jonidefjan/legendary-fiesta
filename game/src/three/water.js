// ═══════════════════════════════════════════
//  ÁGUA EM PIXEL ART COM REFLEXO PLANAR
// ═══════════════════════════════════════════
// Técnica de David Holland ("3D Pixel Art Rendering"):
//  - uma câmera espelhada no plano da água renderiza a cena num alvo de baixa
//    resolução, com o mesmo tamanho de texel do quadro principal;
//  - o plano oblíquo de Lengyel (versão ortográfica) corta o que está abaixo da água;
//  - uma textura procedural (gerada uma vez) vira linhas finas horizontais de
//    brilho, fixas no mundo, que deslocam o reflexo em no máximo 1 texel;
//  - tudo é lido por texel (texelFetch / floor), então fica nítido.
// Contrato: install(ctx) -> { beforeRender(timeSec) } ou null sem waterRect.
import * as THREE from "three";
import { sharedUniforms } from "./materials.js";
import { LAYERS } from "./layers.js";
import { paddedSize } from "./view.js";
import { CAMERA } from "./world.js";
import { PALETTE } from "../palette.js";

const WAVE_SIZE = 128;
const REFLECT_MIX = 0.45; // ortográfica: sem Fresnel, mistura constante
const CLIP_RANGE = 64; // altura máxima (acima da água) que o reflexo ainda cobre

// ─── Textura de ondas ───
// R = direção (na coluna 0: sentido da deriva da linha; nas demais: início do traço)
// G = variância (na coluna 0: velocidade; nas demais: comprimento do traço)
// B = tempo (fase da piscada de cada traço)
// A = presença (ruído que decide onde há traço; também ruído da espuma e dos tons)
function makeWaveTexture(seed = 29) {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const data = new Uint8Array(WAVE_SIZE * WAVE_SIZE * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rand() * 256);
  const tex = new THREE.DataTexture(data, WAVE_SIZE, WAVE_SIZE, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uWave;
uniform sampler2D uReflTex;
uniform vec2 uReflSize;
uniform mat4 uReflVP;
uniform vec2 uCamTexel; // posição da câmera (encaixada) em texels
uniform vec4 uRect; // minX, maxX, minZ, maxZ
uniform float uMix;
uniform float uFoam;
uniform vec3 uTeal;
uniform vec3 uNavy;
uniform vec3 uBlue;
uniform vec3 uPale;
uniform vec3 uFoamColor;
uniform sampler2D uCloudTex;
uniform float uTime;
uniform float uCloudScale;
uniform vec2 uCloudSpeed;
uniform float uCloudStrength;
uniform float uCloudCover;
uniform vec3 uSunDir;
varying vec3 vWorld;

float cloudAttenuation( vec3 worldPos ) {
  vec2 ground = worldPos.xz - worldPos.y * uSunDir.xz / max( uSunDir.y, 0.05 );
  vec2 uv = ( ground - uCloudSpeed * uTime ) * uCloudScale;
  float n = texture2D( uCloudTex, uv ).r;
  return 1.0 - uCloudStrength * step( uCloudCover, n );
}

int pmod( int a, int m ) {
  int r = a % m;
  return r < 0 ? r + m : r;
}
int fdiv( int a, int b ) {
  return ( a - pmod( a, b ) ) / b;
}
vec4 waveAt( int x, int y ) {
  return texelFetch( uWave, ivec2( pmod( x, ${WAVE_SIZE} ), pmod( y, ${WAVE_SIZE} ) ), 0 );
}

// 1 se o texel t (coordenada de mundo em texels) faz parte de um traço de brilho.
// Cada linha de texels desliza para um lado; os traços são "células" de 14 texels
// com início, comprimento e fase de piscada vindos da textura.
float lineMask( ivec2 t ) {
  vec4 row = waveAt( 0, t.y );
  int speedSteps = int( floor( uTime * ( 1.5 + row.g * 3.0 ) ) );
  int x = t.x - ( row.r > 0.5 ? speedSteps : -speedSteps );
  int cx = fdiv( x, 14 );
  int lx = x - cx * 14;
  vec4 cell = waveAt( cx + 1, t.y );
  if ( cell.a < 0.82 ) return 0.0;
  // Piscada em 4 fases: curto, cheio, cheio, apagado
  int stage = int( floor( fract( uTime * 0.45 + cell.b ) * 4.0 ) );
  if ( stage == 3 ) return 0.0;
  int start = int( cell.r * 5.0 );
  int len = 3 + int( cell.g * 6.0 );
  if ( stage == 0 ) len = len / 2;
  return ( lx >= start && lx < start + len ) ? 1.0 : 0.0;
}

void main() {
  // Texel do quadro principal -> texel fixo no mundo (câmera anda em texels inteiros)
  ivec2 wt = ivec2( floor( gl_FragCoord.xy ) ) + ivec2( uCamTexel );

  float line = lineMask( wt );
  float above = lineMask( wt + ivec2( 0, 1 ) ); // texel logo abaixo de um traço (na tela)

  // Reflexo: deslocado 1 texel para os lados em volta dos traços
  float dirSign = waveAt( 0, wt.y ).r > 0.5 ? 1.0 : -1.0;
  int shift = line > 0.5 ? int( dirSign ) : ( above > 0.5 ? -int( dirSign ) : 0 );
  vec4 rc = uReflVP * vec4( vWorld, 1.0 );
  ivec2 ri = ivec2( floor( ( rc.xy * 0.5 + 0.5 ) * uReflSize ) ) + ivec2( shift, 0 );
  ri = clamp( ri, ivec2( 0 ), ivec2( uReflSize ) - 1 );
  vec3 refl = texelFetch( uReflTex, ri, 0 ).rgb;

  // Cor da água: verde-azulado escuro com manchas azul-marinho em blocos de 6 texels
  float blob = waveAt( fdiv( wt.x, 6 ) + 3, fdiv( wt.y, 3 ) + 11 ).a;
  vec3 base = blob > 0.62 ? uNavy : uTeal;
  base = mix( base, uBlue, above * 0.4 );
  base *= cloudAttenuation( vWorld );

  vec3 col = mix( base, refl, uMix );
  col = mix( col, uPale, line );

  // Espuma na beira: distância ao retângulo + ruído por texel
  float d = min( min( vWorld.x - uRect.x, uRect.y - vWorld.x ), min( vWorld.z - uRect.z, uRect.w - vWorld.z ) );
  float jitter = ( waveAt( wt.x + 5, wt.y + 17 ).a - 0.5 ) * 0.22;
  if ( d < uFoam + jitter ) col = mix( col, uFoamColor, 0.85 );

  gl_FragColor = vec4( col, 1.0 );
}
`;

// Soma de p (posição) deslocada m texels ao longo de axis
function nudge(pos, axis, texels, texel) {
  pos.addScaledVector(axis, texels * texel);
}

function wrapHalf(v) {
  return v - Math.round(v);
}

export function install(ctx) {
  const rect = ctx.environment?.waterRect;
  if (!rect || !ctx.pipeline) return null;
  const renderer = ctx.pipeline.renderer;
  const mainCam = ctx.camera;
  const view = ctx.view;
  const waterY = rect.y;

  // ─── Alvo e câmera espelhada ───
  const size0 = paddedSize();
  const target = new THREE.WebGLRenderTarget(size0.w, size0.h, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
  });
  const reflCam = new THREE.OrthographicCamera(-1, 1, 1, -1, mainCam.near, mainCam.far);
  reflCam.matrixAutoUpdate = false;
  reflCam.matrixWorldAutoUpdate = false;
  reflCam.layers.enable(LAYERS.default);
  reflCam.layers.enable(LAYERS.noOutline);
  // Personagens têm camada própria (contorno mais forte); também se refletem
  reflCam.layers.enable(LAYERS.character);

  // ─── Malha da água ───
  const wave = makeWaveTexture();
  const uniforms = {
    uWave: { value: wave },
    uReflTex: { value: target.texture },
    uReflSize: { value: new THREE.Vector2(size0.w, size0.h) },
    uReflVP: { value: new THREE.Matrix4() },
    uCamTexel: { value: new THREE.Vector2() },
    uRect: { value: new THREE.Vector4(rect.minX, rect.maxX, rect.minZ, rect.maxZ) },
    uMix: { value: REFLECT_MIX },
    uFoam: { value: 0.36 },
    uTeal: { value: new THREE.Color(PALETTE.teal) },
    uNavy: { value: new THREE.Color(PALETTE.navy) },
    uBlue: { value: new THREE.Color(PALETTE.blue) },
    uPale: { value: new THREE.Color(PALETTE.mist) },
    uFoamColor: { value: new THREE.Color(PALETTE.white) },
    // Compartilhados com os materiais toon (mesmos objetos: acompanham o tempo e as nuvens)
    uTime: sharedUniforms.uTime,
    uCloudTex: sharedUniforms.uCloudTex,
    uCloudScale: sharedUniforms.uCloudScale,
    uCloudSpeed: sharedUniforms.uCloudSpeed,
    uCloudStrength: sharedUniforms.uCloudStrength,
    uCloudCover: sharedUniforms.uCloudCover,
    uSunDir: sharedUniforms.uSunDir,
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    fog: false,
  });
  const geo = new THREE.PlaneGeometry(rect.maxX - rect.minX, rect.maxZ - rect.minZ);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set((rect.minX + rect.maxX) / 2, waterY, (rect.minZ + rect.maxZ) / 2);
  mesh.layers.set(LAYERS.noOutline); // sem contorno na água
  mesh.name = "water";
  mesh.renderOrder = 0;
  ctx.scene.add(mesh);

  // ─── Auxiliares (alocados uma vez) ───
  const pitch = THREE.MathUtils.degToRad(CAMERA.pitchDeg);
  const upAxis = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch));
  const clipPlane = new THREE.Plane();
  const rightV = new THREE.Vector3();
  const upV = new THREE.Vector3();
  const backV = new THREE.Vector3();
  const posV = new THREE.Vector3();
  const fwdV = new THREE.Vector3();
  const p0 = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const prevColor = new THREE.Color();
  const skyColor = new THREE.Color(PALETTE.silver).lerp(new THREE.Color(PALETTE.blue), 0.35);
  const mirrored = (v) => v.set(v.x, -v.y, v.z);

  function syncSize() {
    const s = paddedSize();
    if (target.width !== s.w || target.height !== s.h) {
      target.setSize(s.w, s.h);
      uniforms.uReflSize.value.set(s.w, s.h);
    }
    reflCam.left = mainCam.left;
    reflCam.right = mainCam.right;
    reflCam.top = mainCam.top;
    reflCam.bottom = mainCam.bottom;
    reflCam.near = mainCam.near;
    reflCam.far = mainCam.far;
    reflCam.projectionMatrix.copy(mainCam.projectionMatrix);
    reflCam.projectionMatrixInverse.copy(mainCam.projectionMatrixInverse);
  }

  // Ponto do plano da água que cai no centro do quadro principal
  function centerOnWater(out) {
    posV.setFromMatrixPosition(mainCam.matrixWorld);
    fwdV.setFromMatrixColumn(mainCam.matrixWorld, 2).negate();
    const t = (waterY - posV.y) / fwdV.y;
    return out.copy(posV).addScaledVector(fwdV, t);
  }

  // Coloca a câmera espelhada: posição/eixos refletidos no plano y = waterY
  function placeMirror(offX, offY) {
    const e = mainCam.matrixWorld;
    rightV.setFromMatrixColumn(e, 0);
    upV.setFromMatrixColumn(e, 1);
    backV.setFromMatrixColumn(e, 2);
    posV.setFromMatrixPosition(e);
    posV.y = 2 * waterY - posV.y;
    mirrored(rightV).negate(); // volta a base à mão direita
    mirrored(upV);
    mirrored(backV);
    nudge(posV, rightV, offX, view.texel);
    nudge(posV, upV, offY, view.texel);
    reflCam.matrixWorld.makeBasis(rightV, upV, backV).setPosition(posV);
    reflCam.matrixWorldInverse.copy(reflCam.matrixWorld).invert();
  }

  // Coordenada (em texels do alvo) do ponto P na câmera espelhada
  function reflTexel(p, out) {
    tmp.copy(p).applyMatrix4(reflCam.matrixWorldInverse).applyMatrix4(mainCam.projectionMatrix);
    return out.set(
      (tmp.x * 0.5 + 0.5) * target.width,
      (tmp.y * 0.5 + 0.5) * target.height,
    );
  }

  const r0 = new THREE.Vector2();

  // Plano oblíquo de Lengyel na projeção ortográfica: o plano da água vira o
  // "near" (z_clip = -1) e a altura CLIP_RANGE acima dele vira o "far" (+1).
  // Em ortográfica a profundidade só depende da altura sobre o plano, e ao longo
  // de cada raio ela cresce monotonicamente, então o teste de profundidade vale.
  function applyObliqueClip() {
    clipPlane.set(tmp.set(0, 1, 0), -waterY).applyMatrix4(reflCam.matrixWorldInverse);
    const k = 2 / CLIP_RANGE;
    const m = reflCam.projectionMatrix.elements;
    m[2] = k * clipPlane.normal.x;
    m[6] = k * clipPlane.normal.y;
    m[10] = k * clipPlane.normal.z;
    m[14] = k * clipPlane.constant - 1;
    reflCam.projectionMatrixInverse.copy(reflCam.projectionMatrix).invert();
  }

  function beforeRender() {
    syncSize();
    centerOnWater(p0);

    // Alinha a grade do reflexo à do quadro: texel central do principal cai no
    // centro de um texel do alvo (espelhado em x). Duas passadas: mede e corrige.
    placeMirror(0, 0);
    reflTexel(p0, r0);
    const fx = target.width / 2;
    const fy = target.height / 2;
    placeMirror(wrapHalf(r0.x + fx), wrapHalf(r0.y - fy));

    // Matriz mundo -> texel do alvo (xy, sem o corte oblíquo)
    uniforms.uReflVP.value.multiplyMatrices(mainCam.projectionMatrix, reflCam.matrixWorldInverse);

    // Câmera principal em texels inteiros (encaixada em view.js)
    uniforms.uCamTexel.value.set(
      Math.round(mainCam.position.x / view.texel),
      Math.round(mainCam.position.dot(upAxis) / view.texel),
    );

    applyObliqueClip();

    // Renderiza o reflexo: sem a água, fundo liso de céu, estado restaurado depois
    const scene = ctx.scene;
    const prevTarget = renderer.getRenderTarget();
    const prevBackground = scene.background;
    renderer.getClearColor(prevColor);
    const prevAlpha = renderer.getClearAlpha();
    scene.background = skyColor; // céu liso e frio: a água não reflete o laranja da névoa
    mesh.visible = false;
    // Só personagens que podem aparecer na água entram no reflexo: com dezenas de
    // inimigos, desenhar todos de novo aqui custava quase um passe inteiro
    const hidden = ctx.characters?.hideUnreflected?.(rect) ?? [];
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, reflCam);
    for (const root of hidden) root.visible = true;
    mesh.visible = true;
    scene.background = prevBackground;
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.setRenderTarget(prevTarget);
  }

  return { beforeRender, mesh, target, uniforms };
}
