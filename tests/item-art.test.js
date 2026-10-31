import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEMS } from "./helpers.js";
import { ART_PALETTE, ITEM_ART, ITEM_ELEMENTS, ELEMENT_ART } from "../game/src/item-art.js";
import {
  itemSpriteURL,
  elementSpriteURL,
  itemElement,
  itemIconHTML,
} from "../game/src/sprites.js";

const ids = ITEMS.map((i) => i.id);

test("todo item do items.json tem arte, e não sobra arte de item inexistente", () => {
  assert.deepEqual(
    ids.filter((id) => !ITEM_ART[id]),
    [],
    "itens sem arte",
  );
  assert.deepEqual(
    Object.keys(ITEM_ART).filter((id) => !ids.includes(id)),
    [],
    "arte sem item",
  );
});

test("cada arte de item tem 16 linhas de 16 caracteres", () => {
  for (const [id, rows] of Object.entries(ITEM_ART)) {
    assert.equal(rows.length, 16, `${id}: linhas`);
    rows.forEach((row, y) => assert.equal(row.length, 16, `${id}: linha ${y}`));
  }
});

test("cada símbolo de elemento tem 7 linhas de 7 caracteres", () => {
  for (const [name, rows] of Object.entries(ELEMENT_ART)) {
    assert.equal(rows.length, 7, `${name}: linhas`);
    rows.forEach((row, y) => assert.equal(row.length, 7, `${name}: linha ${y}`));
  }
});

test("todos os caracteres usados existem na paleta, e as cores são hex válidas", () => {
  for (const [ch, color] of Object.entries(ART_PALETTE)) {
    assert.equal(ch.length, 1, `chave "${ch}" deve ter 1 caractere`);
    assert.ok(color === null || /^#[0-9a-f]{6}$/i.test(color), `cor inválida de "${ch}"`);
  }
  assert.equal(ART_PALETTE["."], null, '"." é transparente');
  const all = [...Object.entries(ITEM_ART), ...Object.entries(ELEMENT_ART)];
  for (const [name, rows] of all) {
    for (const ch of rows.join("")) {
      assert.ok(ch in ART_PALETTE, `${name}: caractere "${ch}" fora da paleta`);
    }
  }
});

test("a arte não é vazia e todo item tem contorno escuro", () => {
  const outline = Object.entries(ART_PALETTE).find(([, c]) => c && c.toLowerCase() === "#120d0a");
  for (const [id, rows] of Object.entries(ITEM_ART)) {
    const filled = rows.join("").split("").filter((ch) => ART_PALETTE[ch]).length;
    assert.ok(filled >= 20, `${id}: arte quase vazia (${filled} pixels)`);
    if (outline) assert.ok(rows.join("").includes(outline[0]), `${id}: sem contorno`);
  }
});

test("ITEM_ELEMENTS só aponta para itens e símbolos que existem", () => {
  for (const [id, element] of Object.entries(ITEM_ELEMENTS)) {
    assert.ok(ids.includes(id), `${id} não é item`);
    assert.ok(ELEMENT_ART[element], `${id}: símbolo "${element}" inexistente`);
  }
});

test("todo item com dmgType elemental ou efeito elemental tem selo", () => {
  for (const item of ITEMS) {
    const types = new Set();
    if (item.dmgType && item.dmgType !== "physical") types.add(item.dmgType);
    for (const e of item.effects || []) if (e.element) types.add(e.element);
    if (types.size > 0) assert.ok(ITEM_ELEMENTS[item.id], `${item.id} deveria ter elemento`);
  }
  assert.equal(ITEM_ELEMENTS.ember_heart, "fire");
  assert.equal(ITEM_ELEMENTS.blast_core, "fire");
  assert.equal(ITEM_ELEMENTS.crystal_armor, "ice");
});

test("sem DOM, os sprites devolvem null e o ícone cai no emoji", () => {
  assert.equal(typeof document, "undefined");
  assert.equal(itemSpriteURL("rusted_sword"), null);
  assert.equal(elementSpriteURL("fire"), null);
  assert.equal(itemSpriteURL("nao_existe"), null);
  assert.equal(itemElement("ember_blade"), ITEM_ELEMENTS.ember_blade ?? null);
  const item = ITEMS.find((i) => i.id === "rusted_sword");
  assert.equal(itemIconHTML(item), item.icon);
});
