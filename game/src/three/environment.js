// ═══════════════════════════════════════════
//  CENÁRIO 3D: RUÍNAS AO ENTARDECER
// ═══════════════════════════════════════════
// Tudo em código (sem modelos): terreno facetado, bacia d'água, ruínas, tochas,
// árvores, props e grama em billboard. Estilo "3D pixel art": formas low-poly,
// luz toon, arestas chanfradas para o contorno pegar.
// Contrato: buildEnvironment(scene) → { group, update, torches, waterRect, dispose }.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { WORLD } from "./world.js";
import { toonMaterial, sharedUniforms } from "./materials.js";
import { PALETTE } from "../palette.js";

// ───────── utilidades ─────────

// Gerador pseudo-aleatório com semente: o cenário é sempre o mesmo
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// smoothstep que aceita bordas invertidas (a > b)
function sstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 269.5 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Acumula peças com cor por vértice e funde tudo em uma única geometria
class Batch {
  constructor() {
    this.parts = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
  }

  add(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], jitter = 0 } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    g.deleteAttribute("uv");
    if (jitter > 0) {
      // Deforma vértices de forma determinística (vértices iguais andam juntos)
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = Math.round(p.getX(i) * 1000) / 1000;
        const y = Math.round(p.getY(i) * 1000) / 1000;
        const z = Math.round(p.getZ(i) * 1000) / 1000;
        p.setXYZ(
          i,
          p.getX(i) + (hash3(x, y, z) - 0.5) * jitter,
          p.getY(i) + (hash3(y, z, x) - 0.5) * jitter,
          p.getZ(i) + (hash3(z, x, y) - 0.5) * jitter,
        );
      }
    }
    this.e.set(rot[0], rot[1], rot[2]);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(pos[0], pos[1], pos[2]), this.q, this.s.set(scale[0], scale[1], scale[2]));
    g.applyMatrix4(this.m);
    g.computeVertexNormals(); // sem índice: normal por face (flat shading)
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    this.c.set(color);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = this.c.r;
      arr[i * 3 + 1] = this.c.g;
      arr[i * 3 + 2] = this.c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
  }

  geometry() {
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    return g;
  }
}

// Caixa com chanfro (1 segmento): cria arestas convexas para o realce de borda
function chamfer(w, h, d, r = 0.08) {
  return new RoundedBoxGeometry(w, h, d, 1, Math.min(r, Math.min(w, h, d) / 2.2));
}

function vertexColorToon(color = 0xffffff, options = {}) {
  const mat = toonMaterial(color, options);
  mat.vertexColors = true;
  return mat;
}

// ───────── terreno ─────────

// Lago na frente, à direita da faixa, inteiro dentro do quadro
const BASIN = { minX: 3, maxX: 7, minZ: 4, maxZ: 5, depth: 0.9 };
const WATER_Y = -0.5;

const MOUNDS = [
  { x: -19, z: -9, r: 5, h: 2.0 },
  { x: 20, z: -8, r: 4.5, h: 1.7 },
  { x: -11, z: -16, r: 4, h: 2.2 },
  { x: 9, z: -16, r: 5.5, h: 2.0 },
  { x: -23, z: 6, r: 3, h: 1.2 },
  { x: -6, z: 8.5, r: 3, h: 0.5 },
];

// Distância (em XZ) até o retângulo da bacia; 0 = dentro
function basinDist(x, z) {
  const dx = Math.max(BASIN.minX - x, 0, x - BASIN.maxX);
  const dz = Math.max(BASIN.minZ - z, 0, z - BASIN.maxZ);
  return Math.hypot(dx, dz);
}

// Altura "ideal" do terreno: plano na faixa de combate, sobe para o fundo
function terrainHeight(x, z) {
  const bd = basinDist(x, z);
  if (bd === 0) return -BASIN.depth;
  if (bd <= 1.01) return 0; // anel liso em volta da bacia
  const lane = sstep(3, 5, Math.abs(z)); // 0 dentro da faixa de combate
  let h = sstep(-5, -18, z) * 3.2;
  for (const m of MOUNDS) {
    const d2 = (x - m.x) ** 2 + (z - m.z) ** 2;
    h += m.h * Math.exp(-d2 / (m.r * m.r));
  }
  h += (hash2(x, z) - 0.5) * (z < -5 ? 0.22 : 0.12);
  return h * lane;
}

