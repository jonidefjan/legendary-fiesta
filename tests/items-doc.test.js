// docs/items.md é gerado por scripts/items-doc.mjs; este teste falha se ficou desatualizado
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildItemsDoc } from "../scripts/items-doc.mjs";

test("docs/items.md está em dia (rode npm run docs:items)", async () => {
  const expected = await buildItemsDoc();
  const actual = readFileSync(new URL("../docs/items.md", import.meta.url), "utf8");
  assert.equal(actual.replace(/\r\n/g, "\n"), expected.replace(/\r\n/g, "\n"));
});
