import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ITEMS, memoryStorage } from "./helpers.js";
import {
  t,
  hasKey,
  getLang,
  setLang,
  initLang,
  setLangQuiet,
  normalizeLang,
  DICTS,
  LANGS,
  DEFAULT_LANG,
} from "../game/src/i18n.js";
import { on, clearListeners } from "../game/src/events.js";
import { findItem, localizeItems, getTypeLabel, RARITIES } from "../game/src/items.js";
import { ENEMY_TYPES, enemyName } from "../game/src/waves.js";
import { BOSS_TYPES } from "../game/src/boss.js";
import { UPGRADES, describeLevel, upgradeName, upgradeDesc } from "../game/src/meta.js";

const GAME = new URL("../game/", import.meta.url);
const en = DICTS.en;
const pt = DICTS["pt-BR"];

beforeEach(() => {
  clearListeners();
  setLangQuiet("pt-BR"); // padrão dos testes do projeto (ver helpers.js)
});
afterEach(() => setLangQuiet("pt-BR"));

// ─── Locales ───
test("en e pt-BR têm exatamente as mesmas chaves, e nenhum valor vazio", () => {
  assert.deepEqual(
    Object.keys(en).filter((k) => !(k in pt)),
    [],
    "chaves só em en",
  );
  assert.deepEqual(
    Object.keys(pt).filter((k) => !(k in en)),
    [],
    "chaves só em pt-BR",
  );
  for (const [lang, dict] of Object.entries(DICTS)) {
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, "string", `${lang}: ${key}`);
      assert.ok(value.trim().length > 0, `${lang}: ${key} vazio`);
    }
  }
});

test("os placeholders {x} de cada chave são os mesmos nos dois idiomas", () => {
  const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(en)) {
    assert.deepEqual(holes(pt[key]), holes(en[key]), key);
  }
});

test("todo item do items.json tem nome, descrição e efeito nos dois idiomas", () => {
  assert.ok(ITEMS.length > 0);
  for (const it of ITEMS) {
    for (const field of ["name", "desc", "effect"]) {
      for (const [lang, dict] of Object.entries(DICTS)) {
        assert.ok(dict[`items.${it.id}.${field}`], `${lang}: ${it.id}.${field}`);
      }
    }
    // Encantamento: existe nos dois idiomas ou em nenhum
    const key = `items.${it.id}.enchant`;
    assert.equal(key in en, key in pt, `${it.id}: enchant só num idioma`);
  }
});

test("o items.json guarda só números, ícones e ids (sem texto)", () => {
  const raw = JSON.parse(readFileSync(new URL("assets/items.json", GAME), "utf8"));
  for (const it of raw) {
    for (const field of ["name", "desc", "effect", "enchant"]) {
      assert.ok(!(field in it), `${it.id} ainda tem ${field}`);
    }
  }
});

function jsFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith(".js"))
    .map((f) => join(f.parentPath, f.name));
}

test("toda chave usada em t(...) e data-i18n existe nos dois idiomas", () => {
  const used = new Set();
  for (const file of jsFiles(new URL("src/", GAME))) {
    const src = readFileSync(file, "utf8");
    // Todo literal "a.b" até 200 caracteres depois de t( vale como chave: pega também
    // as escolhidas em ternários, como t(cond ? "a.b" : "a.c")
    for (const m of src.matchAll(/\bt\(/g)) {
      const window = src.slice(m.index, m.index + 200);
      for (const k of window.matchAll(/"([a-z][\w]*(?:\.\w+)+)"/g)) used.add(k[1]);
    }
  }
  const html = readFileSync(new URL("index.html", GAME), "utf8");
  for (const m of html.matchAll(/data-i18n="([\w.]+)"/g)) used.add(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split(";")) used.add(pair.split(":")[1].trim());
  }
  assert.ok(used.size > 40, "a varredura achou as chaves");
  for (const key of used) {
    for (const [lang, dict] of Object.entries(DICTS)) {
      // Chaves de plural existem como key.one / key.other
      assert.ok(key in dict || `${key}.other` in dict, `${lang}: falta "${key}"`);
    }
  }
});