function buildTerrain() {
  const x0 = WORLD.minX;
  const z0 = WORLD.backZ;
  const nx = Math.round(WORLD.maxX - x0);
  const nz = Math.round(WORLD.frontZ - z0);
  const stride = nx + 1;
  const heights = new Float32Array(stride * (nz + 1));
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) heights[j * stride + i] = terrainHeight(x0 + i, z0 + j);
  }

  // Altura exata da malha (interpola o mesmo triângulo que será desenhado)
  function sample(x, z) {
    const fx = clamp(x - x0, 0, nx - 0.0001);
    const fz = clamp(z - z0, 0, nz - 0.0001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const w = fz - j;
    const ha = heights[j * stride + i];
    const hb = heights[j * stride + i + 1];
    const hc = heights[(j + 1) * stride + i];
    const hd = heights[(j + 1) * stride + i + 1];
    if (u + w <= 1) return ha + u * (hb - ha) + w * (hc - ha);
    return hd + (1 - u) * (hc - hd) + (1 - w) * (hb - hd);
  }

  const cGreen = new THREE.Color(PALETTE.green);
  const cForest = new THREE.Color(PALETTE.forest);
  const cPine = new THREE.Color(PALETTE.pine);
  const cSlate = new THREE.Color(PALETTE.slate);
  const cTeal = new THREE.Color(PALETTE.teal);

  // Cor por VÉRTICE a partir de ruído de baixa frequência: regiões grandes e suaves,
  // vizinhos compartilham a cor (nada de cor aleatória por face)
  function groundColor(px, pz, h) {
    const bd = basinDist(px, pz);
    if (bd === 0) return cTeal; // leito da bacia
    if (bd <= 1.01) return cSlate; // barranco de pedra escura
    // (a trilha é uma malha própria de retângulos, ver buildPath)
    // gramado em 2 tons: floresta no geral, pinho nas manchas de sombra
    let n = Math.sin(px * 0.17 + 0.7) * 0.5 + Math.sin(pz * 0.23 - 1.2) * 0.5 + Math.sin((px + pz) * 0.11) * 0.5;
    if (pz < -11) n -= 0.4; // fundo mais escuro
    if (h > 1.5 && n > 0.1) return cGreen; // só topo de morro
    return n < (Math.abs(pz) < 6 ? -0.15 : -0.4) ? cPine : cForest; // perto da faixa: mais escuro
  }

  const positions = [];
  const colors = [];
  function tri(ax, az, bx, bz, cx, cz) {
    const pts = [
      [ax, az],
      [bx, bz],
      [cx, cz],
    ];
    const hs = pts.map(([px, pz]) => heights[Math.round(pz - z0) * stride + Math.round(px - x0)]);
    pts.forEach(([px, pz], k) => {
      const col = groundColor(px, pz, hs[k]);
      positions.push(px, hs[k], pz);
      colors.push(col.r, col.g, col.b);
    });
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const xa = x0 + i;
      const za = z0 + j;
      tri(xa, za, xa, za + 1, xa + 1, za); // a, c, b
      tri(xa + 1, za, xa, za + 1, xa + 1, za + 1); // b, c, d
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, vertexColorToon());
  mesh.name = "ground";
  mesh.receiveShadow = true;
  return { mesh, sample };
}

// ───────── ruínas ─────────

const STONES = [PALETTE.steel, PALETTE.slate, PALETTE.silver, PALETTE.steel];

function pickStone(rng) {
  return STONES[Math.floor(rng() * STONES.length)];
}

// Bloco chanfrado com musgo opcional no topo. baseY = altura da face de baixo.
function addBlock(ctx, x, baseY, z, w, h, d, opts = {}) {
  const { rotY = 0, rotX = 0, rotZ = 0, color, moss = 0.25 } = opts;
  const { B, rng } = ctx;
  B.add(chamfer(w, h, d), color ?? pickStone(rng), {
    pos: [x, baseY + h / 2, z],
    rot: [rotX, rotY, rotZ],
  });
  if (rng() < moss) {
    B.add(chamfer(w * 0.9, 0.14, d * 0.9, 0.05), PALETTE.pine, {
      pos: [x, baseY + h + 0.04, z],
      rot: [rotX, rotY, rotZ],
    });
  }
}

function addColumn(ctx, x, z, height, broken) {
  const { B, rng, gy } = ctx;
  const y0 = gy(x, z) - 0.3;
  const stone = pickStone(rng);
  addBlock(ctx, x, y0, z, 1.35, 0.45, 1.35, { color: PALETTE.slate, moss: 0.3 });
  const shaftH = height - 0.45 - (broken ? 0 : 0.4);
  if (!broken) {
    B.add(new THREE.CylinderGeometry(0.42, 0.5, shaftH, 8), stone, {
      pos: [x, y0 + 0.45 + shaftH / 2, z],
    });
    addBlock(ctx, x, y0 + 0.45 + shaftH, z, 1.15, 0.4, 1.15, { color: PALETTE.steel, moss: 0.4 });
  } else {
    // coluna quebrada: dois tambores, o de cima torto
    const h1 = shaftH * 0.62;
    B.add(new THREE.CylinderGeometry(0.46, 0.5, h1, 8), stone, {
      pos: [x, y0 + 0.45 + h1 / 2, z],
    });
    const h2 = shaftH * 0.3;
    B.add(new THREE.CylinderGeometry(0.4, 0.45, h2, 8), pickStone(rng), {
      pos: [x + 0.06, y0 + 0.45 + h1 + h2 / 2, z - 0.04],
      rot: [0.08, 0.4, -0.1],
    });
    addBlock(ctx, x + 0.8, y0, z + 0.5, 0.6, 0.4, 0.5, { rotY: 0.5, moss: 0.5 });
  }
  ctx.blockers.push({ x, z, r: 1 });
  ctx.hot.push({ x, z });
}

