// Partículas em pixel art: retângulos sólidos, só cores da paleta Endesga 32.
// Unidades: px, px/s e px/s². O módulo não toca em window/document.
import { PALETTE as P } from "./palette.js";
import { random } from "./random.js";

export const MAX_PARTICLES = 400;
const MAX_DT = 150; // ms; limita o passo para ficar estável em 3x

const particles = [];

const rnd = (a, b) => a + (b - a) * random();

// Cria uma partícula; a cor muda com a idade. h > 0 faz um traço alto.
function spawn(x, y, vx, vy, life, size, colors, gravity = 0, drag = 0, h = 0) {
  if (particles.length >= MAX_PARTICLES) particles.shift(); // descarta a mais velha
  particles.push({
    x,
    y,
    vx,
    vy,
    gravity,
    drag,
    colors,
    age: 0,
    life,
    size,
    tall: h ? h / size : 1,
  });
}

// Cada gerador recebe (x, y, n, k, dir): n = quantidade, k = fator de velocidade
const HIT = {
  physical: (x, y, n, k, dir) => {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(110, 220) * k;
      spawn(x, y, Math.cos(a) * s + dir * 60, Math.sin(a) * s - 20, rnd(160, 280), rnd(2, 3.4),
        [P.white, P.mist, P.silver], 120, 4);
    }
  },
  fire: (x, y, n, k, dir) => {
    for (let i = 0; i < n; i++) {
      spawn(x + rnd(-6, 6), y + rnd(-4, 4), rnd(-40, 40) * k + dir * 25, rnd(-90, -40) * k,
        rnd(350, 600), rnd(3, 5), [P.amber, P.orange, P.rust, P.brown], -60, 1.5);
    }
  },
  ice: (x, y, n, k, dir) => {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(50, 130) * k;
      spawn(x, y, Math.cos(a) * s + dir * 40, Math.sin(a) * s - 50, rnd(350, 550), rnd(2.5, 4),
        [P.white, P.cyan, P.blue], 520, 1);
    }
  },
  lightning: (x, y, n, k, dir) => {
    const m = Math.max(3, Math.round(n * 0.6));
    for (let i = 0; i < m; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(330, 520) * k;
      spawn(x, y, Math.cos(a) * s + dir * 80, Math.sin(a) * s, rnd(80, 140), 2,
        [P.white, P.cyan], 0, 2, 5);
    }
  },
  shadow: (x, y, n, k, dir) => {
    for (let i = 0; i < n; i++) {
      spawn(x + rnd(-8, 8), y + rnd(-8, 8), rnd(-25, 25) * k + dir * 15, rnd(-40, -10) * k,
        rnd(500, 800), rnd(3, 5), [P.magenta, P.plum, P.darkBrown], 0, 1.2);
    }
  },
  water: (x, y, n, k, dir) => {
    for (let i = 0; i < n; i++) {
      spawn(x, y, rnd(-90, 90) * k + dir * 50, rnd(-170, -70) * k, rnd(350, 550), rnd(2.5, 4),
        [P.cyan, P.blue, P.navy], 520, 0.5);
    }
  },
  poison: (x, y, n, k, dir) => {
    for (let i = 0; i < n; i++) {
      spawn(x + rnd(-8, 8), y + rnd(-6, 6), rnd(-20, 20) * k + dir * 10, rnd(-50, -20) * k,
        rnd(500, 800), rnd(3, 5), [P.green, P.forest, P.pine], 0, 1);
    }
  },
  holy: (x, y, n, k, dir) => {
    for (let i = 0; i < n; i++) {
      spawn(x + rnd(-8, 8), y + rnd(-8, 8), rnd(-20, 20) * k + dir * 10, rnd(-70, -30) * k,
        rnd(500, 800), rnd(2.5, 4), [P.white, P.gold, P.amber], -20, 1.2);
    }
  },
};

