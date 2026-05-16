# Auto Battler — Base de Documentação para Claude Code

> Documento vivo — atualizar continuamente durante o desenvolvimento.
> Serve como contexto persistente para Claude Code e fonte de verdade do projeto.

---

# Visão Geral

## Nome do Projeto

*A definir — sugestões: Shardborn, Runechaos, Fractured Glory*

## Gênero

Auto Battler / Roguelite

## Plataformas

PC (Windows/Mac) — Mobile como stretch goal futuro

## Público-Alvo

Jogadores de roguelites e auto battlers que gostam de theory-crafting, builds quebradas e alta rejogabilidade. Faixa etária: 18–35. Referências culturais: TFT, Slay the Spire, Hades, Backpack Battles.

## Proposta de Valor (Diferencial)

**"Quebrar o jogo é divertido."**
O jogo recompensa ativamente combinações absurdas de itens, habilidades e encantamentos. Não existe uma build "correta" — existem dezenas de sinergias que o jogador descobre e explora. A sensação de descoberta de uma combo poderosa é o core fantasy.

## Referências

* **Backpack Battles** — sistema de itens com posicionamento e sinergias físicas
* **Slay the Spire** — progressão roguelite em mapa, recompensas estratégicas
* **Hades** — meta-progressão pesada, narrativa integrada ao loop
* **Vampire Survivors** — power fantasy, builds que escalam absurdamente
* **Teamfight Tactics** — combate automático em tempo real, composição de unidades

---

# Core Loop

## Loop Principal

```
[Mapa da Run]
    ↓
[Nó: Combate / Evento / Loja / Elite / Boss]
    ↓
[Combate Automático em Tempo Real]
    ↓
[Recompensa: Item / Habilidade / Encantamento / Ouro]
    ↓
[Tela de Gerenciamento: Equipar / Vender / Combinar]
    ↓
[Próximo Nó]
    ↓
[Boss Final → Vitória ou Morte]
    ↓
[Meta-Progressão: Pontos / Desbloqueios Permanentes]
    ↓
[Nova Run]
```

## Fluxo da Run

1. **Início da Run** — jogador escolhe um herói (com kit inicial diferente)
2. **Mapa** — mapa com nós ramificados, jogador escolhe o caminho
3. **Combate** — herói luta automaticamente; jogador observa e aprende padrões
4. **Recompensas** — escolha entre 3 opções (item, habilidade ou encantamento)
5. **Loja** — compra com ouro; itens rotativos; opção de refresh
6. **Eventos** — escolhas narrativas com consequências mecânicas
7. **Elite / Boss** — combates mais difíceis com recompensas melhores
8. **Morte ou Vitória** — ao terminar, ganha recursos de meta-progressão

## Fluxo do Combate

1. Herói e inimigo(s) são posicionados na arena
2. Combate começa automaticamente
3. Herói usa ataques básicos + habilidades com cooldown/mana
4. Efeitos de status, DoTs e reações elementais ocorrem em tempo real
5. Combate termina quando um lado é eliminado

## Progressão

### Dentro da Run (Progressão Efêmera)
* Equipamentos encontrados/comprados
* Habilidades escolhidas como recompensa
* Encantamentos adicionados a equipamentos
* Ouro acumulado e gasto

### Entre Runs (Meta-Progressão Permanente)
* **Fragmentos de Poder** — moeda meta; ganhos ao vencer combates e runs
* **Árvore de Talentos Permanentes** — bônus passivos que persistem entre runs (ex: +5% vida base, acesso a itens raros desde o início)
* **Desbloqueio de Heróis** — novos personagens com kits únicos
* **Desbloqueio de Itens e Encantamentos** — expande o pool disponível nas runs
* **Relíquias Iniciais** — itens especiais que o jogador pode começar com após desbloqueá-los
* **Dificuldade Crescente** — sistema de Ascensão (como Hades/Slay the Spire) para jogadores avançados

---

# Direção do Projeto

## Objetivos

* **Builds quebradas como feature** — o jogo celebra sinergias absurdas, não as nerfa
* **Alta rejogabilidade** — cada run parece diferente por design
* **Progressão estratégica** — escolhas com peso real, sem resposta certa
* **Sistemas modulares** — fácil de adicionar conteúdo sem quebrar o existente
* **Descoberta orgânica** — o jogador aprende as sinergias jogando, não lendo tutoriais

## Filosofia de Desenvolvimento

* **Modularidade** — sistemas independentes que se conectam via eventos
* **Data Driven** — conteúdo em ScriptableObjects; mudar dados não requer recompilar
* **Event Driven** — sistemas se comunicam via eventos, sem dependências diretas
* **ScriptableObjects** — fonte de verdade para definições de itens, habilidades, inimigos
* **Gameplay First** — prototipar e validar a diversão antes de polir

