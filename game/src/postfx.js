// Pós-processamento WebGL: pixeliza, aplica dithering Bayer e quantiza para
// a paleta. O jogo desenha em 2D num canvas "source"; aqui ele vira textura.
import { ENDESGA_32 } from "./palette.js";

export function hexToRgb01(hex) {
  let h = String(hex).trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function paletteToFloatArray(palette) {
  const out = new Float32Array(palette.length * 3);
  palette.forEach((hex, i) => out.set(hexToRgb01(hex), i * 3));
  return out;
}

// Matriz de Bayer 4x4 normalizada em [0, 1), linha a linha.
const BAYER_RAW = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const BAYER_4X4 = BAYER_RAW.map((v) => (v + 0.5) / 16);

export const VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// GLSL ES 1.00: compila em WebGL1 e WebGL2.
export const FRAGMENT_SHADER = `
// highp onde existir: em mediump (celulares) a posição dos blocos erra em telas largas
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform float uPixelSize;
uniform float uDither;
uniform float uEnabled;
uniform vec3 uPalette[32];
uniform float uBayer[16];

float bayerAt(vec2 block) {
  float x = mod(block.x, 4.0);
  float y = mod(block.y, 4.0);
  float idx = y * 4.0 + x;
  float v = 0.0;
  for (int i = 0; i < 16; i++) {
    if (abs(float(i) - idx) < 0.5) v = uBayer[i];
  }
  return v;
}

// Distância "redmean": aproxima a percepção sem escurecer demais as sombras.
float colorDist(vec3 a, vec3 b) {
  float rm = (a.r + b.r) * 0.5;
  vec3 d = a - b;
  return (2.0 + rm) * d.r * d.r + 4.0 * d.g * d.g + (3.0 - rm) * d.b * d.b;
}

void main() {
  // Origem no topo esquerdo, igual ao canvas 2D (sem inverter a textura).
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  if (uEnabled < 0.5) {
    gl_FragColor = vec4(texture2D(uTex, uv).rgb, 1.0);
    return;
  }
  vec2 px = uv * uResolution;
  vec2 block = floor(px / uPixelSize);
  vec2 center = (block + 0.5) * uPixelSize;
  vec3 c = texture2D(uTex, center / uResolution).rgb;
  c += (bayerAt(block) - 0.5) * uDither * 0.25;
  c = clamp(c, 0.0, 1.0);
  vec3 best = uPalette[0];
  float bestD = 100.0; // distância máxima real é ~9; 1e9 estoura em mediump
  for (int i = 0; i < 32; i++) {
    float d = colorDist(c, uPalette[i]);
    if (d < bestD) {
      bestD = d;
      best = uPalette[i];
    }
  }
  gl_FragColor = vec4(best, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "falha ao compilar shader");
  }
  return sh;
}

export function createPostFX(
  display,
  { palette = ENDESGA_32, pixelSize = 3, dither = 0.5 } = {},
) {
  let gl = null;
  try {
    const opts = {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    };
    gl = display.getContext("webgl2", opts) || display.getContext("webgl", opts);
  } catch (err) {
    gl = null;
  }
  if (!gl) return null;

  const source = document.createElement("canvas");
  source.width = display.width;
  source.height = display.height;

  const paletteData = paletteToFloatArray(palette);
  const settings = { enabled: true, pixelSize, dither };
  let lost = false;
  let program = null;
  let texture = null;
  let buffer = null;
  let loc = {};

  // Cria programa, buffer, textura e uniforms (também após restore).
  function setup() {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || "falha ao linkar programa");
    }
    program = prog;
    gl.useProgram(program);

    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    loc = {
      tex: gl.getUniformLocation(program, "uTex"),
      res: gl.getUniformLocation(program, "uResolution"),
      pixel: gl.getUniformLocation(program, "uPixelSize"),
      dither: gl.getUniformLocation(program, "uDither"),
      enabled: gl.getUniformLocation(program, "uEnabled"),
      palette: gl.getUniformLocation(program, "uPalette"),
      bayer: gl.getUniformLocation(program, "uBayer"),
    };
    gl.uniform1i(loc.tex, 0);
    gl.uniform3fv(loc.palette, paletteData);
    gl.uniform1fv(loc.bayer, new Float32Array(BAYER_4X4));
    gl.viewport(0, 0, display.width, display.height);
  }

  try {
    setup();
  } catch (err) {
    console.warn("postfx: WebGL indisponível, usando canvas 2D.", err);
    return null;
  }

  display.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
  });
  display.addEventListener("webglcontextrestored", () => {
    try {
      setup();
      lost = false;
    } catch (err) {
      console.warn("postfx: falha ao restaurar o contexto WebGL.", err);
    }
  });

  return {
    source,
    resize(width, height) {
      const w = Math.max(1, Math.floor(width));
      const h = Math.max(1, Math.floor(height));
      source.width = w;
      source.height = h;
      display.width = w;
      display.height = h;
      if (!lost) gl.viewport(0, 0, w, h);
    },
    render() {
      if (lost || (gl.isContextLost && gl.isContextLost())) return;
      try {
        gl.useProgram(program);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.uniform2f(loc.res, source.width, source.height);
        gl.uniform1f(loc.pixel, settings.pixelSize);
        gl.uniform1f(loc.dither, settings.dither);
        gl.uniform1f(loc.enabled, settings.enabled ? 1 : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } catch (err) {
        // nunca derruba o loop do jogo
      }
    },
    setEnabled(on) {
      settings.enabled = !!on;
    },
    isEnabled() {
      return settings.enabled;
    },
    setPixelSize(n) {
      settings.pixelSize = Math.max(1, Number(n) || 1);
    },
    setDither(x) {
      settings.dither = Math.min(1, Math.max(0, Number(x) || 0));
    },
  };
}
