# Contexto do projeto (para retomar o trabalho)

Reescrito depois de cada merge de fase na `main`. Última atualização: 2026-10-31, após a PR #11 (commit `117f7cf`).

## O que é
O repositório `jonidefjan/legendary-fiesta` (público) tem duas partes:
- **Portfólio** (`index.html`): o site jm77os.com.br. O usuário **não** é dono de jonatas.dev.
  - Tem i18n EN (padrão) e pt-BR, com a chave `lang` no localStorage, e tema claro/escuro.
- **Reliquary** (`game/`): auto-battler em JS puro, sem build.
  - 3D pixel art com Three.js 0.170, vendorizado em `game/vendor/three`.
  - Testes: `npm test` na raiz (**206** passando).

## Estado
- **Fases concluídas:** 0 a 7 (PRs #2 a #11).
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
  - **Lâmina de Brasa:** sem dano direto, queima em todo golpe. Armas com dano base 0 só aplicam efeitos.
- **Aguardando o usuário: mana.** Ela vai ser descartada. O usuário vai redesenhar o **Manto do Arcano** (`mage_robe`: maxMana, magicBoost não usado, manaFromDamage) e a **Pedra de Mana** (`mana_stone`: mana + transbordamento).
  - Depois disso, remover a mana do jogo inteiro: a barra MP, `p.mana`/`maxMana`, o save e as traduções.

## Próximas fases
- **8 – Arte dos itens:** trocar os emojis por imagens em pixel art fiéis ao nome de cada item.
  - Exemplos do usuário:
    - Arco Gélido: arco e flecha com gelo.
    - Colete de Couro: um colete.
    - Espada Enferrujada: desgastada e alaranjada.
  - Item elemental mostra o efeito ou o símbolo do elemento.
  - As decisões devem ser perguntadas em múltipla escolha.
- **9 – Docs (por último):** reescrever `auto-battler-doc.md` e arquivar `trello-setup.md` em `docs/`.
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
- **Testes no navegador:** o localStorage tem a run real do usuário.
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
- **Preview:** `http://localhost:8766/game/` (aba `tab-2`).
  - Chamar `tabs_select` antes de testar o loop.
  - Para furar o cache do CSS, trocar os `href` com `?v=`.
  - O estado do jogo fica em `await import('/game/src/state.js')`.