---

# Stack Técnica

## Engine

* Unity (versão LTS mais recente)
* C#

## Ferramentas

* **Trello** — gestão de tarefas e backlog
* **Git + GitHub** — versionamento
* **Claude Code** — pair programming e arquitetura
* **Rider ou Visual Studio** — IDE
* **URP** — pipeline de renderização
* **Input System** — sistema de input moderno da Unity

---

# Estrutura do Projeto

```text
Assets/
├── Art/
│   ├── Characters/
│   ├── Environment/
│   ├── UI/
│   └── VFX/
├── Audio/
│   ├── Music/
│   └── SFX/
├── Prefabs/
│   ├── Characters/
│   ├── Effects/
│   └── UI/
├── Scenes/
│   ├── Boot.unity
│   ├── MainMenu.unity
│   ├── Campaign.unity
│   └── Combat.unity
├── Scripts/
├── ScriptableObjects/
│   ├── Items/
│   ├── Skills/
│   ├── Enemies/
│   ├── Enchantments/
│   └── Campaign/
├── UI/
├── VFX/
└── Tests/
    ├── EditMode/
    └── PlayMode/
```

---

# Estrutura de Scripts

```text
Scripts/
├── Core/
│   ├── GameManager.cs
│   ├── EventBus.cs
│   ├── SceneLoader.cs
│   ├── SaveSystem.cs
│   └── Logger.cs
├── Combat/
│   ├── CombatManager.cs
│   ├── CombatEntity.cs
│   ├── TargetingSystem.cs
│   ├── DamageCalculator.cs
│   └── ArenaController.cs
├── Stats/
│   ├── StatDefinition.cs          (SO)
│   ├── StatModifier.cs
│   └── CharacterStats.cs
├── Skills/
│   ├── SkillDefinition.cs         (SO)
│   ├── SkillExecutor.cs
│   └── SkillEffect.cs
├── Effects/
│   ├── EffectDefinition.cs        (SO)
│   ├── DotEffect.cs
│   ├── DotManager.cs
│   └── ElementalReactionSystem.cs
├── Items/
│   ├── ItemDefinition.cs          (SO)
│   ├── ItemInstance.cs
│   ├── EquipmentManager.cs
│   └── EnchantmentDefinition.cs   (SO)
├── Characters/
│   ├── HeroDefinition.cs          (SO)
│   ├── HeroController.cs
│   ├── EnemyDefinition.cs         (SO)
│   └── EnemyController.cs
├── Campaign/
│   ├── CampaignNode.cs            (SO)
│   ├── CampaignMap.cs
│   ├── RewardPool.cs              (SO)
│   ├── RewardGenerator.cs
│   └── MetaProgressionManager.cs
├── UI/
│   ├── HUD/
│   ├── Inventory/
│   ├── Map/
│   └── MetaProgression/
└── Utilities/
    ├── Extensions/
    └── Helpers/
```

---

# CLAUDE.md

```md
# Projeto Auto Battler

## Stack
- Unity (LTS)
- C#
- ScriptableObjects

## Arquitetura
- Event Driven (EventBus central)
- Data Driven (ScriptableObjects como fonte de verdade)
- Component Based

## Filosofia do Jogo
- "Quebrar o jogo é divertido" — sinergias absurdas são uma feature
- Herói único com combate automático em tempo real
- Meta-progressão pesada entre runs

## Regras de Código
- Evitar acoplamento direto entre sistemas — usar EventBus
- Separar dados de lógica — SOs definem dados, MonoBehaviours executam lógica
- Usar ScriptableObjects para toda configuração de conteúdo
- Priorizar sistemas reutilizáveis e extensíveis
- Nomear eventos com verbo no passado: OnHeroDied, OnItemEquipped

## Estrutura de Eventos (EventBus)
- Eventos são structs ou classes simples
- EventBus<T>.Subscribe / Publish / Unsubscribe
- Sistemas não se referenciam diretamente

## Objetivo Atual
- Fase 1: Fundação Gameplay
- Implementar sistema de atributos base
- Implementar combate simples (1 herói vs 1 inimigo)
```

---

# Convenções

## Código

* Métodos públicos em PascalCase: `TakeDamage()`
* Variáveis privadas com underscore: `_currentHealth`
* Constantes em UPPER_SNAKE_CASE: `MAX_STACK_COUNT`
* Interfaces com prefixo I: `IDamageable`, `ITargetable`
* Eventos com prefixo On: `OnDamageTaken`, `OnCombatStarted`

## Nomenclatura de Arquivos

* Scripts: `NomeDoSistema.cs`
* ScriptableObjects: `NomeDaCoisa_Definition.asset`
* Prefabs: `PFB_NomeDoObjeto`
* Cenas: `SCN_NomeDaCena`

