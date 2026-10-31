// Efeitos visuais são só dados em state.effects; o renderer 3D (three/effects2d.js) desenha e os remove
import { state } from "./state.js";

// Teto de efeitos vivos: em runs enormes (3×, dezenas de inimigos) a lista crescia sem
// limite e cada texto flutuante custa desenho; passando dele, some o mais velho (já apagando)
export const MAX_EFFECTS = 240;
// Duração (life) conta em quadros de 60 Hz
export const FRAME_MS = 1000 / 60;

export function spawnEffect(type, x, y, opts = {}) {
  const list = state.effects;
  if (list.length >= MAX_EFFECTS) list.splice(0, list.length - MAX_EFFECTS + 1);
  list.push({
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

// Envelhece e remove os que acabaram (sem splice um a um). realMs: tempo real do quadro.
// Pelo menos 1 por quadro, como antes (a 60 Hz ou mais nada muda); com o jogo lento
// envelhece pelo tempo real, senão os efeitos duram mais e se acumulam, deixando o jogo
// ainda mais lento
export function ageEffects(list, realMs = FRAME_MS) {
  const step = Math.max(1, (realMs * 60) / 1000);
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const ef = list[i];
    ef.life -= step;
    if (ef.life > 0) list[w++] = ef;
  }
  list.length = w;
}
