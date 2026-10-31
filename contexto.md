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
- Fases 0 a 4 já foram mergeadas na `main` (PRs #2 a #5 e #7). A última é o commit `32fa459`.
- A câmera está 25% mais afastada (`viewHeight` 12.5, `MIN_HALF_WIDTH` 9). Os inimigos nascem até `visibleLogicRight()` (`arena.maxX`) e nunca fora da tela (PR #8, commit `7913c11`). No celular (até 480 px), os botões ficam numa linha no alto da arena.
- O inventário virou uma barra no topo que dá para recolher (PR #6, commit `99e2a2a`). A escolha de aberto/fechado fica salva em `localStorage` (`reliquary_inv_collapsed`), e a arena é redimensionada por um ResizeObserver.
- **Fase 4 (itens):**
  - Decisões:
    - criar o crítico (base 5%, ×1,5);
    - reescrever os textos do que o jogo não tem;
    - Manto: esquivar dá +50% no próximo ataque;
    - Anel: o Pacto vai até +25% por run;
    - cortar o tomo e a ampulheta.
  - Todos os itens funcionam. 140 testes passam.
  - Campos novos do jogador salvos: `pactBonus`, `counters`, `harvestReady`, `empowered`.
  - `enemy.frozen` é medido em ms. `enemyAttack` devolve o resultado do ataque: dodged, blocked, absorbed ou hit.

## Fases restantes
- **5 – i18n do jogo:** concluída (PR #9, commit `f512bb6`).
  - Inglês é o padrão; `?lang=` tem prioridade; a escolha fica na chave `lang`, compartilhada com o portfólio.
  - Botão EN/PT na tela inicial e no cabeçalho.
  - API em `game/src/i18n.js` (`t`, `setLang`, `formatNumber`); textos em `game/locales/{en,pt-BR}.js` e `items.{en,pt-BR}.js`.
  - Inimigos têm `kind`; os nomes vêm de `enemyName()`.
  - Fonte dos números: Tiny5 (OFL). A família `"Reliquary Digits"` (só 0-9, via unicode-range) fica na frente de toda pilha Pixelify Sans, no CSS e no canvas.
  - A Pixel Game (1001fonts) foi recusada: a licença é só para uso pessoal e o repositório é público.
- **6 – Celular:** feita na branch `feat/phase-6-mobile`, com PR aberta.
  - Retrato (qualquer largura): a arena ocupa o espaço que sobra, limitada a quadrada (`max-height: min(100vw, 1280px)`), com mínimo de 260 px. Há fallback em `vh` para navegadores sem `dvh`.
  - O cenário vai de `frontZ` 18 até `backZ` -20, então o chão cobre o quadro na proporção mais alta que o layout permite.
  - Paisagem com altura de até 500 px: modo compacto, com cabeçalho de 34 px e barra de 38 px, sem rolar.
  - Itens abertos por padrão: decidido em `layout.js` (`defaultCollapsed`) a partir da altura medida do cabeçalho e dos itens. A escolha salva manda.
  - O log de combate saiu da tela. `log()` continua chamado, mas nada o exibe; o erro de carga aparece num `.load-error`.
- **7 – Docs:** reescrever `auto-battler-doc.md` e arquivar `trello-setup.md` em `docs/`.
- **8 – Arte dos itens** (pedida pelo usuário em 2026-10-31, fase própria): trocar os emojis por imagens em pixel art fiéis ao nome de cada item.
  - Exemplos do usuário:
    - Arco Gélido: arco e flecha com efeito de gelo.
    - Colete de Couro: um colete, não um escudo.
    - Espada Enferrujada: desgastada e alaranjada.
  - Todo item elemental mostra o efeito ou o símbolo do seu elemento.
  - As decisões (gerar ou desenhar, tamanho, estilo) devem ser perguntadas em múltipla escolha ao começar.
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