## Estrutura de Pastas

* Conteúdo de jogo em `ScriptableObjects/` separado por categoria
* Scripts organizados por domínio (não por tipo de arquivo)
* Testes espelham a estrutura de `Scripts/`

## Branches

* `main` — estável, sempre funciona
* `develop` — integração contínua
* `feature/nome-da-feature` — features em desenvolvimento
* `fix/nome-do-bug` — correções

## Commits

* Formato: `[tipo] descrição curta`
* Tipos: `feat`, `fix`, `refactor`, `balance`, `docs`, `test`
* Exemplos:
  * `feat: adiciona sistema de DoT com stacking`
  * `balance: reduz dano base de fogo em 10%`
  * `fix: corrige targeting quando inimigo morre durante ataque`

---

# Sistemas Principais

## Atributos

### Stats Base do Herói
* Vida Máxima
* Vida Atual
* Mana Máxima
* Mana Atual
* Ataque (dano físico base)
* Defesa (redução de dano físico)
* Resistência Elemental (por elemento)
* Crítico (chance %)
* Dano Crítico (multiplicador)
* Velocidade de Ataque
* Velocidade de Movimento

### Estrutura
* `StatDefinition` (SO) — define nome, tipo, valor base, min/max
* `StatModifier` — modificador flat, percentual ou override
* `CharacterStats` — componente que agrega StatDefinitions e aplica modificadores

---

## Equipamentos

### Slots
* Arma (1)
* Armadura (1)
* Elmo (1)
* Acessórios (2)

### Estrutura
* `ItemDefinition` (SO) — nome, slot, stats, encantamentos possíveis, raridade
* `ItemInstance` — instância em runtime com encantamentos aplicados
* `EquipmentManager` — gerencia slots, aplica/remove modificadores de stats

### Raridades
* Comum (branco)
* Incomum (verde)
* Raro (azul)
* Épico (roxo)
* Lendário (laranja) — itens com regras especiais ou builds únicas

---

## Encantamentos

### Triggers
* `OnHit` — ao acertar um ataque
* `OnCrit` — ao acertar um crítico
* `OnKill` — ao matar um inimigo
* `OnDamageTaken` — ao receber dano
* `OnSkillUse` — ao usar uma habilidade
* `OnLowHealth` — ao ficar abaixo de X% de vida

### Estrutura
* `EnchantmentDefinition` (SO) — trigger, efeito, parâmetros
* `TriggerSystem` — escuta eventos de combate e dispara encantamentos ativos

---

## Sistema Elemental

### Elementos
* Fogo 🔥
* Água 💧
* Gelo ❄️
* Raio ⚡
* Vento 🌪️
* Luz ✨
* Trevas 🌑

### Reações Elementais
| Combinação | Reação | Efeito |
|---|---|---|
| Água + Raio | Condução | Dano em área, paralisia |
| Fogo + Vento | Inferno | DoT amplificado |
| Água + Gelo | Congelamento | Inimigo para temporariamente |
| Fogo + Gelo | Explosão Térmica | Burst de dano alto |
| Luz + Trevas | Anulação | Remove todos os buffs/debuffs |

---

## DoT (Dano ao Longo do Tempo)

### Tipos
* **Queimadura** (Fogo) — dano por segundo, stacks amplificam
* **Veneno** (Trevas) — dano por segundo crescente
* **Sangramento** (Físico) — dano por movimento/ataque
* **Choque** (Raio) — reduz resistência elétrica, stacks causam paralisia

### Estrutura
* `DotEffect` (SO) — tipo, dano base, duração, comportamento de stack
* `ActiveDot` — instância ativa em runtime
* `DotManager` — aplica ticks, gerencia stacks, remove ao expirar

---

## Habilidades

### Tipos
* **Ativa** — uso manual (cooldown ou custo de mana)
* **Passiva** — efeito permanente sempre ativo
* **Ultimate** — habilidade poderosa com custo alto de mana
* **Aura** — efeito contínuo em área

### Estrutura
* `SkillDefinition` (SO) — tipo, efeitos, custo, cooldown, condições
* `SkillExecutor` — executa a lógica da habilidade
* `SkillEffect` — efeito individual (dano, cura, buff, debuff)

---

## Recuperação

* **Cura** — restaura vida instantaneamente
* **Regeneração** — restaura vida por segundo
* **Roubo de Vida** — % do dano causado vira cura
* **Escudo** — absorve dano antes da vida; não regenera naturalmente
* **Barreira** — escudo temporário com duração

---

## Defesa

* **Armadura** — redução flat ou percentual de dano físico
* **Resistência Elemental** — redução de dano por elemento
* **Esquiva** — chance de ignorar completamente um ataque
* **Bloqueio** — reduz dano de um ataque a zero (chance)
* **Absorção** — converte parte do dano em mana