function ring(x, y, n, radius, speed, life, size, colors) {
  const off = random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    spawn(x + Math.cos(a) * radius, y + Math.sin(a) * radius,
      Math.cos(a) * speed, Math.sin(a) * speed, life, size, colors, 0, 3);
  }
}

// base: partículas num burst normal (intensity 0.5)
const KIND_DEFS = {
  hit: {
    base: 9,
    fn: (x, y, n, k, dir, opts) => (HIT[opts.element] || HIT.physical)(x, y, n, k, dir),
  },
  blood: {
    base: 7,
    fn: (x, y, n, k, dir) => {
      for (let i = 0; i < n; i++) {
        spawn(x, y, rnd(-70, 70) * k + dir * 70, rnd(-150, -40) * k, rnd(350, 600), rnd(2, 3.5),
          [P.red, P.crimson, P.brown], 650, 0.3);
      }
    },
  },
  death: {
    base: 16,
    fn: (x, y, n, k, dir) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(60, 190) * k;
        const ember = i % 4 === 0;
        spawn(x, y, Math.cos(a) * s + dir * 50, Math.sin(a) * s - 60, rnd(400, 700),
          rnd(3, 5), ember ? [P.amber, P.orange, P.rust] : [P.bone, P.mist, P.silver, P.steel],
          380, 1.5);
      }
      const puff = Math.max(3, Math.round(n * 0.3));
      for (let i = 0; i < puff; i++) {
        spawn(x + rnd(-10, 10), y + rnd(-6, 6), rnd(-15, 15), rnd(-45, -20), rnd(700, 1000),
          rnd(5, 7), [P.steel, P.slate, P.deepBlue], 0, 1);
      }
    },
  },
  dot: {
    base: 2,
    fn: (x, y, n, k, dir, opts) => {
      const e = opts.element;
      const colors = e === "poison" ? [P.green, P.forest, P.pine]
        : e === "bleeding" ? [P.red, P.crimson, P.brown]
          : [P.amber, P.orange, P.rust];
      const fall = e === "bleeding";
      for (let i = 0; i < n; i++) {
        spawn(x + rnd(-8, 8), y + rnd(-8, 8), rnd(-12, 12), fall ? rnd(-20, 0) : rnd(-45, -20),
          rnd(350, 600), rnd(2, 3.5), colors, fall ? 400 : 0, 1);
      }
    },
  },
  heal: {
    base: 8,
    fn: (x, y, n, k) => {
      for (let i = 0; i < n; i++) {
        spawn(x + rnd(-14, 14), y + rnd(-10, 10), rnd(-10, 10), rnd(-80, -40) * k,
          rnd(600, 900), rnd(2.5, 4), [P.white, P.green, P.forest], 0, 0.8);
      }
    },
  },
  mana: {
    base: 8,
    fn: (x, y, n, k) => {
      for (let i = 0; i < n; i++) {
        spawn(x + rnd(-14, 14), y + rnd(-10, 10), rnd(-10, 10), rnd(-80, -40) * k,
          rnd(600, 900), rnd(2.5, 4), [P.white, P.cyan, P.blue], 0, 0.8);
      }
    },
  },
  shield: {
    base: 8,
    fn: (x, y, n, k) => ring(x, y, n, 12, 50 * k, rnd(300, 420), 3, [P.white, P.mist, P.silver]),
  },
  barrier: {
    base: 12,
    fn: (x, y, n, k) => ring(x, y, n, 16, 35 * k, rnd(450, 650), 3, [P.cyan, P.blue, P.teal]),
  },
  frenzy: {
    base: 8,
    fn: (x, y, n, k) => {
      for (let i = 0; i < n; i++) {
        spawn(x + rnd(-14, 14), y + rnd(-14, 14), rnd(-20, 20), rnd(-110, -50) * k,
          rnd(400, 650), rnd(2.5, 4.5), [P.red, P.crimson, P.brown], -40, 1);
      }
    },
  },
  // Gelo: estilhaços azuis; "ice" no inimigo, "iceBurst" em volta do herói
  freeze: {
    base: 12,
    fn: (x, y, n, k) => {
      for (let i = 0; i < n; i++) {
        spawn(x + rnd(-12, 12), y + rnd(-14, 14), rnd(-40, 40) * k, rnd(-90, -10) * k,
          rnd(450, 800), rnd(2.5, 4), [P.white, P.cyan, P.blue], 120, 1.5);
      }
    },
  },
  iceBurst: {
    base: 28,
    fn: (x, y, n, k) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(120, 280) * k;
        spawn(x, y, Math.cos(a) * s, Math.sin(a) * s * 0.6 - 30, rnd(400, 750),
          rnd(3, 5), i % 3 ? [P.white, P.cyan, P.blue] : [P.mist, P.teal, P.blue], 200, 2);
      }
      ring(x, y, Math.round(n * 0.6), 20, 140 * k, rnd(350, 500), 3, [P.white, P.cyan]);
    },
  },
  crit: {
    base: 8,
    fn: (x, y, n, k, dir) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(100, 220) * k;
        spawn(x, y, Math.cos(a) * s + dir * 40, Math.sin(a) * s, rnd(180, 320), rnd(2, 3.5),
          [P.white, P.gold, P.amber], 0, 3);
      }
    },
  },
  dodge: {
    base: 6,
    fn: (x, y, n, k, dir) => {
      for (let i = 0; i < n; i++) {
        spawn(x + rnd(-8, 8), y + rnd(-14, 14), -dir * rnd(40, 110) * k, rnd(-15, 15),
          rnd(250, 420), rnd(3, 5), [P.mist, P.silver, P.steel], 0, 3);
      }
    },
  },
  revive: {
    base: 18,
    fn: (x, y, n, k) => {
      for (let i = 0; i < n; i++) {
        spawn(x + rnd(-12, 12), y + rnd(-6, 6), rnd(-70, 70) * k, rnd(-230, -90) * k,
          rnd(600, 950), rnd(3, 5),
          i % 2 ? [P.white, P.gold, P.amber] : [P.gold, P.amber, P.orange], 150, 1.5);
      }
    },
  },
};