// Arco: dois pilares, aduelas em semicírculo; o lado direito está caído
function addArch(ctx, ax, az) {
  const { B, gy } = ctx;
  const spring = 1.7; // altura do início do arco
  const R = 1.45; // raio até o centro das aduelas
  const yL = gy(ax - R, az) - 0.3;
  const yR = gy(ax + R, az) - 0.3;
  addBlock(ctx, ax - R, yL, az, 1.0, spring, 1.2, { color: PALETTE.steel, moss: 0.2 });
  addBlock(ctx, ax - R, yL, az, 1.3, 0.35, 1.5, { color: PALETTE.slate, moss: 0.1 });
  addBlock(ctx, ax + R, yR, az, 1.0, 1.0, 1.2, { color: PALETTE.steel, moss: 0.6 });
  addBlock(ctx, ax + R, yR, az, 1.3, 0.35, 1.5, { color: PALETTE.slate, moss: 0.1 });
  const n = 9;
  const yTop = yL + spring;
  for (let i = 3; i < n; i++) {
    const th = (Math.PI * (i + 0.5)) / n; // 0 = direita, PI = esquerda
    B.add(chamfer(0.62, 0.8, 1.1), i % 2 ? PALETTE.silver : PALETTE.steel, {
      pos: [ax + R * Math.cos(th), yTop + R * Math.sin(th), az],
      rot: [0, 0, th - Math.PI / 2],
    });
  }
  // aduelas caídas no chão
  addBlock(ctx, ax + 2.2, gy(ax + 2.2, az + 0.6) - 0.2, az + 0.6, 0.7, 0.5, 0.9, {
    rotY: 0.6,
    rotZ: 0.12,
    moss: 0.5,
  });
  addBlock(ctx, ax + 3.0, gy(ax + 3.0, az + 0.1) - 0.2, az + 0.1, 0.8, 0.45, 1.0, { rotY: -0.4 });
  ctx.blockers.push({ x: ax - R, z: az, r: 1 }, { x: ax + R, z: az, r: 1 });
  ctx.hot.push({ x: ax, z: az + 1 });
}

// Muro em ruínas: colunas de blocos com alturas irregulares e vãos
function addWall(ctx, xa, xb, z, hMin, hMax) {
  const { rng, gy } = ctx;
  const step = 1.25;
  const dir = Math.sign(xb - xa) || 1;
  let k = 0;
  for (let x = xa; (x - xb) * dir < 0; x += step * dir, k++) {
    if (k % 5 === 3) continue; // vão no muro
    const wob = Math.sin(k * 1.3) * 0.5 + 0.5;
    const target = hMin + (hMax - hMin) * (rng() * 0.5 + wob * 0.5);
    const rows = Math.max(1, Math.round(target / 0.62));
    const y0 = gy(x, z) - 0.35;
    for (let r = 0; r < rows; r++) {
      addBlock(ctx, x + (rng() - 0.5) * 0.12, y0 + r * 0.62, z + (rng() - 0.5) * 0.1, step * 0.96, 0.62, 1.0, {
        rotY: (rng() - 0.5) * 0.06,
        moss: r === rows - 1 ? 0.5 : 0.05,
      });
    }
    ctx.blockers.push({ x, z, r: 0.8 });
  }
  ctx.hot.push({ x: (xa + xb) / 2, z: z + 1.5 });
}

