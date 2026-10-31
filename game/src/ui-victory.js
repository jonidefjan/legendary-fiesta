// ═══════════════════════════════════════════
//  TELA DE VITÓRIA (depois do chefe da onda 10)
// ═══════════════════════════════════════════
// Desenha dentro de #victory-modal (index.html); estilos em game/boss.css.
import { t } from "./i18n.js";
import { formatDuration, favoriteCellHTML, createShareControls } from "./share.js";

let current = null; // { stats, onContinue, onEnd } enquanto a tela está aberta

function statCell(label, value, wide = false, html = false) {
  const cell = document.createElement("div");
  cell.className = `go-stat victory-stat${wide ? " wide" : ""}`;
  const l = document.createElement("div");
  l.className = "go-stat-label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "go-stat-value";
  if (html) v.innerHTML = value;
  else v.textContent = String(value);
  cell.append(l, v);
  return cell;
}

function button(className, text, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}

// stats: { wave, kills, score, damage, durationMs, fragments, favorite, bossKind }
// (bossKind é o id do chefe: o nome sai no idioma atual a cada desenho)
export function showVictory({ stats, onContinue, onEnd }) {
  const modal = document.getElementById("victory-modal");
  if (!modal) {
    onContinue();
    return;
  }
  current = { stats, onContinue, onEnd };
  render();
  modal.style.display = "flex";
  modal.querySelector(".victory-continue").focus();
}

// Troca de idioma com a vitória aberta: desenha de novo
export function refreshVictory() {
  if (current) render();
}

function render() {
  const modal = document.getElementById("victory-modal");
  const { stats, onContinue, onEnd } = current;
  modal.replaceChildren();

  const content = document.createElement("div");
  content.className = "modal-content victory-content";

  const header = document.createElement("div");
  header.className = "modal-header";
  const title = document.createElement("h2");
  title.textContent = t("victory.title");
  const subtitle = document.createElement("p");
  subtitle.className = "modal-subtitle";
  subtitle.textContent = stats.bossKind
    ? t("victory.sub", { boss: t(`enemies.${stats.bossKind}`) })
    : t("victory.subGeneric");
  header.append(title, subtitle);

  const grid = document.createElement("div");
  grid.className = "go-stats";
  grid.append(
    statCell(t("victory.wave"), stats.wave),
    statCell(t("gameover.kills"), stats.kills),
    statCell(t("gameover.score"), stats.score),
    statCell(t("gameover.damage"), stats.damage),
    statCell(t("gameover.duration"), formatDuration(stats.durationMs)),
    statCell(t("victory.fragments"), stats.fragments),
    statCell(t("gameover.favorite"), favoriteCellHTML(stats.favorite), true, true),
  );

  const actions = document.createElement("div");
  actions.className = "victory-actions";
  const close = (fn) => () => {
    hideVictory();
    fn();
  };
  actions.append(
    button("go-restart-btn victory-continue", t("victory.continue"), close(onContinue)),
    button("victory-end", t("victory.end"), close(onEnd)),
  );

  content.append(header, grid, createShareControls(() => stats), actions);
  modal.append(content);
}

export function hideVictory() {
  const modal = document.getElementById("victory-modal");
  if (!modal) return;
  current = null;
  modal.style.display = "none";
  modal.replaceChildren();
}