test("chaves montadas em tempo de execução existem (inimigos, melhorias, tipos, raridades)", () => {
  const keys = ["enemies.summoned"];
  for (const e of [...ENEMY_TYPES, ...Object.values(BOSS_TYPES)]) keys.push(`enemies.${e.kind}`);
  for (const u of UPGRADES) keys.push(`upgrades.${u.id}.name`, `upgrades.${u.id}.desc`);
  for (const type of ["weapon", "armor", "relic"]) keys.push(`type.${type}`);
  for (const r of Object.keys(RARITIES)) keys.push(`rarity.${r}`);
  for (const d of ["burning", "poison", "bleeding", "generic"]) keys.push(`dot.${d}`);
  for (const key of keys) assert.ok(key in en && key in pt, key);
});

// ─── normalizeLang e idioma inicial ───
test("normalizeLang aceita variações e rejeita o resto", () => {
  assert.equal(normalizeLang("pt"), "pt-BR");
  assert.equal(normalizeLang("pt-br"), "pt-BR");
  assert.equal(normalizeLang("PT-BR"), "pt-BR");
  assert.equal(normalizeLang("en"), "en");
  assert.equal(normalizeLang("en-US"), "en");
  assert.equal(normalizeLang("EN-gb"), "en");
  assert.equal(normalizeLang("fr"), null);
  assert.equal(normalizeLang(""), null);
  assert.equal(normalizeLang(null), null);
  assert.deepEqual(LANGS, ["en", "pt-BR"]);
  assert.equal(DEFAULT_LANG, "en");
});

test("initLang: URL > storage > padrão (en)", () => {
  assert.equal(initLang({ search: "", storage: memoryStorage() }), "en");
  assert.equal(getLang(), "en");
  assert.equal(initLang({ search: "", storage: memoryStorage({ lang: "pt-BR" }) }), "pt-BR");
  assert.equal(initLang({ search: "?lang=en", storage: memoryStorage({ lang: "pt-BR" }) }), "en");
  assert.equal(initLang({ search: "?lang=pt", storage: memoryStorage({ lang: "en" }) }), "pt-BR");
  // valor inválido na URL ou no storage cai no próximo da fila
  assert.equal(initLang({ search: "?lang=xx", storage: memoryStorage({ lang: "pt-BR" }) }), "pt-BR");
  assert.equal(initLang({ search: "?lang=xx", storage: memoryStorage({ lang: "zz" }) }), "en");
});

test("initLang não grava no storage (só a escolha no botão grava); setLang grava a chave lang", () => {
  const storage = memoryStorage();
  initLang({ search: "?lang=pt-BR", storage });
  assert.deepEqual(storage.data, {});
  setLang("pt-BR", { storage });
  assert.equal(storage.data.lang, "pt-BR");
  setLang("en", { storage });
  assert.equal(storage.data.lang, "en");
});

test("storage que lança erro não quebra initLang nem setLang", () => {
  const broken = {
    getItem() {
      throw new Error("bloqueado");
    },
    setItem() {
      throw new Error("bloqueado");
    },
  };
  assert.equal(initLang({ search: "", storage: broken }), "en");
  assert.equal(setLang("pt-BR", { storage: broken }), "pt-BR");
  assert.equal(getLang(), "pt-BR");
});

test("setLang emite langChange com o idioma novo", () => {
  const seen = [];
  on("langChange", (lang) => seen.push(lang));
  setLang("en", { storage: memoryStorage() });
  setLang("pt", { storage: memoryStorage() });
  assert.deepEqual(seen, ["en", "pt-BR"]);
});

// ─── t() ───
test("t: idioma atual, interpolação e chave ausente", () => {
  setLangQuiet("en");
  assert.equal(t("hud.wave", { n: 3 }), "Wave 3");
  setLangQuiet("pt-BR");
  assert.equal(t("hud.wave", { n: 3 }), "Onda 3");
  assert.equal(t("chave.que.nao.existe"), "chave.que.nao.existe");
  // placeholder sem valor fica como está
  assert.equal(t("hud.wave"), "Onda {n}");
});

