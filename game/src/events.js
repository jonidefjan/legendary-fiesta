// Barramento de eventos: a lógica do jogo avisa; interface e áudio reagem.
// Assim combat.js e items.js não tocam no DOM e rodam nos testes do Node.
const listeners = new Map();

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(fn);
  return () => off(type, fn);
}

export function off(type, fn) {
  const list = listeners.get(type);
  if (list) listeners.set(type, list.filter((f) => f !== fn));
}

export function emit(type, payload) {
  for (const fn of listeners.get(type) || []) fn(payload);
}

export function clearListeners() {
  listeners.clear();
}

export const log = (msg, type = "") => emit("log", { msg, type });
// detail: complemento do som, como o elemento do golpe ou o tipo do efeito usado
export const sound = (name, detail) => emit("sfx", { name, detail });
