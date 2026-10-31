// Regras de tela: recolhimento padrão e faixa de chão visível pela câmera
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultCollapsed,
  visibleGroundRange,
  halfHeightFor,
} from "../game/src/layout.js";
import { WORLD, LOW_RES_HEIGHT } from "../game/src/three/world.js";

test("itens: sem escolha salva, a barra começa aberta em qualquer tela", () => {
  assert.equal(defaultCollapsed(null), false);
  assert.equal(defaultCollapsed(undefined), false);
});

test("a escolha salva do jogador vence o padrão", () => {
  assert.equal(defaultCollapsed("0"), false);
  assert.equal(defaultCollapsed("1"), true);
});

// O cenário tem de cobrir o que a câmera mostra em qualquer proporção permitida
const CASES = {
  "retrato quadrado 375x375": [375, 375],
  "retrato mínimo 320x260": [320, 260],
  "desktop 1366x768": [1366, 768],
  "ultralarga 2560x700": [2560, 700],
  "paisagem 812x300": [812, 300],
  "tablet 800x850": [800, 850],
  // O CSS limita a altura da arena à largura (max-height: min(100vw, 1280px)):
  // 1:1 é o mais alto que existe, em qualquer largura
  "mais alta permitida 1000x1000": [1000, 1000],
  "mais alta permitida 1280x1280": [1280, 1280],
  "mais alta permitida 320x320": [320, 320],
};

for (const [name, [w, h]] of Object.entries(CASES)) {
  test(`chão cobre a vista: ${name}`, () => {
    const halfH = halfHeightFor(w, h, LOW_RES_HEIGHT, 9);
    const { back, front } = visibleGroundRange(halfH);
    assert.ok(front <= WORLD.frontZ, `frente ${front.toFixed(2)} > ${WORLD.frontZ}`);
    assert.ok(back >= WORLD.backZ, `fundo ${back.toFixed(2)} < ${WORLD.backZ}`);
  });
}

test("meia altura mínima segue o viewHeight em telas largas", () => {
  assert.equal(halfHeightFor(2560, 700, 240, 9), 6.25);
});

test("sem o limite 1:1 o chão não cobriria (por isso o max-height no CSS)", () => {
  const { front } = visibleGroundRange(halfHeightFor(800, 1280, LOW_RES_HEIGHT, 9));
  assert.ok(front > WORLD.frontZ);
});