---

## Mini Campanha (Mapa da Run)

### Tipos de Nós
| Nó | Descrição |
|---|---|
| ⚔️ Combate | Inimigo comum, recompensa padrão |
| 💀 Elite | Inimigo forte, recompensa melhor |
| 🏪 Loja | Compra itens/encantamentos com ouro |
| 📖 Evento | Escolha narrativa com consequência mecânica |
| 👑 Boss | Fim de ato, recompensa rara garantida |
| 🔥 Fogueira | Cura herói ou melhora um item |

### Estrutura do Mapa
* 3 atos por run
* Mapa ramificado com 2–3 caminhos por seção
* Jogador vê tipo dos nós mas não o conteúdo exato

### Estrutura de Código
* `CampaignNode` (SO) — tipo, peso de spawn, pool de conteúdo
* `CampaignMap` — gera e gerencia o grafo de nós

---

## Recompensas

### Tipos
* Item (equipamento com raridade variável)
* Habilidade (nova skill para o herói)
* Encantamento (adiciona a um item existente)
* Ouro (para gastar na loja)
* Fragmento de Poder (meta-progressão)

### Estrutura
* `RewardPool` (SO) — lista de possíveis recompensas com pesos
* `RewardGenerator` — sorteia 3 opções balanceadas para o jogador escolher

---

## Meta-Progressão

### Moeda: Fragmentos de Poder
* Ganhos ao completar combates, vencer runs e alcançar marcos
* Não se perdem na morte
* Gastos na Árvore de Talentos Permanentes

### Árvore de Talentos Permanentes
* Bônus passivos permanentes (ex: +10 vida base, +1 slot de acessório)
* Acesso a conteúdo exclusivo (heróis, itens iniciais, modos)
* Árvore com nós que se ramificam por especialização

### Desbloqueáveis
* Novos heróis (com kits únicos)
* Expansão do pool de itens e encantamentos nas runs
* Relíquias iniciais (começa a run com um item especial)
* Modos de dificuldade (Ascensão)

---

# MVP

## Escopo Mínimo para Validar Diversão

* 1 herói jogável
* 5 tipos de inimigos
* Sistema de combate automático em tempo real
* Sistema de atributos (6 stats base)
* 2 habilidades (1 ativa, 1 passiva)
* 10 itens com sinergias entre si
* 3 elementos com 2 reações
* 5 encantamentos
* 1 mapa de run com 10 nós (combate + loja + evento + boss)
* Meta-progressão básica (3 upgrades permanentes)

---

# Ordem de Implementação Recomendada

1. **Fundação** — EventBus, GameManager, SceneLoader, Logger
2. **Atributos** — StatDefinition, StatModifier, CharacterStats
3. **Combate Base** — CombatManager, CombatEntity, targeting, dano simples
4. **Efeitos** — DoT, cura, escudo
5. **Elementos** — sistema elemental + reações
6. **Habilidades** — SkillDefinition, SkillExecutor
7. **Itens e Encantamentos** — EquipmentManager, EnchantmentSystem
8. **Campanha** — mapa, nós, eventos
9. **Meta-Progressão** — Fragmentos de Poder, Árvore de Talentos
10. **Balanceamento** — tuning, UX, VFX, SFX

---

# Roadmap

## Milestone 0 — Setup e Fundação ✅ (a fazer)
* Configurar projeto Unity
* Git + GitHub
* Estrutura de pastas
* Arquitetura base (EventBus, GameManager)

## Milestone 1 — Combate Jogável
* Herói vs inimigo simples
* Atributos funcionando
* Dano e morte

## Milestone 2 — Loop de Run
* Mapa com nós
* Recompensas
* Loja funcional

## Milestone 3 — Profundidade
* Sistema elemental completo
* Encantamentos
* 5+ heróis, 20+ itens

## Milestone 4 — Meta e Polimento
* Meta-progressão completa
* Balanceamento
* VFX/SFX
* Testes e ajustes

---

# Próximos Passos Imediatos

1. Definir nome do projeto
2. Criar projeto Unity e repositório GitHub
3. Implementar EventBus e GameManager
4. Criar primeiro protótipo de combate (herói estático vs inimigo estático)
5. Validar: **a sensação de progressão de poder dentro de uma run é divertida?**

## Documentos a Criar em Seguida

* `GDD-resumido.md` — Game Design Document compacto
* `formulas.md` — Fórmulas de dano, cura, escalamento de stats
* `balanceamento.md` — Parâmetros e valores base por raridade/nível
* `arquitetura-tecnica.md` — Diagramas de sistemas e fluxos de dados
* `backlog-mvp.md` — Backlog detalhado do MVP para o Trello
