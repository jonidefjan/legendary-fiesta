// ═══════════════════════════════════════════
//  I18N: inglês (padrão) e português do Brasil
// ═══════════════════════════════════════════
// Mesma regra do portfólio (/index.html): ?lang= na URL > escolha salva em
// localStorage ("lang") > inglês. Roda também no Node (testes), sem window/document.
import { emit } from "./events.js";
import en from "../locales/en.js";
import ptBR from "../locales/pt-BR.js";

export const LANGS = ["en", "pt-BR"];
export const DEFAULT_LANG = "en";
export const STORAGE_KEY = "lang"; // a mesma chave do portfólio: trocar num lugar troca no outro
const SITE_URL = "https://jm77os.com.br/game/";

export const DICTS = { en, "pt-BR": ptBR };
let current = DEFAULT_LANG;
const warned = new Set();

// "pt", "pt-br", "PT-BR" -> "pt-BR"; "en", "en-US" -> "en"; o resto -> null
export function normalizeLang(value) {
  if (!value || typeof value !== "string") return null;
  const lower = value.toLowerCase();
  if (lower === "en" || lower.startsWith("en-")) return "en";
  if (lower === "pt" || lower.startsWith("pt-")) return "pt-BR";
  return null;
}

// localStorage pode lançar erro (modo privado, bloqueios): só não lembra a escolha
function defaultStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readStore(storage) {
  try {
    return storage ? storage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

function writeStore(storage, value) {
  try {
    if (storage) storage.setItem(STORAGE_KEY, value);
  } catch {
    // sem storage a troca vale só até recarregar
  }
}

export function getLang() {
  return current;
}

// ─── Tradução ───
function lookup(key, lang) {
  return DICTS[lang]?.[key];
}

// A chave existe no idioma atual ou em inglês (ex.: encantamento só de alguns itens)
export function hasKey(key) {
  return lookup(key, current) !== undefined || lookup(key, DEFAULT_LANG) !== undefined;
}

// Busca no idioma atual, depois em inglês; sem nada, devolve a própria chave
export function t(key, params = {}) {
  let k = key;
  // Plural: com count e as variantes key.one / key.other, escolhe por count === 1
  if (params.count !== undefined) {
    const variant = `${key}.${params.count === 1 ? "one" : "other"}`;
    if (lookup(variant, current) !== undefined || lookup(variant, DEFAULT_LANG) !== undefined) {
      k = variant;
    }
  }
  let text = lookup(k, current);
  if (text === undefined) text = lookup(k, DEFAULT_LANG);
  if (text === undefined) {
    if (typeof window !== "undefined" && !warned.has(k)) {
      warned.add(k);
      console.warn(`[i18n] chave ausente: ${k}`);
    }
    return k;
  }
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

// Número no formato do idioma atual (0,5 em pt-BR; 0.5 em en)
export function formatNumber(value, digits) {
  const opts = digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits };
  return Number(value).toLocaleString(current, opts);
}

// ─── Página ───
function attrPairs(el) {
  return el.dataset.i18nAttr
    .split(";")
    .map((pair) => pair.trim().split(":"))
    .filter((pair) => pair.length === 2);
}

// Aplica as traduções do HTML estático: data-i18n (texto) e data-i18n-attr (atributos)
export function applyDom(root = typeof document === "undefined" ? null : document) {
  if (!root) return;
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    for (const [attr, key] of attrPairs(el)) el.setAttribute(attr, t(key));
  });
  root.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === current));
  });
}

// <html lang>, título, descrição, canonical e a URL (?lang=pt-BR), como no portfólio
function applyPage() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = current;
  document.title = t("meta.title");
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute("content", t("meta.description"));
  const canonical = document.getElementById("canonical");
  if (canonical) {
    canonical.href = current === DEFAULT_LANG ? SITE_URL : `${SITE_URL}?lang=${current}`;
  }
  try {
    const url = new URL(window.location.href);
    if (current === DEFAULT_LANG) url.searchParams.delete("lang");
    else url.searchParams.set("lang", current);
    history.replaceState(null, "", url);
  } catch {
    // file: e data: não deixam reescrever a URL; o idioma troca igual
  }
}

function apply(lang) {
  current = LANGS.includes(lang) ? lang : DEFAULT_LANG;
  applyPage();
  applyDom();
}

// Troca o idioma: salva, aplica na página e avisa a interface (evento "langChange")
export function setLang(lang, { storage = defaultStorage() } = {}) {
  const next = normalizeLang(lang) || DEFAULT_LANG;
  writeStore(storage, next);
  apply(next);
  emit("langChange", next);
  return next;
}

// Idioma inicial. Como no portfólio, só a escolha no botão grava no storage:
// ?lang= na URL vale para esta visita sem sobrescrever a preferência salva.
export function initLang({ search, storage = defaultStorage() } = {}) {
  const query =
    search ?? (typeof window !== "undefined" ? window.location.search : "");
  const fromUrl = normalizeLang(new URLSearchParams(query).get("lang"));
  const lang = fromUrl || normalizeLang(readStore(storage)) || DEFAULT_LANG;
  apply(lang);
  // Os botões EN/PT (cabeçalho e tela inicial, que é redesenhada) usam delegação
  if (typeof document !== "undefined" && !bound) {
    bound = true;
    document.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-lang]");
      if (btn && btn.dataset.lang !== current) setLang(btn.dataset.lang);
    });
  }
  return lang;
}
let bound = false;

// Troca o idioma sem tocar em página nem storage (testes e ferramentas)
export function setLangQuiet(lang) {
  current = normalizeLang(lang) || DEFAULT_LANG;
}
