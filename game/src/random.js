// Fonte de aleatoriedade trocável, para os testes serem determinísticos
let source = Math.random;

export function random() {
  return source();
}

export function setRandom(fn) {
  source = fn || Math.random;
}