function addRuins(ctx) {
  const { rng, gy } = ctx;
  // fileira de ruínas atrás da faixa (z -4.5 a -8), cabe no quadro com o topo visível
  addArch(ctx, -2, -4.9);
  addColumn(ctx, 4.2, -5.6, 3.1, false);
  addColumn(ctx, -8.2, -6.2, 2.4, true);
  addColumn(ctx, 8, -6.6, 2.1, true);
  addColumn(ctx, -5.3, -6.6, 2.7, false);
  addWall(ctx, -9.5, -6, -7.6, 0.7, 1.5);
  addWall(ctx, 0, 3.5, -7.4, 0.8, 1.7);
  addWall(ctx, 6, 10, -8, 0.7, 1.5);
  // fundo (fora do quadro em telas estreitas)
  addColumn(ctx, -13, -8, 4.6, false);
  addColumn(ctx, 13.5, -9, 4.2, true);
  addColumn(ctx, 1.5, -11, 6, false);
  addColumn(ctx, -17, -9.5, 4, true);
  addWall(ctx, 14, 22, -8, 0.9, 3.0);
  addWall(ctx, -23, -14, -7, 0.8, 2.6);
  addWall(ctx, -10, -1, -13, 1.2, 4.2);
  addWall(ctx, 4, 11, -12.5, 1.0, 3.4);
  // blocos caídos entre as ruínas (só atrás da faixa)
  for (let i = 0; i < 16; i++) {
    const x = (rng() - 0.5) * 22;
    const z = -4.6 - rng() * 3.4;
    const s = 0.4 + rng() * 0.5;
    addBlock(ctx, x, gy(x, z) - 0.15, z, s * (1 + rng() * 0.6), s * 0.7, s, {
      rotY: rng() * Math.PI,
      rotZ: (rng() - 0.5) * 0.25,
      rotX: (rng() - 0.5) * 0.2,
      moss: 0.3,
    });
    ctx.blockers.push({ x, z, r: s * 0.8 });
  }
}

// ───────── tochas ─────────

function addTorchPost(ctx, x, z) {
  const { B, gy } = ctx;
  const y0 = gy(x, z) - 0.1;
  addBlock(ctx, x, y0 - 0.1, z, 0.55, 0.35, 0.55, { color: PALETTE.slate, moss: 0 });
  B.add(new THREE.CylinderGeometry(0.1, 0.13, 2.1, 6), PALETTE.brown, { pos: [x, y0 + 1.1, z] });
  // braço de suporte e braseiro
  B.add(chamfer(0.5, 0.08, 0.08, 0.02), PALETTE.darkBrown, { pos: [x, y0 + 1.6, z + 0.2], rot: [0, 1.57, 0] });
  B.add(new THREE.CylinderGeometry(0.26, 0.15, 0.28, 6), PALETTE.darkBrown, { pos: [x, y0 + 2.2, z] });
  B.add(new THREE.TorusGeometry(0.22, 0.04, 3, 6), PALETTE.steel, {
    pos: [x, y0 + 2.34, z],
    rot: [Math.PI / 2, 0, 0],
  });
  ctx.blockers.push({ x, z, r: 0.5 });
  return y0 + 2.3; // topo do braseiro
}

function buildFlameGeometry() {
  const F = new Batch();
  F.add(new THREE.ConeGeometry(0.2, 0.6, 6), PALETTE.orange, { pos: [0, 0.3, 0] });
  F.add(new THREE.ConeGeometry(0.14, 0.52, 5), PALETTE.amber, { pos: [0.03, 0.3, 0.02], rot: [0, 0.5, 0] });
  F.add(new THREE.ConeGeometry(0.08, 0.42, 4), PALETTE.gold, { pos: [-0.02, 0.26, 0] });
  return F.geometry();
}

function addTorches(ctx, group) {
  const flameGeo = buildFlameGeometry();
  const flameMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const list = [];
  const spots = [
    { x: -7, z: -4.2, phase: 0.0 },
    { x: 5.2, z: -4.2, phase: 2.1 },
  ];
  for (const s of spots) {
    const top = addTorchPost(ctx, s.x, s.z);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(s.x, top, s.z);
    flame.userData.noOutline = true;
    const light = new THREE.PointLight(PALETTE.amber, 14, 10, 2);
    light.position.set(s.x, top + 0.45, s.z);
    group.add(flame, light);
    list.push({ position: light.position.clone(), light, flame, base: 14, phase: s.phase });
  }
  return { list, flameGeo, flameMat };
}

function flicker(t, phase) {
  // soma de senos incomensuráveis + "ruído" barato: sem Math.random por quadro
  const a = Math.sin(t * 8.1 + phase) * 0.1;
  const b = Math.sin(t * 13.7 + phase * 2.3) * 0.07;
  const c = Math.sin(t * 23.3 + phase * 0.7) * Math.sin(t * 5.9 + phase) * 0.08;
  return 1 + a + b + c;
}

// ───────── árvores, arbustos e props ─────────