export const KINDS = Object.keys(KIND_DEFS);

export function emit(kind, x, y, opts = {}) {
  const def = KIND_DEFS[kind];
  if (!def) return;
  const intensity = opts.intensity == null ? 0.5 : Math.min(1, Math.max(0, opts.intensity));
  const n = opts.count != null
    ? Math.max(0, Math.round(opts.count))
    : Math.max(1, Math.round(def.base * (0.5 + intensity)));
  const k = 0.75 + 0.5 * intensity;
  const dir = opts.direction < 0 ? -1 : opts.direction > 0 ? 1 : 0;
  def.fn(x, y, n, k, dir, opts);
}

export function update(dt) {
  const ms = Math.min(Math.max(dt, 0), MAX_DT);
  const s = ms / 1000;
  let w = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.age += ms;
    if (p.age >= p.life) continue; // morreu: não copia
    p.vy += p.gravity * s;
    const f = Math.max(0, 1 - p.drag * s);
    p.vx *= f;
    p.vy *= f;
    p.x += p.vx * s;
    p.y += p.vy * s;
    particles[w++] = p;
  }
  particles.length = w;
}

export function draw(ctx) {
  let last = null;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const t = p.age / p.life;
    const size = Math.max(1, Math.round(p.size * (1 - t * 0.6)));
    const h = Math.max(1, Math.round(size * p.tall));
    const c = p.colors[Math.min(p.colors.length - 1, Math.floor(t * p.colors.length))];
    if (c !== last) {
      ctx.fillStyle = c;
      last = c;
    }
    ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - h / 2), size, h);
  }
}

export function clear() {
  particles.length = 0;
}

export function count() {
  return particles.length;
}

// Acesso somente para testes/depuração
export function snapshot() {
  return particles;
}
