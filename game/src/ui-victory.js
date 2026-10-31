// ═══════════════════════════════════════════
//  TELA DE VITÓRIA (depois do chefe da onda 10)
// ═══════════════════════════════════════════
// Desenha dentro de #victory-modal (index.html); estilos em game/boss.css.

function formatDuration(ms) {
  const total = Math.floor((ms || 0) / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function statCell(label, value, wide = false) {
  const cell = document.createElement("div");
  cell.className = `go-stat victory-stat${wide ? " wide" : ""}`;
  const l = document.createElement("div");
  l.className = "go-stat-label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "go-stat-value";
  v.textContent = String(value);
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

// stats: { wave, kills, score, totalDamage, durationMs, fragments, bossName }
export function showVictory({ stats, onContinue, onEnd }) {
  const modal = document.getElementById("victory-modal");
  if (!modal) {
    onContinue();
    return;
  }
  modal.replaceChildren();

  const content = document.createElement("div");
  content.className = "modal-content victory-content";

  const header = document.createElement("div");
  header.className = "modal-header";
  const title = document.createElement("h2");
  title.textContent = "👑 Vitória!";
  const subtitle = document.createElement("p");
  subtitle.className = "modal-subtitle";
  subtitle.textContent = stats.bossName
    ? `${stats.bossName} foi derrotado!`
    : "O chefe foi derrotado!";
  header.append(title, subtitle);

  const grid = document.createElement("div");
  grid.className = "go-stats";
  grid.append(
    statCell("🌊 Onda", stats.wave),
    statCell("💀 Inimigos mortos", stats.kills),
    statCell("🏆 Pontuação", stats.score),
    statCell("⚔ Dano total causado", stats.totalDamage),
    statCell("⏱ Duração da run", formatDuration(stats.durationMs)),
    statCell("⚡ Fragmentos", stats.fragments),
  );

  const actions = document.createElement("div");
  actions.className = "victory-actions";
  const close = (fn) => () => {
    hideVictory();
    fn();
  };
  actions.append(
    button("go-restart-btn victory-continue", "♾️ Continuar no modo infinito", close(onContinue)),
    button("victory-end", "🏁 Encerrar a run", close(onEnd)),
  );

  content.append(header, grid, actions);
  modal.append(content);
  modal.style.display = "flex";
  modal.querySelector(".victory-continue").focus();
}

export function hideVictory() {
  const modal = document.getElementById("victory-modal");
  if (!modal) return;
  modal.style.display = "none";
  modal.replaceChildren();
}