function addTree(ctx, x, z, s, kind) {
  const { B, rng, gy } = ctx;
  const y0 = gy(x, z) - 0.2;
  const yaw = rng() * 6;
  B.add(new THREE.CylinderGeometry(0.2 * s, 0.32 * s, 2.2 * s, 6), PALETTE.brown, {
    pos: [x, y0 + 1.0 * s, z],
    jitter: 0.06,
  });
  if (kind === "pine") {
    const tiers = [
      [1.5, 1.6, 1.9, PALETTE.pine],
      [1.15, 1.5, 2.9, PALETTE.forest],
      [0.75, 1.3, 3.8, PALETTE.pine],
    ];
    for (const [r, h, y, c] of tiers) {
      B.add(new THREE.ConeGeometry(r * s, h * s, 7), c, {
        pos: [x, y0 + y * s, z],
        rot: [0, yaw, 0],
        jitter: 0.12,
      });
    }
  } else {
    const blobs = [
      [0, 2.5, 0, 1.35, PALETTE.pine],
      [0.9, 2.9, 0.3, 1.0, PALETTE.forest],
      [-0.8, 3.0, -0.2, 1.05, PALETTE.forest],
      [0.1, 3.6, 0.1, 1.0, PALETTE.forest],
      [0.2, 2.9, -0.8, 0.8, PALETTE.pine],
    ];
    for (const [dx, dy, dz, r, c] of blobs) {
      B.add(new THREE.IcosahedronGeometry(r * s, 1), c, {
        pos: [x + dx * s, y0 + dy * s, z + dz * s],
        scale: [1, 0.85, 1],
        rot: [0, yaw, 0],
        jitter: 0.18,
      });
    }
  }
  ctx.blockers.push({ x, z, r: 0.7 * s });
}

function addBush(ctx, x, z, s) {
  const { B, rng, gy } = ctx;
  const y0 = gy(x, z);
  const cols = [PALETTE.forest, PALETTE.pine, PALETTE.forest];
  for (let i = 0; i < 3; i++) {
    B.add(new THREE.IcosahedronGeometry((0.55 + rng() * 0.2) * s, 0), cols[i], {
      pos: [x + (i - 1) * 0.5 * s, y0 + 0.35 * s + (i === 1 ? 0.2 : 0), z + (rng() - 0.5) * 0.4 * s],
      scale: [1, 0.8, 1],
      rot: [rng(), rng() * 3, 0],
      jitter: 0.1,
    });
  }
  ctx.blockers.push({ x, z, r: 0.8 * s });
}

function addRock(ctx, x, z, s) {
  const { B, rng, gy } = ctx;
  B.add(new THREE.IcosahedronGeometry(0.5 * s, 0), rng() > 0.5 ? PALETTE.steel : PALETTE.silver, {
    pos: [x, gy(x, z) + 0.15 * s, z],
    scale: [1.2, 0.7, 1],
    rot: [rng(), rng() * 6, rng()],
    jitter: 0.12,
  });
  if (rng() > 0.4) {
    B.add(new THREE.IcosahedronGeometry(0.3 * s, 0), PALETTE.slate, {
      pos: [x + 0.55 * s, gy(x, z) + 0.08 * s, z + 0.2 * s],
      scale: [1, 0.7, 1],
      rot: [rng(), rng() * 6, 0],
      jitter: 0.08,
    });
  }
  ctx.blockers.push({ x, z, r: 0.6 * s });
}

function addPot(ctx, x, z, broken) {
  const { B, rng, gy } = ctx;
  const y = gy(x, z);
  if (!broken) {
    B.add(new THREE.CylinderGeometry(0.28, 0.2, 0.35, 7), PALETTE.clay, { pos: [x, y + 0.17, z] });
    B.add(new THREE.CylinderGeometry(0.2, 0.3, 0.3, 7), PALETTE.brown, { pos: [x, y + 0.5, z] });
    B.add(new THREE.CylinderGeometry(0.17, 0.2, 0.1, 7), PALETTE.clay, { pos: [x, y + 0.7, z] });
  } else {
    // cacos
    for (let i = 0; i < 4; i++) {
      B.add(new THREE.TetrahedronGeometry(0.14 + rng() * 0.08, 0), i % 2 ? PALETTE.clay : PALETTE.brown, {
        pos: [x + (rng() - 0.5) * 0.7, y + 0.06, z + (rng() - 0.5) * 0.7],
        rot: [rng() * 3, rng() * 3, rng() * 3],
      });
    }
  }
  ctx.blockers.push({ x, z, r: 0.4 });
}

function addFallenPillar(ctx, x, z) {
  const { B, gy } = ctx;
  const y = gy(x, z) + 0.45;
  B.add(new THREE.CylinderGeometry(0.55, 0.6, 3.6, 8), PALETTE.steel, {
    pos: [x, y, z],
    rot: [0, 0.15, Math.PI / 2],
  });
  B.add(new THREE.CylinderGeometry(0.5, 0.55, 1.3, 8), PALETTE.silver, {
    pos: [x + 2.9, y - 0.05, z + 0.25],
    rot: [0.1, 0.3, Math.PI / 2 + 0.05],
  });
  addBlock(ctx, x - 2.1, gy(x - 2.1, z) - 0.1, z, 1.1, 0.5, 1.1, { rotY: 0.2, moss: 0.7 });
  ctx.blockers.push({ x, z, r: 2.2 });
}