test("t: sem a chave no idioma atual cai para o inglês", () => {
  const saved = pt["hud.best"];
  delete pt["hud.best"];
  try {
    assert.equal(t("hud.best", { wave: 2 }), "🏆 Best: wave 2");
    assert.ok(hasKey("hud.best"));
  } finally {
    pt["hud.best"] = saved;
  }
});

test("t: plural escolhido por count (1 = one, resto = other)", () => {
  setLangQuiet("en");
  assert.equal(t("hud.enemies", { count: 1 }), "1 enemy");
  assert.equal(t("hud.enemies", { count: 0 }), "0 enemies");
  assert.equal(t("hud.enemies", { count: 5 }), "5 enemies");
  setLangQuiet("pt-BR");
  assert.equal(t("hud.enemies", { count: 1 }), "1 inimigo");
  assert.equal(t("hud.enemies", { count: 2 }), "2 inimigos");
});

// ─── Dados traduzidos ───
test("localizeItems troca nome, descrição, efeito e encantamento no mesmo objeto", () => {
  const ember = findItem("ember_blade");
  const rusty = findItem("rusted_sword");
  assert.equal(ember.name, "Lâmina de Brasa");
  setLangQuiet("en");
  localizeItems();
  assert.equal(findItem("ember_blade"), ember, "mesmo objeto do catálogo");
  assert.equal(ember.name, "Ember Blade");
  assert.match(ember.enchant, /Flare/);
  assert.equal(rusty.enchant, null, "item sem encantamento");
  setLangQuiet("pt-BR");
  localizeItems();
  assert.equal(ember.name, "Lâmina de Brasa");
  assert.match(ember.enchant, /Labareda/);
});

test("enemyName segue o idioma e entende o invocado", () => {
  setLangQuiet("pt-BR");
  assert.equal(enemyName({ kind: "rogue" }), "Esqueleto Ladino");
  assert.equal(enemyName({ kind: "demon" }), "Senhor Demônio");
  assert.equal(enemyName({ kind: "skeleton", summoned: true }), "Esqueleto Invocado");
  setLangQuiet("en");
  assert.equal(enemyName({ kind: "rogue" }), "Skeleton Rogue");
  assert.equal(enemyName({ kind: "demon" }), "Demon Lord");
  assert.equal(enemyName({ kind: "skeleton", summoned: true }), "Summoned Skeleton");
  assert.equal(enemyName({ name: "Alvo" }), "Alvo", "sem kind usa o name");
});

test("melhorias, tipos e raridades acompanham o idioma", () => {
  setLangQuiet("en");
  assert.equal(upgradeName("haste"), "Haste");
  assert.equal(upgradeDesc("vitality"), "+10 max HP per level");
  assert.equal(describeLevel("vitality", 3), "+30 HP");
  assert.equal(describeLevel("haste", 2), "-6% cooldown");
  assert.equal(getTypeLabel("relic"), "Relic");
  assert.equal(RARITIES.epic.label, "Epic");
  setLangQuiet("pt-BR");
  assert.equal(upgradeName("haste"), "Celeridade");
  assert.equal(describeLevel("vitality", 3), "+30 vida");
  assert.equal(getTypeLabel("relic"), "Relíquia");
  assert.equal(RARITIES.epic.label, "Épico");
});

test("plurais de reward.sub, title.fragments e log.critFragment", () => {
  setLangQuiet("en");
  assert.match(t("reward.sub", { count: 1, wave: 2 }), /1 of 1 option ·/);
  assert.equal(t("title.fragments", { count: 1 }), "fragment");
  assert.equal(t("title.fragments", { count: 5 }), "fragments");
  setLangQuiet("pt-BR");
  assert.match(t("log.critFragment", { icon: "x", item: "y", count: 1 }), /\+1 fragmento\./);
});
