# Trello — Auto Battler Setup Completo

---

## Colunas (Listas)

| # | Nome | Finalidade |
|---|---|---|
| 1 | 🧠 Ideias | Conceitos não comprometidos, a avaliar |
| 2 | 📋 Backlog | Tarefas definidas, ainda não priorizadas |
| 3 | 🎯 Sprint Atual | O que está sendo feito nesta semana |
| 4 | 🔨 Em Desenvolvimento | Em andamento ativamente |
| 5 | 🧪 Testes | Implementado, aguardando validação |
| 6 | ⚖️ Balanceamento | Funciona, precisa de tuning de valores |
| 7 | 🐛 Bugs | Problemas encontrados |
| 8 | ✅ Concluído | Feito e validado |

---

## Labels

### Por Milestone
| Label | Cor |
|---|---|
| M0 — Fundação | Cinza |
| M1 — Combate | Vermelho |
| M2 — Loop de Run | Laranja |
| M3 — Profundidade | Roxo |
| M4 — Polimento | Azul |

### Por Área Técnica
| Label | Cor |
|---|---|
| Gameplay | Verde |
| UI | Ciano |
| Narrativa | Rosa |
| Arquitetura | Amarelo escuro |
| VFX/Audio | Amarelo claro |
| Balanceamento | Laranja claro |
| Bug | Vermelho escuro |

### Por Prioridade
| Label | Cor |
|---|---|
| 🔴 Crítico | Vermelho |
| 🟠 Alta | Laranja |
| 🟡 Média | Amarelo |
| 🟢 Baixa | Verde claro |

---

## Fluxo de Trabalho

```
Backlog → Sprint Atual → Em Desenvolvimento → Testes → [Balanceamento?] → Concluído
                                                  ↓
                                                Bugs → Em Desenvolvimento
```

- Card vai para **Testes** quando o código está merged na branch develop
- Card vai para **Balanceamento** quando a mecânica funciona mas os valores precisam de tuning
- Card vai para **Concluído** quando testado E validado como divertido
- Bug descoberto: cria card novo em **Bugs** com referência ao card original

---

# 🏗️ MILESTONE 0 — Fundação

---

### [M0] Configurar Trello
`Labels: M0 — Fundação, Arquitetura, 🟠 Alta`

**Checklist — Board**
- [ ] Criar board com nome do projeto
- [ ] Adicionar descrição com link para repositório GitHub
- [ ] Adicionar descrição com link para documento de design

**Checklist — Colunas**
- [ ] Criar coluna: 🧠 Ideias
- [ ] Criar coluna: 📋 Backlog
- [ ] Criar coluna: 🎯 Sprint Atual
- [ ] Criar coluna: 🔨 Em Desenvolvimento
- [ ] Criar coluna: 🧪 Testes
- [ ] Criar coluna: ⚖️ Balanceamento
- [ ] Criar coluna: 🐛 Bugs
- [ ] Criar coluna: ✅ Concluído

**Checklist — Labels de Milestone**
- [ ] Criar label: M0 — Fundação (Cinza)
- [ ] Criar label: M1 — Combate (Vermelho)
- [ ] Criar label: M2 — Loop de Run (Laranja)
- [ ] Criar label: M3 — Profundidade (Roxo)
- [ ] Criar label: M4 — Polimento (Azul)

**Checklist — Labels de Área**
- [ ] Criar label: Gameplay (Verde)
- [ ] Criar label: UI (Ciano)
- [ ] Criar label: Narrativa (Rosa)
- [ ] Criar label: Arquitetura (Amarelo escuro)
- [ ] Criar label: VFX/Audio (Amarelo claro)
- [ ] Criar label: Balanceamento (Laranja claro)
- [ ] Criar label: Bug (Vermelho escuro)

**Checklist — Labels de Prioridade**
- [ ] Criar label: 🔴 Crítico
- [ ] Criar label: 🟠 Alta
- [ ] Criar label: 🟡 Média
- [ ] Criar label: 🟢 Baixa

**Checklist — Cards iniciais**
- [ ] Adicionar todos os cards do M0 na coluna Backlog
- [ ] Aplicar labels corretos em cada card
- [ ] Mover os 3 primeiros cards para Sprint Atual

---

### [M0] Criar projeto Unity LTS
`Labels: M0 — Fundação, Arquitetura, 🔴 Crítico`

**Checklist — Instalação**
- [ ] Baixar e instalar Unity Hub
- [ ] Fazer login com conta Unity
- [ ] Instalar versão Unity LTS mais recente
- [ ] Instalar módulo: Windows Build Support
- [ ] Instalar módulo: Mac Build Support (se aplicável)

**Checklist — Criação do Projeto**
- [ ] Criar novo projeto com template URP (Universal Render Pipeline)
- [ ] Nomear o projeto
- [ ] Definir pasta local
- [ ] Abrir projeto e aguardar compilação inicial

**Checklist — Configuração de Resolução**
- [ ] Abrir Project Settings → Player
- [ ] Definir resolução padrão: 1920x1080
- [ ] Definir resolução mínima: 1280x720
- [ ] Configurar aspect ratio: 16:9

**Checklist — Input System**
- [ ] Abrir Package Manager
- [ ] Instalar pacote: Input System
- [ ] Aceitar reinicialização do editor
- [ ] Verificar Active Input Handling em Project Settings → Player

**Checklist — URP**
- [ ] Verificar que URP Pipeline Asset está criado
- [ ] Verificar que URP está atribuído em Project Settings → Graphics
- [ ] Configurar perfis de qualidade (Low / Medium / High)
- [ ] Remover perfis de qualidade não utilizados

**Checklist — Configurações Gerais**
- [ ] Definir Company Name em Project Settings → Player
- [ ] Definir Product Name
- [ ] Definir Version: 0.1.0
- [ ] Salvar projeto

---

### [M0] Configurar Git e GitHub
`Labels: M0 — Fundação, Arquitetura, 🔴 Crítico`

**Checklist — Repositório**
- [ ] Criar repositório no GitHub com nome do projeto
- [ ] Definir repositório como privado
- [ ] Não inicializar com README (faremos localmente)
- [ ] Copiar URL do repositório remoto

**Checklist — Git Local**
- [ ] Verificar instalação: `git --version`
- [ ] Configurar nome: `git config --global user.name "Seu Nome"`
- [ ] Configurar email: `git config --global user.email "seu@email.com"`
- [ ] Inicializar repositório: `git init` na pasta do projeto

**Checklist — .gitignore**
- [ ] Baixar .gitignore padrão para Unity (github.com/github/gitignore)
- [ ] Adicionar ao projeto como `.gitignore`
- [ ] Verificar que `Library/`, `Temp/`, `Logs/` estão ignoradas
- [ ] Verificar que `.vs/` e `*.csproj` estão ignorados
- [ ] Adicionar regra para `.DS_Store` (Mac)

**Checklist — Git LFS**
- [ ] Instalar Git LFS: `git lfs install`
- [ ] Rastrear assets: `git lfs track "*.png" "*.jpg" "*.psd" "*.fbx" "*.mp3" "*.wav"`
- [ ] Verificar que `.gitattributes` foi criado
- [ ] Verificar que `.gitattributes` não está no .gitignore

**Checklist — Primeiro Commit**
- [ ] `git add .`
- [ ] `git commit -m "feat: setup inicial do projeto Unity"`
- [ ] `git remote add origin [URL do repositório]`
- [ ] `git push -u origin main`
- [ ] Verificar no GitHub que os arquivos apareceram

**Checklist — Branches**
- [ ] Criar branch develop: `git checkout -b develop`
- [ ] Push da develop: `git push -u origin develop`
- [ ] Configurar develop como branch padrão no GitHub (Settings → Branches)
- [ ] Adicionar regra de proteção para main (require PR)
- [ ] Voltar para develop: `git checkout develop`

---

### [M0] Criar estrutura de pastas
`Labels: M0 — Fundação, Arquitetura, 🔴 Crítico`

