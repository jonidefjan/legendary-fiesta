// Efeitos visuais são só dados em state.effects; o renderer 3D (three/effects2d.js) desenha e os remove
import { state } from "./state.js";

export function spawnEffect(type, x, y, opts = {}) {
  state.effects.push({
    type,
    x,
    y,
    life: opts.life || 40,
    maxLife: opts.life || 40,
    ...opts,
  });
}

export function spawnNumber(x, y, text, color, size = 0) {
  spawnEffect("number", x, y, {
    text: String(text),
    color,
    size,
    life: 60,
    maxLife: 60,
  });
}
