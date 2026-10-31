# Contexto do projeto (para retomar o trabalho)

Atualizado em 2026-10-30. Este arquivo é reescrito sempre que o contexto da conversa chega perto do limite.

## O que é
Repositório `jonidefjan/legendary-fiesta`:
- **Portfólio** (`index.html`): site jm77os.com.br (o usuário **não** é dono de jonatas.dev).
  - Já em produção: i18n EN (padrão) / pt-BR, tema claro/escuro seguindo o sistema, seção Projetos comentada e link para `/game`.
  - Scripts inline de propósito.
- **Reliquary** (`game/`): auto-battler em JS puro (ES modules, sem build), 3D pixel art com Three.js 0.170 vendorizado em `game/vendor/three` (import map).
  - Testes: `npm test` (node:test), **100 passando**.

## Estado atual
- Fases 0 a 3 já foram mergeadas na `main` (PRs #2 a #5).
- O inventário virou uma barra no topo que dá para recolher (PR #6, commit `99e2a2a`). A escolha de aberto/fechado fica salva em `localStorage` (`reliquary_inv_collapsed`), e a arena é redimensionada por um ResizeObserver.
- **Fase 4 (itens) em andamento** na branch `feat/phase-4-items`.
  - Spec: `phase4-spec.md`, no scratchpad da sessão.
  - Decisões:
    - criar o crítico (base 5%, ×1,5);
    - reescrever os textos do que o jogo não tem;
    - Manto: esquivar dá +50% no próximo ataque;
    - Anel: o Pacto vai até +25% por run;
    - cortar o tomo e a ampulheta.
  - Implementada e revisada (Opus, 12 correções). 140 testes passam e o jogo foi testado no navegador.
  - Campos novos do jogador salvos: `pactBonus`, `counters`, `harvestReady`, `empowered`.
  - `enemy.frozen` é medido em ms. `enemyAttack` devolve o resultado do ataque: dodged, blocked, absorbed ou hit.

## Fases restantes
- **4 – Itens:**
  - Implementar `crystal_armor`, `shadow_cloak`, `vampiric_amulet`, `speed_boots`, `lucky_coin` e `cursed_ring`.
  - Efeitos de arma: poison, freeze, healOnHit, lifesteal e water.
  - Remover `ancient_tome` e `time_glass`.
- **5 – i18n do jogo:** EN/PT. Hoje o jogo é só em português.
- **6 – Mobile retrato:**
  - Arena alta e estreita mostra uma faixa de solo abaixo da borda frontal.
  - O texto de pausa transborda no celular.
- **7 – Docs:** reescrever `auto-battler-doc.md` e arquivar `trello-setup.md` em `docs/`.
- **Ajustes opcionais depois:**
  - God rays quase invisíveis.
  - Contraste do herói verde.
  - GLBs pesados (22 MB).
  - O reflexo da água renderiza a cena inteira.
  - O ataque do Lich é genérico.
  - `durationMs` da vitória zera após "Continuar".
  - `state.endless` é salvo mas quase não é lido.

## Regras de trabalho (do usuário)
- **Perguntas:**
  - Sempre em múltipla escolha (AskUserQuestion), com a opção recomendada primeiro.
- **Agentes:**
  - Tarefas simples com Haiku/Sonnet, complexas e revisão com Opus.
- **Fluxo por fase:**
  - Cada fase tem uma branch e uma PR.
  - Merge só quando o usuário mandar: `gh pr merge N --merge --delete-branch`.
  - Em PRs empilhadas, apagar a branch base fecha a PR dependente. Faça o retarget antes.
- **Downloads:** pedir permissão antes de baixar qualquer coisa.
- **Contexto:** reescrever este arquivo quando o contexto atingir ~80%.

## Arquitetura do jogo (o essencial)
- **Arquivos principais** (`game/src/`):
  - `main.js`: fluxo da run. Usa o padrão `runId` + `later(ms, fn)` para que timeouts de uma run morta não disparem; também tem a flag `autoResume`.
  - `state.js`: `freshRun`, `meta`, `resetRun`/`resetMeta`.
  - `save.js`: a run fica em `reliquary_run` (v2) e a meta em `reliquary_meta_v1`; migra o legado `reliquary_save_v1`.
  - `items.js` + `assets/items.json`:
    - Efeitos data-driven (`effects: [{trigger, type, ...}]`); a lista `KNOWN_EFFECTS` fica em `combat.js`.
    - Níveis vão até 5: +20% de efeito e −5% de recarga por nível. O teto por item vem de `maxLevelOf`.
  - `combat.js`: armadura limitada em 75%; `checkPlayerDeath()` também roda após DoT.
  - `meta.js`:
    - Upgrades vitality, might, guard e haste (haste tem máximo de 16).
    - Custo: `round(20×1.25^nível)`.
  - `boss.js`: Lich (invoca esqueletos) e Senhor Demônio (nova de fogo, enfurece abaixo de 33%). Aparecem a cada 10 ondas.
  - `waves.js`: inimigos.
  - Interface: `ui.js`, `ui-title.js` e `ui-victory.js`.
  - Feedback: `audio.js`, `feel.js` (hit-stop e shake) e `particles.js`.
  - Eventos: `events.js` (`emit`/`on`, `log`, `sound`).
- **Render** (`game/src/three/`):
  - Pipeline: alvo de 240 px de altura, contorno, toon com 3 faixas e câmera ortográfica com snap de pixel.
  - Personagens KayKit em glTF (`game/assets/models`).
  - Água, god rays e grama billboard.
- Fonte: Pixelify Sans.

## Dicas de ambiente
- **Windows/PowerShell:** o gh fica em `C:\Program Files\GitHub CLI\gh.exe`.
- **Quebras de linha:** os arquivos usam CRLF, então patches multi-linha falham.
  - Use o `patch.cjs` do scratchpad, que normaliza o CRLF, ou faça edits de uma linha.
- **Browser pane:**
  - O rAF pausa com a aba em segundo plano; chame `tabs_select` antes de testar o loop do jogo.
  - O estado do jogo pode ser controlado no console via `await import('/game/src/state.js')`.
- **Preview local:** servidor na porta 8766.