**Checklist — Pastas raiz em Assets/**
- [ ] Criar pasta: Art/
- [ ] Criar pasta: Audio/
- [ ] Criar pasta: Prefabs/
- [ ] Criar pasta: Scenes/
- [ ] Criar pasta: Scripts/
- [ ] Criar pasta: ScriptableObjects/
- [ ] Criar pasta: UI/
- [ ] Criar pasta: VFX/
- [ ] Criar pasta: Tests/

**Checklist — Subpastas de Art/**
- [ ] Art/Characters/
- [ ] Art/Environment/
- [ ] Art/UI/
- [ ] Art/VFX/

**Checklist — Subpastas de Audio/**
- [ ] Audio/Music/
- [ ] Audio/SFX/

**Checklist — Subpastas de Prefabs/**
- [ ] Prefabs/Characters/
- [ ] Prefabs/Effects/
- [ ] Prefabs/UI/

**Checklist — Cenas**
- [ ] Criar cena: Scenes/Boot.unity
- [ ] Criar cena: Scenes/MainMenu.unity
- [ ] Criar cena: Scenes/Story.unity
- [ ] Criar cena: Scenes/Combat.unity
- [ ] Remover cena SampleScene padrão da Unity

**Checklist — Subpastas de Scripts/**
- [ ] Scripts/Core/
- [ ] Scripts/Core/Data/
- [ ] Scripts/Core/Events/
- [ ] Scripts/Combat/
- [ ] Scripts/Stats/
- [ ] Scripts/Skills/
- [ ] Scripts/Effects/
- [ ] Scripts/Items/
- [ ] Scripts/Characters/
- [ ] Scripts/Campaign/
- [ ] Scripts/UI/
- [ ] Scripts/Utilities/

**Checklist — Subpastas de ScriptableObjects/**
- [ ] ScriptableObjects/Items/
- [ ] ScriptableObjects/Skills/
- [ ] ScriptableObjects/Enemies/
- [ ] ScriptableObjects/Enchantments/
- [ ] ScriptableObjects/Story/

**Checklist — Tests/**
- [ ] Tests/EditMode/
- [ ] Tests/PlayMode/
- [ ] Adicionar Assembly Definition para EditMode
- [ ] Adicionar Assembly Definition para PlayMode

**Checklist — Commit**
- [ ] `git add .`
- [ ] `git commit -m "feat: cria estrutura de pastas do projeto"`
- [ ] `git push`

---

### [M0] Implementar EventBus
`Labels: M0 — Fundação, Arquitetura, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Core/EventBus.cs
- [ ] Implementar classe genérica `EventBus<T>`
- [ ] Implementar método estático `Subscribe(Action<T> listener)`
- [ ] Implementar método estático `Unsubscribe(Action<T> listener)`
- [ ] Implementar método estático `Publish(T eventData)`
- [ ] Publish não quebra se não houver listeners
- [ ] Unsubscribe não quebra se listener não estiver inscrito
- [ ] Adicionar logs de debug desabilitáveis via #if UNITY_EDITOR

**Checklist — Eventos base**
- [ ] Criar pasta: Scripts/Core/Events/
- [ ] Criar struct: GameStateChangedEvent (estadoAnterior, novoEstado)
- [ ] Criar struct: CombatStartedEvent
- [ ] Criar struct: CombatEndedEvent (heroWon: bool)
- [ ] Criar struct: HeroDiedEvent
- [ ] Criar struct: EnemyDiedEvent (referência ao inimigo)
- [ ] Criar struct: DamageTakenEvent (entidade, valor, isCritical, sourceId)
- [ ] Criar struct: ItemActivatedEvent (slot, itemInstance)
- [ ] Criar struct: NodeEnteredEvent (storyNode)
- [ ] Criar struct: ChoiceMadeEvent (storyChoice)

**Checklist — Testes**
- [ ] Criar: Tests/EditMode/EventBusTests.cs
- [ ] Teste: subscriber recebe evento publicado
- [ ] Teste: múltiplos subscribers recebem o mesmo evento
- [ ] Teste: unsubscribe impede recebimento futuro
- [ ] Teste: publicar sem subscribers não lança exceção
- [ ] Executar todos os testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa EventBus genérico com eventos base e testes"`

---

### [M0] Implementar GameManager
`Labels: M0 — Fundação, Arquitetura, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Core/GameManager.cs
- [ ] Implementar padrão Singleton com DontDestroyOnLoad
- [ ] Criar enum GameState: Menu, Run, Combat, GameOver
- [ ] Implementar propriedade CurrentState (somente leitura)
- [ ] Implementar método ChangeState(GameState newState)
- [ ] Publicar GameStateChangedEvent ao mudar estado
- [ ] Bloquear transições inválidas (ex: Combat → Menu direto)
- [ ] Log de cada mudança de estado via Logger

**Checklist — Cena Boot**
- [ ] Criar GameObject "GameManager" na cena Boot
- [ ] Adicionar componente GameManager
- [ ] Definir estado inicial: Menu
- [ ] Verificar que persiste entre cenas

**Checklist — Testes**
- [ ] Criar: Tests/EditMode/GameManagerTests.cs
- [ ] Teste: estado inicial é Menu
- [ ] Teste: mudança de estado publica GameStateChangedEvent
- [ ] Teste: Singleton não cria segunda instância
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa GameManager com máquina de estados"`

---

### [M0] Implementar SceneLoader
`Labels: M0 — Fundação, Arquitetura, 🟠 Alta`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Core/SceneLoader.cs
- [ ] Enum SceneIndex com nomes de todas as cenas
- [ ] Método LoadScene(SceneIndex index) — assíncrono
- [ ] Mostrar tela de loading ao iniciar carregamento
- [ ] Ocultar tela de loading ao completar
- [ ] Publicar evento ao iniciar e ao completar carregamento
- [ ] Prevenir chamadas duplicadas durante carregamento em andamento

**Checklist — Tela de Loading**
- [ ] Criar prefab: Prefabs/UI/PFB_LoadingScreen
- [ ] Fundo sólido sem transparência
- [ ] Barra de progresso opcional
- [ ] Testar que cobre a tela completamente durante transição

**Checklist — Build Settings**
- [ ] Abrir File → Build Settings
- [ ] Adicionar Boot (índice 0)
- [ ] Adicionar MainMenu (índice 1)
- [ ] Adicionar Story (índice 2)
- [ ] Adicionar Combat (índice 3)

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa SceneLoader com loading screen"`

---

### [M0] Implementar Logger
`Labels: M0 — Fundação, Arquitetura, 🟢 Baixa`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Core/Logger.cs
- [ ] Criar enum LogLevel: Info, Warning, Error
- [ ] Implementar Log(string message, LogLevel level, string context = "")
- [ ] Implementar LogInfo / LogWarning / LogError como atalhos
- [ ] Prefixo de contexto: `[NomeDoSistema] mensagem`
- [ ] Info desabilitado em builds Release via #if UNITY_EDITOR
- [ ] Warning e Error ativos em todos os builds

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa Logger com níveis e controle por build"`

---

### [M0] Implementar IDataService + LocalSaveService
`Labels: M0 — Fundação, Arquitetura, 🔴 Crítico`

**Checklist — Interface IDataService**
- [ ] Criar arquivo: Scripts/Core/Data/IDataService.cs
- [ ] Declarar: void Save<T>(string key, T data)
- [ ] Declarar: T Load<T>(string key)
- [ ] Declarar: bool Exists(string key)
- [ ] Declarar: void Delete(string key)

**Checklist — Modelos de Dados**
- [ ] Criar: Scripts/Core/Data/RunSaveData.cs
  - [ ] string currentNodeId
  - [ ] List<string> choiceHistory
  - [ ] List<string> equippedItemIds
  - [ ] List<string> enchantmentIds
  - [ ] int gold
  - [ ] float currentHealth
- [ ] Criar: Scripts/Core/Data/MetaProgressionData.cs
  - [ ] int fragmentsOfPower
  - [ ] List<string> unlockedHeroIds
  - [ ] List<string> unlockedNodeIds
  - [ ] List<string> purchasedTalents
  - [ ] int totalRunsCompleted
  - [ ] int totalRunsAttempted

**Checklist — LocalSaveService**
- [ ] Criar arquivo: Scripts/Core/Data/LocalSaveService.cs
- [ ] Implementar IDataService
- [ ] Usar Application.persistentDataPath como pasta de save
- [ ] Serializar com JsonUtility
- [ ] Save: serializa e escreve arquivo JSON
- [ ] Load: lê arquivo e desserializa
- [ ] Exists: verifica se arquivo existe
- [ ] Delete: remove arquivo
- [ ] Tratar exceções IO com try/catch e Logger.LogError
- [ ] Criar pasta de save se não existir

**Checklist — Integração com GameManager**
- [ ] Adicionar propriedade IDataService DataService no GameManager
- [ ] Instanciar LocalSaveService no Awake
- [ ] Acesso global via GameManager.Instance.DataService

**Checklist — Testes**
- [ ] Criar: Tests/EditMode/LocalSaveServiceTests.cs
- [ ] Teste: salvar e carregar string
- [ ] Teste: salvar e carregar RunSaveData
- [ ] Teste: Exists retorna false para chave inexistente
- [ ] Teste: Exists retorna true após salvar
- [ ] Teste: Delete remove o arquivo
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa IDataService e LocalSaveService com testes"`

---

# ⚔️ MILESTONE 1 — Combate Jogável

---

### [M1] Implementar StatDefinition (SO)
`Labels: M1 — Combate, Gameplay, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Stats/StatDefinition.cs
- [ ] Herdar de ScriptableObject
- [ ] Campo: string statName
- [ ] Campo: string statId (único, snake_case ex: "max_health")
- [ ] Campo: float baseValue
- [ ] Campo: float minValue
- [ ] Campo: float maxValue
- [ ] Campo: bool isPercentage (para exibição na UI)
- [ ] Adicionar [CreateAssetMenu] com caminho organizado

**Checklist — Criar assets**
- [ ] ScriptableObjects/Stats/Stat_MaxHealth (base: 100, min: 1)
- [ ] ScriptableObjects/Stats/Stat_Attack (base: 10, min: 1)
- [ ] ScriptableObjects/Stats/Stat_Armor (base: 0, min: 0)
- [ ] ScriptableObjects/Stats/Stat_CritChance (base: 5, min: 0, max: 100, isPercentage)
- [ ] ScriptableObjects/Stats/Stat_CritDamage (base: 150, min: 100, isPercentage)
- [ ] ScriptableObjects/Stats/Stat_AttackSpeed (base: 1.0, min: 0.1)
- [ ] ScriptableObjects/Stats/Stat_MoveSpeed (base: 3.0, min: 0.5)

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa StatDefinition SO e cria 7 assets de stats"`

---

### [M1] Implementar StatModifier
`Labels: M1 — Combate, Gameplay, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Stats/StatModifier.cs
- [ ] Criar enum ModifierType: Flat, Percentage, Override
- [ ] Campo: string statId
- [ ] Campo: float value
- [ ] Campo: ModifierType type
- [ ] Campo: string sourceId (item, encantamento ou habilidade que aplicou)
- [ ] Construtor com todos os campos
- [ ] Documentar ordem de aplicação: Flat → Percentage → Override

**Checklist — Testes**
- [ ] Criar: Tests/EditMode/StatModifierTests.cs
- [ ] Teste: Flat adiciona valor corretamente
- [ ] Teste: Percentage multiplica sobre base + Flat
- [ ] Teste: Override ignora outros modificadores
- [ ] Teste: múltiplos Flat acumulam
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa StatModifier com tipos Flat, Percentage e Override"`

---

### [M1] Implementar CharacterStats
`Labels: M1 — Combate, Gameplay, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Stats/CharacterStats.cs
- [ ] Herdar de MonoBehaviour
- [ ] Campo: List<StatDefinition> baseStats (Inspector)
- [ ] Dictionary<string, float> valores calculados (interno)
- [ ] Dictionary<string, List<StatModifier>> modificadores ativos (interno)
- [ ] Método: float GetStat(string statId)
- [ ] Método: void AddModifier(StatModifier modifier)
- [ ] Método: void RemoveModifier(StatModifier modifier)
- [ ] Método: void RemoveAllModifiersFromSource(string sourceId)
- [ ] Método privado: RecalculateStat(string statId)
- [ ] Publicar OnStatChanged via EventBus ao recalcular
- [ ] GetStat nunca retorna abaixo de minValue
- [ ] GetStat nunca retorna acima de maxValue

**Checklist — Testes**
- [ ] Criar: Tests/EditMode/CharacterStatsTests.cs
- [ ] Teste: GetStat retorna valor base sem modificadores
- [ ] Teste: AddModifier Flat altera o valor
- [ ] Teste: RemoveModifier reverte para valor anterior
- [ ] Teste: RemoveAllModifiersFromSource remove apenas do source correto
- [ ] Teste: valor não ultrapassa maxValue
- [ ] Teste: valor não cai abaixo de minValue
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa CharacterStats com modificadores e testes"`

---

### [M1] Implementar CombatEntity
`Labels: M1 — Combate, Gameplay, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Combat/CombatEntity.cs
- [ ] Herdar de MonoBehaviour
- [ ] Referência ao CharacterStats
- [ ] Propriedade: float CurrentHealth (somente leitura)
- [ ] Propriedade: float MaxHealth (lido de CharacterStats)
- [ ] Propriedade: bool IsAlive
- [ ] Método: void TakeDamage(float amount, string sourceId)
- [ ] Método: void Heal(float amount)
- [ ] Método privado: Die()
- [ ] Publicar DamageTakenEvent (entidade, valor, sourceId)
- [ ] Publicar HealedEvent (entidade, valor)
- [ ] Publicar EntityDiedEvent ao morrer
- [ ] CurrentHealth nunca abaixo de 0
- [ ] Entidade morta não recebe mais dano

**Checklist — Testes**
- [ ] Criar: Tests/EditMode/CombatEntityTests.cs
- [ ] Teste: TakeDamage reduz CurrentHealth
- [ ] Teste: CurrentHealth não vai abaixo de 0
- [ ] Teste: EntityDiedEvent publicado quando health = 0
- [ ] Teste: entidade morta não recebe mais dano
- [ ] Teste: Heal aumenta CurrentHealth
- [ ] Teste: Heal não ultrapassa MaxHealth
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa CombatEntity com TakeDamage, Heal e morte"`

---

### [M1] Implementar DamageCalculator
`Labels: M1 — Combate, Gameplay, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Combat/DamageCalculator.cs
- [ ] Criar struct: DamageResult (float finalDamage, bool isCritical)
- [ ] Método estático: DamageResult Calculate(CharacterStats attacker, CharacterStats defender)
- [ ] Dano base = attacker.Attack
- [ ] Aplicar Armadura: dano = base * (100 / (100 + armor))
- [ ] Rolar crítico com attacker.CritChance
- [ ] Se crítico: multiplicar por attacker.CritDamage / 100
- [ ] Dano mínimo garantido: 1
- [ ] Comentar a fórmula no código

**Checklist — Testes**
- [ ] Criar: Tests/EditMode/DamageCalculatorTests.cs
- [ ] Teste: dano sem armadura = ataque base
- [ ] Teste: armadura reduz dano corretamente
- [ ] Teste: crítico aplica multiplicador
- [ ] Teste: dano mínimo é sempre 1
- [ ] Teste: CritChance 0% nunca critica
- [ ] Teste: CritChance 100% sempre critica
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa DamageCalculator com armadura, crítico e testes"`

---

### [M1] Implementar TargetingSystem
`Labels: M1 — Combate, Gameplay, 🟠 Alta`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Combat/TargetingSystem.cs
- [ ] Herdar de MonoBehaviour
- [ ] Método: CombatEntity GetTarget(CombatEntity attacker, List<CombatEntity> candidates)
- [ ] Lógica padrão: primeiro vivo da lista
- [ ] Ignorar entidades com IsAlive == false
- [ ] Retornar null se lista vazia ou todos mortos
- [ ] Publicar TargetChangedEvent quando alvo muda
- [ ] Assinar EntityDiedEvent para atualizar alvo automaticamente

**Checklist — Testes**
- [ ] Teste: retorna primeiro vivo da lista
- [ ] Teste: ignora entidades mortas
- [ ] Teste: retorna null com lista vazia
- [ ] Teste: retorna null se todos mortos
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa TargetingSystem"`

---

### [M1] Implementar CombatManager
`Labels: M1 — Combate, Gameplay, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Combat/CombatManager.cs
- [ ] Herdar de MonoBehaviour
- [ ] Referência ao HeroController
- [ ] Lista de EnemyController ativos
- [ ] Referência ao TargetingSystem
- [ ] Enum CombatState: Idle, Active, Paused, Ended
- [ ] Método: void StartCombat()
- [ ] Método: void PauseCombat()
- [ ] Método: void ResumeCombat()
- [ ] Método: void EndCombat(bool heroWon)
- [ ] Coroutine: loop de combate automático
- [ ] Detectar vitória: todos os inimigos mortos
- [ ] Detectar derrota: herói morto
- [ ] Publicar CombatStartedEvent
- [ ] Publicar CombatEndedEvent(heroWon)
- [ ] Assinar EntityDiedEvent para detectar fim de combate

**Checklist — Testes de Integração**
- [ ] Testar: herói vence inimigo mais fraco
- [ ] Testar: herói perde para inimigo mais forte
- [ ] Testar: CombatEndedEvent publicado nos dois casos
- [ ] Testar: PauseCombat / ResumeCombat funcionam

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa CombatManager com loop automático"`

---

### [M1] Implementar ArenaController
`Labels: M1 — Combate, Gameplay, 🟠 Alta`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Combat/ArenaController.cs
- [ ] Posições fixas: herói (esquerda) e inimigo (direita)
- [ ] Método: void SetupArena(HeroController hero, EnemyController enemy)
- [ ] Posicionar herói e inimigo nas posições
- [ ] Ajustar câmera para enquadrar os dois
- [ ] Assinar CombatEndedEvent para limpar arena

**Checklist — Cena Combat**
- [ ] Abrir cena Combat.unity
- [ ] Criar GameObject: Arena
- [ ] Criar GameObject vazio: HeroSpawnPoint (posição -3, 0, 0)
- [ ] Criar GameObject vazio: EnemySpawnPoint (posição +3, 0, 0)
- [ ] Adicionar CombatManager à cena
- [ ] Adicionar ArenaController à cena
- [ ] Adicionar TargetingSystem à cena
- [ ] Câmera principal centralizada

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa ArenaController e configura cena de combate"`

---

### [M1] HeroDefinition (SO) e HeroController
`Labels: M1 — Combate, Gameplay, 🔴 Crítico`

**Checklist — HeroDefinition**
- [ ] Criar arquivo: Scripts/Characters/HeroDefinition.cs
- [ ] Herdar de ScriptableObject
- [ ] Campo: string heroId
- [ ] Campo: string heroName
- [ ] Campo: Sprite portrait
- [ ] Campo: GameObject prefab
- [ ] Campo: List<StatDefinition> baseStats
- [ ] Campo: List<ItemDefinition> startingItems
- [ ] Adicionar [CreateAssetMenu]
- [ ] Criar asset: Hero_Default com stats base

**Checklist — HeroController**
- [ ] Criar arquivo: Scripts/Characters/HeroController.cs
- [ ] Referência ao HeroDefinition
- [ ] Referência ao CharacterStats
- [ ] Referência ao CombatEntity
- [ ] Método: void Initialize(HeroDefinition definition)
- [ ] Inicializar stats a partir da HeroDefinition
- [ ] Coroutine: ataque automático com intervalo de AttackSpeed
- [ ] Método: void PerformAttack(CombatEntity target)
- [ ] Usar DamageCalculator para calcular dano
- [ ] Chamar target.TakeDamage com resultado
- [ ] Publicar HeroAttackedEvent

**Checklist — Prefab**
- [ ] Criar prefab: Prefabs/Characters/PFB_Hero
- [ ] Adicionar componentes: HeroController, CharacterStats, CombatEntity
- [ ] Adicionar sprite placeholder

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa HeroDefinition e HeroController"`

---

### [M1] EnemyDefinition (SO) e EnemyController
`Labels: M1 — Combate, Gameplay, 🔴 Crítico`

**Checklist — EnemyDefinition**
- [ ] Criar arquivo: Scripts/Characters/EnemyDefinition.cs
- [ ] Campo: string enemyId
- [ ] Campo: string enemyName
- [ ] Campo: Sprite sprite
- [ ] Campo: GameObject prefab
- [ ] Campo: List<StatDefinition> baseStats
- [ ] Campo: bool isElite
- [ ] Adicionar [CreateAssetMenu]

**Checklist — Criar 5 inimigos**
- [ ] Enemy_Goblin — stats: vida baixa, ataque médio, velocidade alta
- [ ] Enemy_Orc — stats: vida alta, ataque alto, velocidade baixa
- [ ] Enemy_Archer — stats: vida média, ataque médio, velocidade média
- [ ] Enemy_Shaman — stats: vida média, aplica DoT_Fogo a cada 3s
- [ ] Enemy_Troll — elite: vida muito alta, ataque alto, armadura alta
- [ ] Definir e preencher stats base de cada inimigo

**Checklist — EnemyController**
- [ ] Criar arquivo: Scripts/Characters/EnemyController.cs
- [ ] Referências: EnemyDefinition, CharacterStats, CombatEntity
- [ ] Método: void Initialize(EnemyDefinition definition)
- [ ] Coroutine: ataque automático com AttackSpeed do inimigo
- [ ] Método: void PerformAttack(CombatEntity target)
- [ ] Usar DamageCalculator para calcular dano

**Checklist — Prefab**
- [ ] Criar prefab base: Prefabs/Characters/PFB_Enemy
- [ ] Adicionar componentes: EnemyController, CharacterStats, CombatEntity
- [ ] Adicionar sprite placeholder

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa EnemyController e cria 5 inimigos"`

---

### [M1] Implementar DoT (DotEffect + DotManager)
`Labels: M1 — Combate, Gameplay, 🟠 Alta`

**Checklist — DotEffect (SO)**
- [ ] Criar arquivo: Scripts/Effects/DotEffect.cs
- [ ] Herdar de ScriptableObject
- [ ] Enum DotType: Sangramento, Fogo
- [ ] Campo: string dotId
- [ ] Campo: DotType type
- [ ] Campo: float damagePerTick
- [ ] Campo: float tickInterval
- [ ] Campo: float duration
- [ ] Campo: int maxStacks
- [ ] Campo: bool stacksAmplifyDamage
- [ ] Adicionar [CreateAssetMenu]
- [ ] Criar asset: DoT_Sangramento
- [ ] Criar asset: DoT_Fogo

**Checklist — ActiveDot**
- [ ] Criar arquivo: Scripts/Effects/ActiveDot.cs
- [ ] Campo: DotEffect definition
- [ ] Campo: int currentStacks
- [ ] Campo: float remainingDuration
- [ ] Campo: float timeSinceLastTick
- [ ] Método: float GetCurrentDamage() — calcula com stacks
- [ ] Método: void AddStack() — respeita maxStacks
- [ ] Método: bool Tick(float deltaTime) — retorna true se deve causar dano

**Checklist — DotManager**
- [ ] Criar arquivo: Scripts/Effects/DotManager.cs
- [ ] Herdar de MonoBehaviour
- [ ] Lista de ActiveDots ativos
- [ ] Método: void ApplyDot(DotEffect effect, CombatEntity target)
- [ ] Se DoT mesmo tipo já existe: AddStack em vez de criar novo
- [ ] Update: Tick em todos os ActiveDots
- [ ] Chamar target.TakeDamage quando tick ativo
- [ ] Remover ActiveDot ao expirar
- [ ] Publicar DotAppliedEvent (tipo, alvo, stacks)
- [ ] Publicar DotExpiredEvent (tipo, alvo)

**Checklist — Testes**
- [ ] Teste: DoT causa dano após tickInterval
- [ ] Teste: DoT expira após duration
- [ ] Teste: AddStack aumenta dano quando stacksAmplifyDamage = true
- [ ] Teste: stacks não ultrapassam maxStacks
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa sistema de DoT com stacking e testes"`

---

### [M1] HUD básico de combate
`Labels: M1 — Combate, UI, 🟠 Alta`

**Checklist — Barra de Vida (Prefab)**
- [ ] Criar prefab: Prefabs/UI/PFB_HealthBar
- [ ] Adicionar Slider como barra
- [ ] Adicionar texto com "85/100"
- [ ] Animação suave com Lerp
- [ ] Cor: verde > 50%, amarelo > 25%, vermelho < 25%

**Checklist — HUD do Herói**
- [ ] Criar canvas HUD na cena Combat
- [ ] HealthBar do herói no canto inferior esquerdo
- [ ] Nome do herói acima da barra
- [ ] Ícones de DoT ativo (Sangramento vermelho, Fogo laranja)
- [ ] Assinar DamageTakenEvent para atualizar barra

**Checklist — HUD do Inimigo**
- [ ] HealthBar do inimigo no canto superior
- [ ] Nome do inimigo
- [ ] Ícones de DoT ativo
- [ ] Assinar DamageTakenEvent do inimigo

**Checklist — Números de Dano Flutuantes**
- [ ] Criar prefab: Prefabs/UI/PFB_DamageNumber
- [ ] Texto sobe e some (animação)
- [ ] Cor branca para dano normal
- [ ] Cor amarela para crítico
- [ ] Cor vermelha escura para DoT
- [ ] Instanciar sobre a entidade ao receber dano

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa HUD de combate com barras de vida e damage numbers"`

---

# 📖 MILESTONE 2 — Loop de Run

---

### [M2] Implementar StoryNode (SO)
`Labels: M2 — Loop de Run, Narrativa, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Campaign/StoryNode.cs
- [ ] Herdar de ScriptableObject
- [ ] Campo: string nodeId (único)
- [ ] Campo: string narrativeText
- [ ] Enum NodeType: Narrative, Combat, Elite, Shop, Rest, Boss
- [ ] Campo: NodeType nodeType
- [ ] Campo: List<StoryChoice> choices
- [ ] Campo: EnemyDefinition enemy (nulos para não-combate)
- [ ] Campo: bool requiresUnlock
- [ ] Campo: string unlockConditionId
- [ ] Adicionar [CreateAssetMenu]
- [ ] Validação no Editor: nó sem choices é inválido
- [ ] Validação: nó Combat sem enemy é inválido

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa StoryNode SO com validação"`

---

### [M2] Implementar StoryChoice e StoryReward
`Labels: M2 — Loop de Run, Narrativa, 🔴 Crítico`

**Checklist — StoryReward**
- [ ] Criar arquivo: Scripts/Campaign/StoryReward.cs
- [ ] Enum RewardType: Item, Enchantment, Gold, Heal, Skill
- [ ] Campo: RewardType rewardType
- [ ] Campo: ItemDefinition item (pode ser null)
- [ ] Campo: EnchantmentDefinition enchantment (pode ser null)
- [ ] Campo: int goldAmount
- [ ] Campo: float healAmount (percentual de vida máxima)
- [ ] Campo: SkillDefinition skill (pode ser null)

**Checklist — StoryChoice**
- [ ] Criar arquivo: Scripts/Campaign/StoryChoice.cs
- [ ] Campo: string choiceText
- [ ] Campo: StoryNode nextNode
- [ ] Campo: StoryReward reward (pode ser null)
- [ ] Campo: string tooltipText (dica opcional)

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa StoryChoice e StoryReward"`

---

### [M2] Implementar RunState
`Labels: M2 — Loop de Run, Arquitetura, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Campaign/RunState.cs
- [ ] Campo: StoryNode currentNode
- [ ] Campo: List<string> choiceHistory
- [ ] Campo: List<ItemInstance> equippedItems (12 slots)
- [ ] Campo: int gold
- [ ] Campo: float currentHealth
- [ ] Método: void ApplyReward(StoryReward reward)
- [ ] Método: RunSaveData ToSaveData()
- [ ] Método estático: RunState FromSaveData(RunSaveData data)
- [ ] Publicar RunStateChangedEvent ao modificar

**Checklist — Persistência**
- [ ] Salvar via DataService após cada escolha
- [ ] Carregar save existente ao iniciar cena Story
- [ ] Apagar save ao terminar a run (vitória ou derrota)

**Checklist — Testes**
- [ ] Teste: ApplyReward com Item adiciona ao inventário
- [ ] Teste: ApplyReward com Gold incrementa gold
- [ ] Teste: ApplyReward com Heal aumenta currentHealth
- [ ] Teste: ToSaveData / FromSaveData são inversos
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa RunState com persistência e testes"`

---

### [M2] Implementar StoryRunner
`Labels: M2 — Loop de Run, Narrativa, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Campaign/StoryRunner.cs
- [ ] Herdar de MonoBehaviour
- [ ] Referência ao RunState
- [ ] Campo: StoryNode startNode (Inspector)
- [ ] Método: void StartRun()
- [ ] Método: void GoToNode(StoryNode node)
- [ ] Método: void MakeChoice(StoryChoice choice)
- [ ] Aplicar StoryReward ao RunState ao fazer escolha
- [ ] Se nodeType == Combat: transição para cena Combat
- [ ] Se nodeType == Boss: carregar RivalDefinition correto
- [ ] Publicar NodeEnteredEvent
- [ ] Publicar ChoiceMadeEvent
- [ ] Assinar CombatEndedEvent para retomar após combate
- [ ] Se heroWon == false em CombatEndedEvent: ir para Game Over

**Checklist — Testes de Integração**
- [ ] Testar: escolha avança para nó correto
- [ ] Testar: recompensa aplicada ao RunState
- [ ] Testar: nó Combat dispara transição de cena

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa StoryRunner com fluxo narrativo completo"`

---

### [M2] Escrever árvore narrativa do MVP
`Labels: M2 — Loop de Run, Narrativa, 🔴 Crítico`

**Checklist — Planejamento**
- [ ] Definir tema e mundo da história
- [ ] Esboçar árvore: 1 cena inicial + 2 caminhos de ~6 cenas cada
- [ ] Definir Rival A (caminho esquerdo) com build coerente
- [ ] Definir Rival B (caminho direito) com build coerente
- [ ] Mapear tipos de nó por cena: Combat, Loja, Descanso, Elite, Boss
- [ ] Garantir que cada caminho tem recompensas que induzem builds diferentes

**Checklist — Escrita**
- [ ] Escrever cena inicial (compartilhada, 2–3 escolhas)
- [ ] Escrever 6 cenas do caminho A com texto e escolhas
- [ ] Escrever 6 cenas do caminho B com texto e escolhas
- [ ] Escrever cena de Boss A
- [ ] Escrever cena de Boss B
- [ ] Revisar coerência narrativa do caminho A
- [ ] Revisar coerência narrativa do caminho B
- [ ] Revisar que escolhas têm peso narrativo real

**Checklist — Assets no Unity**
- [ ] Criar ~15 assets StoryNode
- [ ] Criar ~30 assets StoryChoice
- [ ] Criar ~15 assets StoryReward
- [ ] Linkar nextNode em cada StoryChoice
- [ ] Preencher rewards em cada StoryChoice
- [ ] Testar fluxo completo: início → cena final Rival A
- [ ] Testar fluxo completo: início → cena final Rival B

**Checklist — Commit**
- [ ] `git commit -m "feat: cria árvore narrativa do MVP com 15 cenas e 2 rivais"`

---

### [M2] Implementar ItemDefinition (SO)
`Labels: M2 — Loop de Run, Gameplay, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Items/ItemDefinition.cs
- [ ] Herdar de ScriptableObject
- [ ] Campo: string itemId
- [ ] Campo: string itemName
- [ ] Campo: Sprite icon
- [ ] Enum ItemSlot: Sword, Shield, Helmet, Chest, Pants, Boots, Gloves, Belt, Cape, Ring1, Ring2, Necklace
- [ ] Campo: ItemSlot slot
- [ ] Enum ItemTier: Tier1, Tier2, Tier3Legendary
- [ ] Campo: ItemTier tier
- [ ] Campo: bool isLegendaryExclusive
- [ ] Campo: List<StatModifier> statModifiers
- [ ] Campo: string activationDescription
- [ ] Campo: float activationCooldown
- [ ] Adicionar [CreateAssetMenu]

**Checklist — Criar 10 itens do MVP**
- [ ] Item 01: Espada Enferrujada (Sword, T1) — +5 Ataque, cooldown 2s
- [ ] Item 02: Escudo de Madeira (Shield, T1) — +10 Armadura, cooldown 4s
- [ ] Item 03: Elmo de Couro (Helmet, T1) — +15 Vida, cooldown 5s
- [ ] Item 04: Peitoral de Malha (Chest, T2) — +20 Armadura, cooldown 4s
- [ ] Item 05: Botas Ágeis (Boots, T1) — +0.5 Vel. Ataque, cooldown 3s
- [ ] Item 06: Luvas de Combate (Gloves, T1) — +3 Ataque, +5% Crítico, cooldown 2s
- [ ] Item 07: Cinto de Força (Belt, T2) — +10 Ataque, cooldown 3s
- [ ] Item 08: Anel da Sorte (Ring1, T1) — +10% Crítico, cooldown 6s
- [ ] Item 09: Colar de Vampiro (Necklace, T2) — ativação cura 10 de vida, cooldown 5s
- [ ] Item 10: Capa das Sombras (Cape, T3, isLegendaryExclusive) — ativação especial, cooldown 8s

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa ItemDefinition e cria 10 itens do MVP"`

---

### [M2] Implementar ItemInstance e EquipmentManager
`Labels: M2 — Loop de Run, Gameplay, 🔴 Crítico`

**Checklist — ItemInstance**
- [ ] Criar arquivo: Scripts/Items/ItemInstance.cs
- [ ] Campo: ItemDefinition definition
- [ ] Campo: EnchantmentInstance enchantment (pode ser null)
- [ ] Campo: float currentCooldown
- [ ] Propriedade: bool IsOnCooldown
- [ ] Método: void Tick(float deltaTime)
- [ ] Método: bool TryActivate() — ativa se cooldown == 0, reinicia cooldown
- [ ] Método: void ApplyEnchantment(EnchantmentDefinition enchantment)

**Checklist — EquipmentManager**
- [ ] Criar arquivo: Scripts/Items/EquipmentManager.cs
- [ ] Herdar de MonoBehaviour
- [ ] Dictionary<ItemSlot, ItemInstance> slots
- [ ] Método: bool Equip(ItemInstance item)
- [ ] Método: ItemInstance Unequip(ItemSlot slot)
- [ ] Método: ItemInstance GetItem(ItemSlot slot)
- [ ] Método: List<ItemInstance> GetAllEquipped()
- [ ] Ao equipar: aplicar StatModifiers ao CharacterStats
- [ ] Ao desequipar: remover StatModifiers
- [ ] Publicar ItemEquippedEvent
- [ ] Publicar ItemUnequippedEvent
- [ ] Update: Tick em todos os itens equipados
- [ ] Disparar ItemActivatedEvent quando TryActivate retorna true

**Checklist — Testes**
- [ ] Teste: equipar aplica StatModifiers
- [ ] Teste: desequipar remove StatModifiers
- [ ] Teste: slot correto usado por ItemSlot
- [ ] Teste: TryActivate retorna false se em cooldown
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa ItemInstance e EquipmentManager com 12 slots"`

---

### [M2] Implementar EnchantmentDefinition e EnchantmentInstance
`Labels: M2 — Loop de Run, Gameplay, 🔴 Crítico`

**Checklist — EnchantmentDefinition**
- [ ] Criar arquivo: Scripts/Items/EnchantmentDefinition.cs
- [ ] Herdar de ScriptableObject
- [ ] Enum EnchantmentCategory: Elemental, DoT, Pacifist
- [ ] Enum EnchantmentType: Ice, Lightning, Bleed, Fire, Heal, Shield
- [ ] Campo: EnchantmentCategory category
- [ ] Campo: EnchantmentType type
- [ ] Campo: string enchantmentName
- [ ] Campo: string description
- [ ] Campo: OverchargeEffect overchargeEffect
- [ ] Campo: int[] overchargeThreshold (3 valores: T1, T2, T3)
- [ ] Campo: float stacksPerActivation (base)
- [ ] Campo: float stacksBonusTier2
- [ ] Campo: float stacksBonusTier3
- [ ] Adicionar [CreateAssetMenu]

**Checklist — Criar 6 assets**
- [ ] Enchantment_Ice (Elemental, Gelo) — Sobrecarga: Congelamento
- [ ] Enchantment_Lightning (Elemental, Raio) — Sobrecarga: Eletrificado
- [ ] Enchantment_Bleed (DoT, Sangramento) — Sobrecarga: Hemorragia
- [ ] Enchantment_Fire (DoT, Fogo) — Sobrecarga: Carbonização
- [ ] Enchantment_Heal (Pacifista, Cura) — Sobrecarga: Esteroide
- [ ] Enchantment_Shield (Pacifista, Escudo) — Sobrecarga: Imunização
- [ ] Preencher thresholds e stacks para cada um

**Checklist — EnchantmentInstance**
- [ ] Criar arquivo: Scripts/Items/EnchantmentInstance.cs
- [ ] Campo: EnchantmentDefinition definition
- [ ] Campo: ItemTier hostItemTier
- [ ] Campo: float currentStacks
- [ ] Propriedade: int OverchargeThreshold (baseado no tier)
- [ ] Propriedade: bool IsOvercharged
- [ ] Método: void AddStacks(float amount)
- [ ] Método: void ResetStacks()

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa EnchantmentDefinition, 6 encantamentos e EnchantmentInstance"`

---

### [M2] Implementar EnchantmentSystem e OverchargeEffect
`Labels: M2 — Loop de Run, Gameplay, 🔴 Crítico`

**Checklist — OverchargeEffect (SO)**
- [ ] Criar arquivo: Scripts/Items/OverchargeEffect.cs
- [ ] Herdar de ScriptableObject
- [ ] Campo: string effectName
- [ ] Campo: string description
- [ ] Método virtual: void Apply(CombatEntity target)
- [ ] Criar subclasse ou asset por tipo:
  - [ ] Overcharge_Congelamento — paralisa inimigo X segundos
  - [ ] Overcharge_Eletrificado — dano em área
  - [ ] Overcharge_Hemorragia — amplifica Sangramento ativo
  - [ ] Overcharge_Carbonizacao — Fogo amplificado
  - [ ] Overcharge_Esteroide — +Ataque temporário no herói
  - [ ] Overcharge_Imunizacao — herói imune a dano por X segundos

**Checklist — EnchantmentSystem**
- [ ] Criar arquivo: Scripts/Items/EnchantmentSystem.cs
- [ ] Herdar de MonoBehaviour
- [ ] Referência ao EquipmentManager
- [ ] Assinar ItemActivatedEvent
- [ ] Ao ativar: chamar AddStacks na EnchantmentInstance do item
- [ ] Verificar IsOvercharged após AddStacks
- [ ] Se overcharged: chamar overchargeEffect.Apply e ResetStacks
- [ ] Método: EnchantmentBuildType GetCurrentBuildType()
- [ ] Contar encantamentos por categoria nos 12 slots
- [ ] Detectar 12/0/0 → Specialization
- [ ] Detectar exatamente 4/4/4 → PerfectBalance
- [ ] Demais → Mixed
- [ ] Publicar OverchargeTriggeredEvent
- [ ] Publicar BuildTypeChangedEvent
- [ ] Assinar CombatStartedEvent para resetar todos os stacks

**Checklist — Testes**
- [ ] Teste: stacks acumulam ao ativar item com encantamento
- [ ] Teste: sobrecarga dispara ao atingir threshold
- [ ] Teste: stacks resetam após sobrecarga
- [ ] Teste: detecção de 12/0/0 como Especialização Total
- [ ] Teste: detecção de 4/4/4 como Equilíbrio Perfeito
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa EnchantmentSystem com sobrecarga e detecção de builds especiais"`

---

### [M2] Implementar RivalDefinition (SO)
`Labels: M2 — Loop de Run, Narrativa, Gameplay, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Campaign/RivalDefinition.cs
- [ ] Herdar de ScriptableObject
- [ ] Campo: string rivalId
- [ ] Campo: string rivalName
- [ ] Campo: string narrativeDescription
- [ ] Campo: Sprite portrait
- [ ] Campo: List<string> triggerNodeIds
- [ ] Campo: EnemyDefinition enemyDefinition
- [ ] Campo: List<ItemDefinition> equippedItems
- [ ] Campo: List<EnchantmentDefinition> enchantments
- [ ] Adicionar [CreateAssetMenu]
- [ ] Criar asset: Rival_A com build coerente com caminho A
- [ ] Criar asset: Rival_B com build coerente com caminho B

**Checklist — Integração**
- [ ] StoryRunner detecta nodeType == Boss
- [ ] Busca RivalDefinition cujo triggerNodeIds contém nodeId atual
- [ ] Passa RivalDefinition ao CombatManager
- [ ] CombatManager monta inimigo com build do rival

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa RivalDefinition e cria 2 rivais do MVP"`

---

### [M2] UI de Narrativa
`Labels: M2 — Loop de Run, UI, 🟠 Alta`

**Checklist — Painel de Cena**
- [ ] Criar canvas na cena Story
- [ ] Painel principal com fundo escuro semitransparente
- [ ] Campo de texto para narrativeText (fonte legível, tamanho 18–22)
- [ ] Campo opcional para nome do local/contexto
- [ ] Área de imagem de cena (placeholder cinza)

**Checklist — Botões de Escolha**
- [ ] Criar prefab: Prefabs/UI/PFB_ChoiceButton
- [ ] Texto da escolha legível
- [ ] Hover state com highlight
- [ ] Tooltip ao hover com tooltipText
- [ ] Instanciar dinamicamente por choice do nó
- [ ] Destruir botões anteriores ao carregar novo nó

**Checklist — Animações**
- [ ] Fade in do texto ao entrar em nó
- [ ] Fade out ao fazer escolha
- [ ] Botões aparecem com delay após o texto (0.3s)

**Checklist — Integração**
- [ ] Assinar NodeEnteredEvent para atualizar UI
- [ ] Botão chama StoryRunner.MakeChoice(choice)
- [ ] Desabilitar botões durante transição

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa UI de narrativa com texto e escolhas"`

---

### [M2] UI de Inventário
`Labels: M2 — Loop de Run, UI, 🟠 Alta`

**Checklist — Grid de Slots**
- [ ] Criar painel de inventário (acessível entre cenas narrativas)
- [ ] 12 slots visuais com ícone de categoria
- [ ] Ícone do item equipado em cada slot preenchido
- [ ] Slot vazio com ícone placeholder
- [ ] Slot com encantamento com badge colorido (cor da categoria)

**Checklist — Tooltip de Item**
- [ ] Hover em slot com item: mostrar tooltip
- [ ] Tooltip exibe: nome, tier, stats, cooldown de ativação
- [ ] Tooltip exibe: encantamento aplicado e stacks atuais

**Checklist — Indicador de Build**
- [ ] Painel com contador: Elemental X | DoT X | Pacifista X
- [ ] Highlight especial ao atingir 4/4/4 (Equilíbrio Perfeito)
- [ ] Highlight especial ao atingir 12/0/0 (Especialização Total)
- [ ] Assinar BuildTypeChangedEvent para atualizar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa UI de inventário com slots, tooltips e indicador de build"`

---

### [M2] UI de Recompensa
`Labels: M2 — Loop de Run, UI, 🟡 Média`

**Checklist — Painel**
- [ ] Painel aparece sobre a tela ao receber recompensa
- [ ] Exibir ícone e nome da recompensa
- [ ] Exibir descrição breve
- [ ] Botão "Confirmar" para fechar

**Checklist — Por tipo de recompensa**
- [ ] Item: ícone, nome, tier e stats
- [ ] Encantamento: ícone, categoria, tipo e efeito de sobrecarga
- [ ] Ouro: quantidade recebida + total atual
- [ ] Cura: quantidade de vida recuperada

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa UI de recompensa"`

---

# 🔮 MILESTONE 3 — Profundidade

---

### [M3] Implementar sistema de Habilidades
`Labels: M3 — Profundidade, Gameplay, 🔴 Crítico`

**Checklist — SkillDefinition (SO)**
- [ ] Criar arquivo: Scripts/Skills/SkillDefinition.cs
- [ ] Herdar de ScriptableObject
- [ ] Enum SkillType: Active, Passive, Ultimate, Combo
- [ ] Campo: string skillId
- [ ] Campo: string skillName
- [ ] Campo: string description
- [ ] Campo: SkillType skillType
- [ ] Campo: SkillEffect[] effects
- [ ] Para Passive: string triggerCondition
- [ ] Para Combo: definição da sequência (a definir)
- [ ] Adicionar [CreateAssetMenu]

**Checklist — SkillEffect**
- [ ] Criar arquivo: Scripts/Skills/SkillEffect.cs
- [ ] Enum EffectType: Damage, Heal, ApplyDot, StatBuff, StatDebuff
- [ ] Campo: EffectType effectType
- [ ] Campo: float value
- [ ] Campo: float duration
- [ ] Campo: DotEffect dotEffect (para ApplyDot)
- [ ] Campo: StatModifier statModifier (para buffs/debuffs)

**Checklist — SkillExecutor**
- [ ] Criar arquivo: Scripts/Skills/SkillExecutor.cs
- [ ] Método: void Execute(SkillDefinition skill, CombatEntity caster, CombatEntity target)
- [ ] Processar cada SkillEffect
- [ ] Publicar SkillExecutedEvent

**Checklist — UltimateState**
- [ ] Criar arquivo: Scripts/Skills/UltimateState.cs
- [ ] Campo: bool isAvailable
- [ ] Método: bool TryUse()
- [ ] Método: void Reset()
- [ ] Assinar CombatStartedEvent para chamar Reset

**Checklist — ComboTracker**
- [ ] Criar arquivo: Scripts/Skills/ComboTracker.cs
- [ ] Lista de ativações recentes com timestamp
- [ ] Janela de tempo válida para sequência
- [ ] Assinar ItemActivatedEvent
- [ ] Verificar se sequência corresponde a Combo definido
- [ ] Publicar ComboTriggeredEvent

**Checklist — Criar 3 habilidades MVP**
- [ ] Skill_Active_Strike — Ativa, dano extra ao ativar Espada
- [ ] Skill_Passive_Rage — Passiva, +10% Ataque quando vida < 50%
- [ ] Skill_Ultimate_BloodRush — Ultimate, aplica Sangramento em área

**Checklist — Testes**
- [ ] Teste: SkillExecutor aplica dano corretamente
- [ ] Teste: UltimateState retorna false após uso
- [ ] Teste: UltimateState reseta ao iniciar combate
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa sistema de habilidades com Ativa, Passiva, Ultimate e Combo"`

---

### [M3] Expandir inimigos e Elites
`Labels: M3 — Profundidade, Gameplay, 🟡 Média`

**Checklist — Comportamentos únicos**
- [ ] Goblin: verificar comportamento de ataque rápido — OK ou ajustar
- [ ] Orc: adicionar animação/delay de "carregamento" antes de atacar
- [ ] Archer: implementar lógica de manter distância mínima
- [ ] Shaman: aplicar DoT_Fogo a cada 3 segundos independente de ataque
- [ ] Troll (Elite): adicionar regeneração de vida passiva (X HP/s)

**Checklist — Inimigos com Encantamentos**
- [ ] Adicionar List<EnchantmentDefinition> ao EnemyDefinition
- [ ] EnemyController aplica encantamentos ao iniciar combate
- [ ] Criar inimigo: Knight_Ice (Elemental Gelo, elite)
- [ ] Criar inimigo: Monk_Shield (Pacifista Escudo, médio)
- [ ] Definir stats e encantamentos para os novos inimigos

**Checklist — Commit**
- [ ] `git commit -m "feat: expande inimigos com comportamentos únicos e encantamentos"`

---

### [M3] Criar itens Tier 3 Lendários
`Labels: M3 — Profundidade, Gameplay, 🟡 Média`

**Checklist — Design**
- [ ] Definir 3 itens com isLegendaryExclusive = true
- [ ] Cada um favorece uma categoria de encantamento
- [ ] Cada um tem ativação única inexistente em outros itens

**Checklist — Implementação**
- [ ] Criar: Lenda_EspadaDoCaos (Sword, T3) — ativação aplica DoT duplo
- [ ] Criar: Lenda_EscudoEterno (Shield, T3) — ativação bloqueia próximo ataque
- [ ] Criar: Lenda_CoroaDoGelo (Helmet, T3) — ativação aplica Congelamento imediato
- [ ] Verificar isLegendaryExclusive = true nos 3
- [ ] Adicionar aos pools de recompensa de Elite e Boss

**Checklist — Commit**
- [ ] `git commit -m "feat: cria 3 itens lendários exclusivos com ativações únicas"`

---

### [M3] Implementar bônus do Equilíbrio Perfeito (4/4/4)
`Labels: M3 — Profundidade, Gameplay, 🟠 Alta`

**Checklist — Design**
- [ ] Decidir efeito único do 4/4/4
- [ ] Documentar decisão no arquivo de design
- [ ] Confirmar que efeito não pode ser replicado de outra forma

**Checklist — Implementação**
- [ ] Implementar efeito no EnchantmentSystem
- [ ] Ativar ao detectar BuildType == PerfectBalance
- [ ] Desativar ao perder equilíbrio (troca de item)
- [ ] Publicar PerfectBalanceActivatedEvent
- [ ] Publicar PerfectBalanceDeactivatedEvent

**Checklist — UI e VFX**
- [ ] Indicador visual especial no inventário ao atingir 4/4/4
- [ ] Efeito visual no herói durante o bônus ativo
- [ ] Ícone na HUD indicando bônus ativo

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa bônus do Equilíbrio Perfeito 4/4/4"`

---

# 🌟 MILESTONE 4 — Meta e Polimento

---

### [M4] Implementar MetaProgressionManager
`Labels: M4 — Polimento, Gameplay, 🔴 Crítico`

**Checklist — Implementação**
- [ ] Criar arquivo: Scripts/Campaign/MetaProgressionManager.cs
- [ ] Herdar de MonoBehaviour (Singleton)
- [ ] Carregar MetaProgressionData via IDataService no Awake
- [ ] Propriedade: int FragmentsOfPower
- [ ] Método: void AddFragments(int amount)
- [ ] Método: bool SpendFragments(int amount)
- [ ] Método: bool IsHeroUnlocked(string heroId)
- [ ] Método: void UnlockHero(string heroId)
- [ ] Método: bool IsNodeUnlocked(string nodeId)
- [ ] Método: void UnlockNode(string nodeId)
- [ ] Método: bool IsTalentPurchased(string talentId)
- [ ] Método: bool PurchaseTalent(string talentId, int cost)
- [ ] Salvar via IDataService após cada modificação
- [ ] Publicar FragmentsChangedEvent
- [ ] Publicar TalentPurchasedEvent
- [ ] Assinar CombatEndedEvent para conceder fragmentos

**Checklist — TalentDefinition (SO)**
- [ ] Criar arquivo: Scripts/Campaign/TalentDefinition.cs
- [ ] Campo: string talentId
- [ ] Campo: string talentName
- [ ] Campo: string description
- [ ] Campo: int cost (em Fragmentos)
- [ ] Campo: StatModifier permanentBonus
- [ ] Adicionar [CreateAssetMenu]

**Checklist — Criar 3 talentos do MVP**
- [ ] Talent_ExtraHealth — +20 Vida base (custo: 10 fragmentos)
- [ ] Talent_SharpBlade — +5 Ataque base (custo: 10 fragmentos)
- [ ] Talent_IronSkin — +5 Armadura base (custo: 15 fragmentos)
- [ ] Aplicar talentos comprados ao iniciar uma run

**Checklist — Testes**
- [ ] Teste: AddFragments incrementa corretamente
- [ ] Teste: SpendFragments deduz e retorna true
- [ ] Teste: SpendFragments retorna false se insuficiente
- [ ] Teste: UnlockHero persiste após salvar e carregar
- [ ] Executar testes — todos devem passar

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa MetaProgressionManager com talentos e desbloqueios"`

---

### [M4] UI de Meta-Progressão
`Labels: M4 — Polimento, UI, 🟠 Alta`

**Checklist — Tela de Talentos**
- [ ] Criar tela/painel de Meta-Progressão
- [ ] Exibir contador de Fragmentos de Poder
- [ ] Exibir 3 talentos com nome, custo e efeito
- [ ] Botão "Comprar" desabilitado se fragmentos insuficientes
- [ ] Botão "Comprar" desabilitado se já comprado (exibir "Comprado")
- [ ] Feedback visual ao comprar (animação + som)
- [ ] Atualizar contador de fragmentos após compra

**Checklist — Tela de Desbloqueios**
- [ ] Exibir heróis disponíveis (desbloqueados) e bloqueados
- [ ] Mostrar custo de desbloqueio de cada herói bloqueado
- [ ] Exibir cenas narrativas desbloqueadas (lista simples)

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa UI de meta-progressão com talentos e desbloqueios"`

---

### [M4] Balancear thresholds de sobrecarga
`Labels: M4 — Polimento, Balanceamento, 🟠 Alta`

**Checklist — Definir valores iniciais**
- [ ] Definir threshold T1 para cada encantamento (ex: 20 stacks)
- [ ] Definir threshold T2 (menor, ex: 15 stacks)
- [ ] Definir threshold T3 (menor ainda, ex: 10 stacks)
- [ ] Definir stacks por ativação para T1, T2, T3
- [ ] Documentar em balanceamento.md

**Checklist — Testes de Gameplay**
- [ ] Testar run com build Especialização Total T1 — sobrecarga muito fácil?
- [ ] Testar run com build mista T1/T2 — curva satisfatória?
- [ ] Testar run com itens T3 — sobrecarga recompensadora?
- [ ] Testar que sobrecarga não ativa na primeira troca
- [ ] Ajustar valores e documentar resultado

**Checklist — Commit**
- [ ] `git commit -m "balance: define e ajusta thresholds de sobrecarga por tier"`

---

### [M4] Balancear fórmula de dano e Armadura
`Labels: M4 — Polimento, Balanceamento, 🟠 Alta`

**Checklist — Validação da Fórmula**
- [ ] Herói 10 Ataque vs 0 Armadura → dano = 10 ✓
- [ ] Herói 10 Ataque vs 10 Armadura → dano ~9 ✓
- [ ] Herói 10 Ataque vs 100 Armadura → dano ~5 ✓
- [ ] Armadura nunca reduz dano a 0 ✓
- [ ] Builds ofensivas ainda fazem sentido com Armadura alta ✓

**Checklist — Testes de Progressão**
- [ ] Combate início da run: herói vence em 10–15 segundos
- [ ] Combate meio da run: herói vence em 8–12 segundos
- [ ] Combate rival final: desafiador mas derrotável
- [ ] Ajustar stats dos inimigos conforme necessário
- [ ] Documentar valores finais em balanceamento.md

**Checklist — Commit**
- [ ] `git commit -m "balance: ajusta fórmula de dano e stats de inimigos após testes"`

---

### [M4] Balancear economia de ouro
`Labels: M4 — Polimento, Balanceamento, 🟡 Média`

**Checklist — Definição**
- [ ] Definir ouro por tipo de cena: Combate, Elite, Narrativo
- [ ] Definir preços T1, T2, T3 na loja narrativa
- [ ] Definir preços de encantamentos na loja
- [ ] Documentar em balanceamento.md

**Checklist — Testes**
- [ ] Run completa: jogador consegue comprar ~2 itens na loja?
- [ ] Ouro nunca é abundante a ponto de trivializar escolhas?
- [ ] Ajustar valores conforme necessário

**Checklist — Commit**
- [ ] `git commit -m "balance: define e ajusta economia de ouro"`

---

### [M4] VFX de combate
`Labels: M4 — Polimento, VFX/Audio, 🟡 Média`

**Checklist — Efeitos Básicos**
- [ ] VFX de impacto físico (partículas simples)
- [ ] VFX de crítico (flash amarelo + partículas maiores)
- [ ] VFX de morte do inimigo (dissolve ou flash branco)
- [ ] VFX de morte do herói (escurecimento de tela)

**Checklist — VFX de DoT**
- [ ] VFX de Sangramento ativo (gotas vermelhas periódicas)
- [ ] VFX de Fogo ativo (chamas pequenas no personagem)

**Checklist — VFX de Encantamento**
- [ ] VFX ao ativar encantamento Elemental (brilho azul/amarelo)
- [ ] VFX ao ativar encantamento DoT (brilho vermelho)
- [ ] VFX ao ativar encantamento Pacifista (brilho verde)
- [ ] VFX de sobrecarga por tipo (mais intenso)

**Checklist — VFX de Build Especial**
- [ ] VFX ao atingir Equilíbrio Perfeito 4/4/4 (aura tricolor)
- [ ] VFX ao atingir Especialização Total 12/0/0 (aura de uma cor)

**Checklist — Commit**
- [ ] `git commit -m "feat: adiciona VFX de combate, DoT, encantamentos e builds especiais"`

---

### [M4] SFX e Música
`Labels: M4 — Polimento, VFX/Audio, 🟡 Média`

**Checklist — SFX**
- [ ] SFX de ataque físico (impacto)
- [ ] SFX de crítico (impacto forte + som metálico)
- [ ] SFX de morte do inimigo
- [ ] SFX de morte do herói
- [ ] SFX de tick de Sangramento
- [ ] SFX de tick de Fogo
- [ ] SFX de sobrecarga (único por tipo, 6 no total)
- [ ] SFX de encantamento aplicado
- [ ] SFX de escolha narrativa (clique de botão)
- [ ] SFX de recompensa recebida
- [ ] SFX de compra na loja
- [ ] SFX de Equilíbrio Perfeito atingido
- [ ] SFX de Ultimate usada

**Checklist — Música**
- [ ] Música de combate (loop)
- [ ] Música de combate com boss (loop, mais intensa)
- [ ] Música de narrativa (loop, atmosférica)
- [ ] Música de menu principal
- [ ] Fade suave entre músicas (Coroutine com AudioSource.volume)
- [ ] Volume de música ajustável em config

**Checklist — AudioManager**
- [ ] Criar AudioManager (Singleton)
- [ ] Método: PlaySFX(AudioClip clip)
- [ ] Método: PlayMusic(AudioClip clip, bool loop)
- [ ] Método: StopMusic()
- [ ] Método: SetMusicVolume(float volume)
- [ ] Método: SetSFXVolume(float volume)

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa AudioManager, adiciona SFX e músicas"`

---

### [M4] Telas de Game Over e Vitória
`Labels: M4 — Polimento, UI, 🟠 Alta`

**Checklist — Game Over**
- [ ] Criar tela de Game Over
- [ ] Exibir título "Run Encerrada"
- [ ] Exibir nome do inimigo que causou a derrota
- [ ] Exibir Fragmentos de Poder ganhos nesta run
- [ ] Exibir: nós visitados, escolhas feitas, inimigos derrotados
- [ ] Exibir: build do herói no momento da morte (itens e encantamentos)
- [ ] Botão "Nova Run" → limpa save e inicia nova run
- [ ] Botão "Menu Principal" → volta para menu
- [ ] Fade in de entrada (0.5s)

**Checklist — Vitória**
- [ ] Criar tela de Vitória
- [ ] Exibir título "Rival Derrotado!"
- [ ] Exibir nome e retrato do rival derrotado
- [ ] Exibir Fragmentos de Poder ganhos (com bônus de vitória destacado)
- [ ] Exibir resumo da build vencedora
- [ ] Exibir tipo de build (Especialização / Equilíbrio / Mista)
- [ ] Botão "Nova Run"
- [ ] Botão "Menu Principal"
- [ ] Animação de celebração (partículas, flash)

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa telas de Game Over e Vitória com resumo de run"`

---

### [M4] Menu Principal
`Labels: M4 — Polimento, UI, 🟡 Média`

**Checklist — Implementação**
- [ ] Abrir cena MainMenu.unity
- [ ] Adicionar título do jogo (arte ou texto estilizado)
- [ ] Botão "Nova Run" — inicia run nova (apaga RunSaveData existente)
- [ ] Botão "Continuar" — visível apenas se RunSaveData existir
- [ ] Botão "Progressão" — abre tela de MetaProgressão
- [ ] Botão "Sair" — fecha o jogo
- [ ] Exibir Fragmentos de Poder disponíveis no canto da tela
- [ ] Música de menu ao entrar na cena

**Checklist — Commit**
- [ ] `git commit -m "feat: implementa Menu Principal com todos os botões"`

---

## Checklist de Setup do Trello

- [ ] Criar board: Auto Battler — Dev
- [ ] Adicionar link para GitHub na descrição do board
- [ ] Adicionar link para documento de design na descrição
- [ ] Criar as 8 colunas na ordem definida
- [ ] Criar todos os labels (5 Milestone + 7 Área + 4 Prioridade)
- [ ] Adicionar todos os cards do M0 na coluna Backlog
- [ ] Aplicar labels corretos em cada card
- [ ] Mover os 3 primeiros cards do M0 para Sprint Atual
- [ ] Cards de M1 em diante ficam no Backlog aguardando conclusão do M0