// Poste do estandarte; o pano é um mesh à parte (balança em update)
function addBannerPole(ctx, x, z) {
  const { B, gy } = ctx;
  const y0 = gy(x, z) - 0.1;
  addBlock(ctx, x, y0 - 0.1, z, 0.6, 0.3, 0.6, { color: PALETTE.slate, moss: 0 });
  B.add(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6), PALETTE.brown, { pos: [x, y0 + 1.8, z] });
  B.add(chamfer(1.4, 0.08, 0.08, 0.02), PALETTE.darkBrown, { pos: [x, y0 + 3.3, z] });
  B.add(new THREE.OctahedronGeometry(0.12, 0), PALETTE.gold, { pos: [x, y0 + 3.7, z] });
  ctx.blockers.push({ x, z, r: 0.4 });
  return y0 + 3.3;
}

function buildBanner(x, barY, z) {
  const geo = new THREE.PlaneGeometry(1.15, 1.9, 3, 5);
  const base = geo.attributes.position.array.slice();
  const mat = toonMaterial(PALETTE.crimson, { side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, barY - 0.05 - 0.95, z + 0.02);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  function sway(t) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const k = clamp((0.95 - by) / 1.9, 0, 1); // 0 no topo preso, 1 na ponta
      p.setZ(i, Math.sin(t * 2.1 + bx * 2.4 + k * 3.2) * 0.14 * k * k);
      p.setX(i, bx + Math.sin(t * 1.6 + k * 2) * 0.05 * k);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return { mesh, sway };
}

// Lajes planas e baixas na trilha: ficam rente ao chão, não atrapalham a faixa
// Trilha: faixa de largura constante, só retângulos alinhados aos eixos
const PATH_HALF = 1.5;
const PATH_EDGE = 0.35;

function addPath(ctx) {
  const { B } = ctx;
  const len = WORLD.maxX - WORLD.minX;
  const cx = (WORLD.maxX + WORLD.minX) / 2;
  // miolo em terra batida (um tom só) e duas bordas um pouco mais escuras
  B.add(new THREE.BoxGeometry(len, 0.04, PATH_HALF * 2), PALETTE.brown, { pos: [cx, 0.02, 0] });
  for (const s of [-1, 1]) {
    B.add(new THREE.BoxGeometry(len, 0.04, PATH_EDGE), PALETTE.darkBrown, {
      pos: [cx, 0.021, s * (PATH_HALF + PATH_EDGE / 2)],
    });
  }
}

// Lajes quadradas numa grade de 1.5: poucas, de um tom só, rentes à trilha
function addFlagstones(ctx) {
  const { B, rng } = ctx;
  for (let gx = -8; gx <= 8; gx++) {
    for (const gz of [-0.75, 0.75]) {
      if (rng() < 0.72) continue;
      const x = gx * 1.5;
      B.add(new THREE.BoxGeometry(1.1, 0.06, 1.1), PALETTE.steel, { pos: [x, 0.05, gz] });
      ctx.blockers.push({ x, z: gz, r: 0.6 });
    }
  }
}

function addVegetationAndProps(ctx) {
  // árvores nas laterais e no fundo, enquadrando a cena
  const trees = [
    [-10.5, -7.5, 1.2, "pine"],
    [-9.8, -3.8, 1.0, "round"],
    [10.8, -6.5, 1.2, "pine"],
    [10, -3.9, 1.0, "round"],
    [-24, -14, 1.3, "pine"],
    [-21, -4.5, 1.2, "round"],
    [-24.5, -8, 1.4, "pine"],
    [-17, -16, 1.2, "round"],
    [-8, -17, 1.1, "pine"],
    [-1, -17.5, 1.3, "round"],
    [6, -17, 1.2, "pine"],
    [14, -17, 1.3, "round"],
    [19, -14, 1.2, "pine"],
    [24, -12, 1.5, "pine"],
    [23, -5, 1.3, "round"],
    [-24, 4, 1.1, "round"],
    [-22, 7, 1.0, "pine"],
    [24.5, 5, 1.2, "pine"],
    [22, 8, 0.9, "round"],
  ];
  for (const [x, z, s, kind] of trees) addTree(ctx, x, z, s, kind);
  // arbustos junto às ruínas e no primeiro plano
  const bushes = [
    [-9.2, -5.4, 1],
    [6.4, -5.2, 0.9],
    [9.3, -5.6, 1],
    [-6.8, 5.3, 1],
    [0.2, 5.2, 0.9],
    [-17, 5, 1.2],
    [-18, -5.5, 1.2],
    [16, -6.5, 1.1],
    [21, 3.8, 1],
  ];
  for (const [x, z, s] of bushes) addBush(ctx, x, z, s);
  // pedras: primeiro plano (fora da faixa) e junto às ruínas
  const rocks = [
    [-8.6, 4.6, 1.3],
    [-1.2, 4.4, 0.8],
    [-6.2, 4.3, 0.7],
    [8.8, 4.6, 0.9],
    [-3.8, -5.6, 0.7],
    [2.2, -5.4, 0.8],
    [-14, 5, 1.2],
    [15, -4.4, 1],
    [22, -3.9, 1.2],
  ];
  for (const [x, z, s] of rocks) addRock(ctx, x, z, s);
  addPot(ctx, -5.2, -4.4, false);
  addPot(ctx, 3.2, -4.6, true);
  addPot(ctx, 9.5, -4.6, false);
  addFallenPillar(ctx, -3.4, 5.4);
  addPondRim(ctx);
}

// Borda de pedra em volta do lago, com falhas
function addPondRim(ctx) {
  const { B, rng } = ctx;
  const x0 = BASIN.minX - 0.95;
  const x1 = BASIN.maxX + 0.95;
  const z0 = BASIN.minZ - 0.95;
  const z1 = BASIN.maxZ + 0.95;
  const put = (x, z, along) => {
    if (rng() < 0.22) return;
    const w = 0.7 + rng() * 0.3;
    B.add(chamfer(along ? w : 0.6, 0.32, along ? 0.6 : w, 0.06), rng() < 0.7 ? PALETTE.steel : PALETTE.slate, {
      pos: [x, 0.08, z],
      rot: [0, (rng() - 0.5) * 0.25, 0],
    });
  };
  for (let x = x0; x <= x1; x += 0.95) {
    put(x, z0, true);
    put(x, z1, true);
  }
  for (let z = z0 + 0.95; z < z1 - 0.3; z += 0.95) {
    put(x0, z, false);
    put(x1, z, false);
  }
}

// ───────── grama em billboard ─────────

// Tufo em pixel art desenhado em canvas (32x32, filtro "nearest")
function makeTuftTexture() {
  const size = 32;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const g = cv.getContext("2d");
  const rng = mulberry32(77);
  const shades = [PALETTE.pine, PALETTE.pine, PALETTE.forest];
  const blades = 11;
  for (let b = 0; b < blades; b++) {
    const bx = 4 + Math.floor((b / (blades - 1)) * 24) + Math.floor(rng() * 3 - 1);
    const h = 10 + Math.floor(rng() * 18) - Math.abs(b - blades / 2) * 0.8;
    const lean = (rng() - 0.5) * 8;
    for (let y = 0; y < h; y++) {
      const p = y / h;
      const x = Math.round(bx + lean * p * p);
      const wide = p < 0.55 ? 2 : 1;
      g.fillStyle = shades[p < 0.3 ? 0 : p < 0.7 ? 1 : 2];
      g.fillRect(x, size - 1 - y, wide, 1);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function grassDensity(x, z, ctx) {
  if (
    x > BASIN.minX - 0.6 &&
    x < BASIN.maxX + 0.6 &&
    z > BASIN.minZ - 0.6 &&
    z < BASIN.maxZ + 0.6
  ) {
    return 0;
  }
  const az = Math.abs(z);
  if (az < PATH_HALF + PATH_EDGE + 0.2) return 0; // trilha limpa
  // manchas de grama: ruído de baixa frequência; entre elas, chão aberto
  const patch = Math.sin(x * 0.45 + 1.3) * Math.sin(z * 0.6 - 0.4) + Math.sin((x - z) * 0.3) * 0.5;
  let d = patch > 0.45 ? 0.55 : 0.04;
  if (az < 3.2) d += 0.12; // borda da trilha
  for (const h of ctx.hot) {
    if ((x - h.x) ** 2 + (z - h.z) ** 2 < 6) d += 0.4; // em volta das ruínas
  }
  return Math.min(1, d);
}

function buildGrass(ctx) {
  const rng = mulberry32(2024);
  const MAX = 1500;
  const minDist = 0.75;
  const grid = new Map();
  const pts = [];
  const key = (i, j) => i * 4096 + j;

  for (let attempt = 0; attempt < 24000 && pts.length < MAX; attempt++) {
    const x = WORLD.minX + 0.5 + rng() * (WORLD.maxX - WORLD.minX - 1);
    const z = WORLD.backZ + 0.5 + rng() * (WORLD.frontZ - WORLD.backZ - 1);
    if (rng() > grassDensity(x, z, ctx)) continue;
    if (ctx.blockers.some((b) => (x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r)) continue;
    // Poisson-ish: rejeita pontos perto demais de outros (grade espacial)
    const gi = Math.floor(x / minDist);
    const gj = Math.floor(z / minDist);
    let ok = true;
    for (let di = -1; di <= 1 && ok; di++) {
      for (let dj = -1; dj <= 1 && ok; dj++) {
        const list = grid.get(key(gi + di + 100, gj + dj + 100));
        if (!list) continue;
        for (const p of list) {
          if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < minDist * minDist) {
            ok = false;
            break;
          }
        }
      }
    }
    if (!ok) continue;
    const k = key(gi + 100, gj + 100);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([x, z]);
    pts.push([x, z]);
  }

  // Quad de 1x1 com a base na origem; normal fixa apontando para cima
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const nrm = geo.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);

  const tex = makeTuftTexture();
  const mat = toonMaterial(0xffffff, { map: tex, alphaTest: 0.5 });
  const prevHook = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = function (shader, renderer) {
    if (prevHook) prevHook.call(this, shader, renderer);
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        // billboard cilíndrico: o quad gira em Y para encarar a câmera
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        camRight.y = 0.0;
        camRight = normalize(camRight);
        vec3 tuftPos = instanceMatrix[3].xyz;
        transformed = camRight * position.x + vec3(0.0, position.y, 0.0);
        // vento: balança mais na ponta (uv.y = 1) e varia com a posição
        float tip = uv.y * uv.y;
        float gust = sin(uTime * 1.9 + tuftPos.x * 0.55 + tuftPos.z * 0.35)
                   + 0.5 * sin(uTime * 3.7 + tuftPos.x * 1.3 - tuftPos.z * 0.8);
        transformed += camRight * gust * 0.11 * tip;`,
      );
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : "") + "|grass-billboard";

  const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  pts.forEach(([x, z], i) => {
    const s = 0.55 + rng() * 0.4;
    sc.set(s, s * (0.85 + rng() * 0.3), s);
    mesh.setMatrixAt(i, m.compose(v.set(x, ctx.gy(x, z) - 0.02, z), q, sc));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.castShadow = false; // sombra de quad billboard ficaria errada
  mesh.receiveShadow = true;
  mesh.layers.enable(1); // também na camada 1, sem sair da 0
  mesh.userData.noOutline = true;
  mesh.name = "grass";
  return { mesh, tex, count: pts.length };
}

// ───────── montagem ─────────

export function buildEnvironment(scene) {
  const group = new THREE.Group();
  group.name = "environment";
  const rng = mulberry32(1337);

  const terrain = buildTerrain();
  group.add(terrain.mesh);

  const ctx = {
    B: new Batch(),
    rng,
    gy: terrain.sample,
    blockers: [], // círculos onde não nasce grama
    hot: [], // pontos que atraem mais grama (ruínas)
  };

  addPath(ctx);
  addFlagstones(ctx);
  addRuins(ctx);
  const torchData = addTorches(ctx, group);
  const bannerX = 7.2;
  const bannerZ = -5.2;
  const barY = addBannerPole(ctx, bannerX, bannerZ);
  addVegetationAndProps(ctx);

  // Tudo estático em uma malha só (cor por vértice)
  const staticMesh = new THREE.Mesh(ctx.B.geometry(), vertexColorToon());
  staticMesh.name = "static-scenery";
  staticMesh.castShadow = true;
  staticMesh.receiveShadow = true;
  group.add(staticMesh);

  const banner = buildBanner(bannerX, barY, bannerZ);
  group.add(banner.mesh);

  const grass = buildGrass(ctx);
  group.add(grass.mesh);

  scene.add(group);

  const waterRect = {
    minX: BASIN.minX - 0.45,
    maxX: BASIN.maxX + 0.45,
    minZ: BASIN.minZ - 0.45,
    maxZ: BASIN.maxZ + 0.45,
    y: WATER_Y,
  };

  const torches = torchData.list.map((t) => ({ position: t.position, light: t.light }));

  function update(timeSec) {
    for (const t of torchData.list) {
      const f = flicker(timeSec, t.phase);
      t.light.intensity = t.base * f;
      // a chama estica e encolhe junto com a luz
      t.flame.scale.set(1 + (f - 1) * 0.5, 0.85 + (f - 1) * 2.2, 1 + (f - 1) * 0.5);
      t.flame.rotation.y = timeSec * 0.8 + t.phase;
    }
    banner.sway(timeSec);
  }

  function dispose() {
    scene.remove(group);
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    torchData.flameGeo.dispose();
    torchData.flameMat.dispose();
  }

  return { group, update, torches, waterRect, dispose };
}
