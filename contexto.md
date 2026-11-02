# Contexto do projeto (para retomar o trabalho)

Reescrito depois de cada merge de fase na `main`. Última atualização: 2026-11-01, após a PR #21 (commit `4ade0a5`). Nada pendente de commit além deste arquivo.

## O que é
O repositório `jonidefjan/legendary-fiesta` (público) tem duas partes:
- **Portfólio** (`index.html`): o site jm77os.com.br. O usuário **não** é dono de jonatas.dev.
  - Tem i18n EN (padrão) e pt-BR, com a chave `lang` no localStorage, e tema claro/escuro.
- **Reliquary** (`game/`): auto-battler em JS puro, sem build.
  - 3D pixel art com Three.js 0.170, vendorizado em `game/vendor/three`.
  - Testes: `npm test` na raiz (**436** passando).

## Estado
- **Fases concluídas:** 0 a 14 (PRs #2 a #21). O plano de fases terminou; restam só os opcionais.
- **Fase 12 (atiradores e late game):**
  - `RANGED_TYPES` em `waves.js`, separado de `ENEMY_TYPES`: arqueiro a partir da onda 11, mago a partir da 13.
  - `rangedCount`: 2 nas ondas 11–20, 3 nas 21–30, 4 da 31 em diante. Ocupam vagas do total `2 + onda`; ondas de chefe têm atiradores a partir da 20.
  - Ficam parados em `rangedSpawnX`, no fundo. `handleResize` em `main.js` os reposiciona.
  - `state.projectiles` em `combat.js`: esquiva, bloqueio e dano são resolvidos na chegada. O reflexo da Cota volta como projétil e o dano é aplicado na chegada.
  - `waveScales`: cada onda acima da 10 multiplica a vida por 1,15 e o dano por 1,08, inclusive nos chefes.
  - `rearReachOffer` em `items.js`: carta extra no prêmio da onda 10 para quem não tem item que alcança o fundo.
  - Sprint Total (Botas N5): a arma que atacou e mais 1 sorteada. O Arco Fantasma sem alvo na retaguarda ataca o mais próximo.
  - Dano no herói: sem hit-stop; `feel.hurtFeedback` e `ui.flashHurt` fazem a vinheta e a barra piscarem, e o herói pisca em vermelho.
  - **Ainda não visto na tela:** projéteis, animação dos atiradores, sons, vinheta e flash, atiradores no celular ao girar. O equilíbrio do late game também não foi medido jogando.
- **Fase 14 (itens no celular):**
  - No celular, tocar num item abre o painel `#item-panel` embaixo da tela; no desktop, o tooltip de hover continua.
  - Com mais de 6 itens, a caixa de itens rola por dentro (`inv-scroll`, 168 px).
  - As cartas têm texto maior no celular.
  - Helpers em `layout.js`: `usesItemPanel` e `needsInvScroll`.
  - Bug sem reprodução: uma vez, tocar em outro item fechou o painel em vez de trocar.
- **Fase 13 (desempenho):** passou de 6–10 para ~50 fps numa run gigante.
  - Emojis do overlay ficam em cache de bitmap.
  - `fx.js` envelhece os efeitos por tempo real, com teto de 240.
  - Os rigs compartilham um esqueleto, atualizado uma vez por quadro (`three/skeleton.js`).
  - O reflexo da água ignora personagens que não aparecem nela.
  - `updateMatrixWorld` roda uma vez por quadro.
- **Fase 10 (tela de fim):**
  - Card 2×3 na derrota e na vitória.
  - Arma favorita = a de maior dano (`runStats.damageByItem`). O dano é creditado via o parâmetro `itemId` de `applyElementalDamage`, e as DoTs guardam `sourceId`.
  - Compartilhar fica em `share.js`: imagem 1200×630 + texto com link. Usa o menu nativo e, no desktop, copia o texto e baixa a imagem.
- **Docs (fase 9):** `README.md`, `docs/game.md` (referência do jogo, em inglês) e `docs/items.md`, gerado por `npm run docs:items` (um teste falha se ficar desatualizado). O Trello foi para `docs/archive/`.
  - Ao mudar itens, regerar `docs/items.md`. Ao mudar mecânicas, atualizar `docs/game.md`.
- **Fase 8 (arte dos itens):**
  - Ícones 16×16 em `game/src/item-art.js` (paleta, `ITEM_ART`, `ITEM_ELEMENTS`, `ELEMENT_ART` 7×7).
  - Renderizados por `sprites.js` (data URLs com cache; o emoji é o fallback).
  - Aparecem só nos itens (inventário, cartas, tooltip, fim de run).
  - Folha de revisão em `game/dev/item-art.html`. Os scripts que geram a arte ficam em `scratchpad/art/`.
- **Fase 7 (Itens II):**
  - **Queimadura:** dano fixo por stack; o máximo é 3 + 1 por nível.
  - **Veneno:** base `1 + 3·(nível−1)` + 1 por stack, sem limite e sem contágio.
  - **Itens novos:**
    - `ember_heart`: lendário; espalha os stacks de queimadura para os n mais próximos (n = nível).
    - `seismic_hammer`: respingo.
    - `blast_core`: explosão em volta do herói.
    - `judgment_tome`: acerta todos.
    - `thorn_mail`: espinhos.
  - **Lendário garantido:** depois de 4 telas de recompensa sem nenhum, e nas recompensas de chefe do modo infinito (`state.rewardsSinceLegendary`).
  - **Lâmina de Brasa** (hoje): 12 de dano de fogo, +3 por nível, e 1 stack de queimadura por nível em todo golpe. Armas com dano base 0 (como os míticos) só aplicam efeitos.

## Próximas fases
Plano de melhorias, pedido pelo usuário em 2026-10-31. A ordem foi escolhida por ele:
- **11 – Revisão dos efeitos (concluída, PRs #17–#19).** A spec completa fica em `docs/design/effects-v2.md`.
  - **Níveis:** cada item tem dados próprios por nível, com encantamento no N3 e extra no N5.
  - **Evolução:** Espada, Colete e Ferradura evoluem no nível 5 e depois sobem sem limite, por recompensas e abates.
  - **Mana e barreira:** saíram do jogo.
  - **Itens:** 45 no total, contando os 2 míticos de clique (desbloqueio na loja por 100, um por run, 8 cliques/s em `clicks.js`).
  - **Balanceamento:**
    - Os valores de nível 1 dos itens subiram 30%.
    - Fogo: stacks sem limite, 1 de dano/stack, decai max(1, ⌊stacks/10⌋)/s só depois de 3s sem stack novo.
    - Veneno: nunca perde stacks.
    - Frio: 10% de lentidão por stack, congela com 5, decai depois de 3s.
    - Chefes: resistências sorteadas, com 1 imunidade a partir do 2º chefe.
    - Loja: 8 melhorias.
  - **Retaguarda:** distância > 35% entre o herói e a borda visível.
- **Opcionais:**
  - god rays fracos;
  - contraste do herói;
  - GLBs pesados (22 MB);
  - reflexo da água renderiza a cena toda;
  - ataque do Lich genérico;
  - `durationMs` da vitória zera ao continuar;
  - chaves `log.*` sem uso desde que o log saiu da tela.

## Regras de trabalho (do usuário)
- **Perguntas:** sempre em múltipla escolha (AskUserQuestion), com a opção recomendada primeiro.
- **Agentes:**
  - Delegar por modelo: Haiku/Sonnet no simples, Opus para revisar.
  - Spec da fase em arquivo no scratchpad.
  - Relatórios curtos.
  - Reaproveitar o agente da fase (SendMessage) para aplicar as correções da revisão.
- **Fluxo:**
  - Uma branch e uma PR por fase.
  - Merge só quando o usuário mandar: `gh pr merge N --merge --delete-branch`.
  - Depois do merge, reescrever este arquivo.
- **Downloads:** pedir permissão antes. Fontes e arquivos com licença restrita **não** entram no repositório público.
- **Contexto:** a eficiência é prioridade. Quando a prática estiver firme, criar uma skill sobre isso.
- **Testes no navegador:** evitar, salvo quando muito necessários, para economizar tokens; verificar com `npm test` e revisão, e dizer o que ficou sem ver na tela. O localStorage tem a run real do usuário.
  - Antes de testar, copiar tudo para `sessionStorage.__reliq_backup`.
  - Depois, restaurar exatamente.
  - Preferir medições via JS a screenshots.

## Arquitetura do jogo
- **Fluxo** (`main.js`):
  - Tela inicial → escolha de 1 arma de 3 → recompensa a cada onda → chefe na onda 10 → vitória e modo infinito (chefe a cada 10 ondas).
  - O padrão `runId` + `later()` impede timeouts de uma run morta.
- **Dados:** `game/assets/items.json` só tem números e efeitos (`effects: [{trigger, type, ...}]`).
  - Handlers e `KNOWN_EFFECTS` ficam em `combat.js`.
  - Níveis vão até 5 (`levelMultiplier`).
  - O dano permanente vem de `permanentDamage()`.
  - `enemyAttack` devolve dodged / blocked / absorbed / hit.
  - Toda morte de inimigo passa pelo kill check de `updateEnemies`.
- **i18n:** `game/src/i18n.js` (`t`, `setLang`, `formatNumber`), com textos em `game/locales/{en,pt-BR}.js` e `items.{en,pt-BR}.js`.
  - Os testes exigem as mesmas chaves nos dois idiomas.
  - Inimigos têm `kind`; os nomes vêm de `enemyName()`.
- **Save:**
  - A run fica em `reliquary_run` (v2): ids, níveis, pity, pacto, contadores.
  - A meta fica em `reliquary_meta_v1`.
  - A escolha da barra de itens fica em `reliquary_inv_collapsed`; o padrão é aberta.
- **Layout:**
  - Barra de itens no topo e arena com largura total. Não há log na tela.
  - Celular em pé: a arena tem no máximo um quadrado.
  - Paisagem com altura de até 500 px: modo compacto.
  - Regras puras ficam em `layout.js`.
- **Render** (`game/src/three/`):
  - Câmera ortográfica (`viewHeight` 12.5, `MIN_HALF_WIDTH` 9).
  - Cenário de z −20 a 18.
  - Inimigos nascem até `visibleLogicRight()`.
- **Fontes:**
  - Texto em Pixelify Sans.
  - Dígitos em Tiny5, pela família `"Reliquary Digits"` (unicode-range 0-9).

## Ambiente
- **Windows:** o gh fica em `C:\Program Files\GitHub CLI\gh.exe` (usar pelo PowerShell).
- **Arquivos CRLF:** editar com um script node que normaliza `\r\n` e grava de volta.
- **Preview:** nenhum servidor fica rodando. Para jogar ou testar, rode `npx http-server -p 8766` na raiz e abra `http://localhost:8766/game/` numa aba própria.
  - Chamar `tabs_select` antes de testar o loop.
  - Para furar o cache do CSS, trocar os `href` com `?v=`.
  - O estado do jogo fica em `await import('/game/src/state.js')`.
