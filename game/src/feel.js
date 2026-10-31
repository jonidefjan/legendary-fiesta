// "Game feel": tremida de tela (trauma) e hit-stop (congelamento curto no impacto).
// Lógica pura, sem DOM: roda nos testes do Node. Tudo avança em tempo real,
// sem depender da velocidade do jogo.
import { random } from "./random.js";

export const MAX_OFFSET = 8; // px, antes da pixelização
export const TRAUMA_DECAY = 1.6; // por segundo
export const MAX_HITSTOP = 120; // ms
// Depois de um congelamento, um intervalo sem novos: em 2×/3× com builds fortes,
// golpes seguidos congelariam o jogo quase o tempo todo
export const HITSTOP_COOLDOWN = 150; // ms
export const PREFS_KEY = "reliquary_prefs";

let trauma = 0;
let freezeMs = 0;
let cooldownMs = 0;
let shakeOn = true;

export function addShake(amount) {
  trauma = Math.min(1, trauma + amount);
}

// Nunca soma: vale o maior entre o que resta e o novo. speed: velocidade do jogo,
// encurta o congelamento para 2×/3× não ficarem mais lentos que 1×.
export function hitStop(ms, speed = 1) {
  const scaled = ms / Math.max(1, speed);
  if (freezeMs <= 0 && cooldownMs > 0) return;
  freezeMs = Math.min(MAX_HITSTOP, Math.max(freezeMs, scaled));
  cooldownMs = freezeMs + HITSTOP_COOLDOWN;
}

export function getTrauma() {
  return trauma;
}

export function setShakeEnabled(on) {
  shakeOn = !!on;
}

export function isShakeEnabled() {
  return shakeOn;
}

export function reset() {
  trauma = 0;
  freezeMs = 0;
  cooldownMs = 0;
}

// realDt em ms. Devolve o deslocamento da câmera e se a simulação congela neste quadro.
export function update(realDt) {
  realDt = Math.max(0, realDt);
  const frozen = freezeMs > 0;
  freezeMs = Math.max(0, freezeMs - realDt);
  cooldownMs = Math.max(0, cooldownMs - realDt);

  let x = 0;
  let y = 0;
  if (shakeOn && trauma > 0) {
    const amp = MAX_OFFSET * trauma * trauma;
    x = Math.round(amp * (random() * 2 - 1));
    y = Math.round(amp * (random() * 2 - 1));
  }
  trauma = Math.max(0, trauma - (TRAUMA_DECAY * realDt) / 1000);
  return { x, y, frozen };
}

// ─── Preferências (storage e matchMedia injetáveis) ───
function reducedMotion(matchMedia) {
  try {
    return !!matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}

// Escolha salva vence; sem ela, desligado se o sistema pede menos movimento
export function loadPrefs(storage, matchMedia) {
  let shake = !reducedMotion(matchMedia);
  try {
    const saved = JSON.parse(storage?.getItem(PREFS_KEY));
    if (saved && typeof saved.shake === "boolean") shake = saved.shake;
  } catch {
    // JSON corrompido ou storage indisponível: fica o padrão
  }
  shakeOn = shake;
  return { shake };
}

export function savePrefs(storage) {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify({ shake: shakeOn }));
  } catch {
    // storage cheio ou bloqueado: a escolha vale só nesta sessão
  }
}
