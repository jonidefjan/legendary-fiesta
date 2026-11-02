// Tela inicial: comprar na loja redesenha a tela sem voltar a rolagem para o topo
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { state } from "../game/src/state.js";
import { UPGRADES } from "../game/src/meta.js";
import { showTitle } from "../game/src/ui-title.js";

// DOM mínimo: cada innerHTML cria um painel novo, com a rolagem no zero, como no navegador
function fakeScreen() {
  const el = {
    dataset: {},
    style: {},
    scroller: { scrollTop: 0 },
    addEventListener(type, fn) {
      this.onClick = fn;
    },
    querySelector(selector) {
      return selector === ".title-content" ? this.scroller : null;
    },
    set innerHTML(_html) {
      this.scroller = { scrollTop: 0 };
    },
  };
  return el;
}

const originalDocument = globalThis.document;
after(() => {
  globalThis.document = originalDocument;
});

function openShop() {
  const el = fakeScreen();
  globalThis.document = { getElementById: () => el, activeElement: null };
  state.meta = { upgrades: {}, unlockedItems: [], best: { wave: 0, score: 0 } };
  state.fragments = 100000;
  showTitle({ canContinue: true, onContinue() {}, onNewRun() {} });
  return el;
}

const clickOn = (el, dataset) =>
  el.onClick({ target: { closest: () => ({ dataset, disabled: false }) } });

test("loja: comprar uma melhoria mantém a posição da rolagem", () => {
  const el = openShop();
  el.scroller.scrollTop = 420;
  const before = el.scroller;
  clickOn(el, { buy: UPGRADES[0].id });
  assert.notEqual(el.scroller, before, "a tela foi redesenhada");
  assert.equal(el.scroller.scrollTop, 420);
});

test("loja: compra recusada não redesenha nem mexe na rolagem", () => {
  const el = openShop();
  state.fragments = 0;
  el.scroller.scrollTop = 420;
  const before = el.scroller;
  clickOn(el, { buy: UPGRADES[0].id });
  assert.equal(el.scroller, before);
  assert.equal(el.scroller.scrollTop, 420);
});
