# Reliquary: game documentation

Reliquary is an auto-battler. The hero fights on its own; the player decides what to carry. It is vanilla JavaScript (ES modules, no build step) with a 3D pixel-art renderer on vendored Three.js 0.170. It lives in `game/` and is served at `/game/`.

This page describes the game as it is now. For the full item list see [items.md](items.md).

## Run flow

1. **Title screen.** Start a new run, continue a saved one, or spend fragments in the shop (meta upgrades).
2. **Weapon pick.** Choose 1 of 3 random weapons. If you unlocked a mythic item in the shop, it appears as an extra card (see "Mythic items"); picking it instead of a weapon also gives you the common weapon, so you never start unarmed.
3. **Waves.** Each wave spawns a lineup of skeletons (skeleton, rogue, warrior). Enemy HP grows 20% per wave and damage 15% per wave (on mobile, damage is 15% lower).
4. **Reward.** After each wave clear, choose 1 of 3 items (4 with the One More Option upgrade, and the Reroll upgrade adds a Reroll button). A new item is added; one you already own goes up a level. The next wave starts as soon as you pick.
5. **Item levels.** Up to level 5. Each item defines what grows per level (see "Level data" below); nothing scales by default. The first enchant unlocks at level 3 and the extra enchant at level 5, and the tooltip shows locked tiers with the level that unlocks them. Items at max level leave the reward pool. Items that cannot scale (for example the Phoenix Feather) declare their own `maxLevel`.
6. **Boss every 10 waves.** One of two bosses, chosen at random, with an escort:
   - **Lich**: summons skeletons every 6s (up to 6 alive at once).
   - **Demon Lord**: fire nova every 5s (it leaves burn stacks on the hero); enrages below 33% HP (faster attacks and abilities).
   - Both have 12x the HP and 2x the damage of a regular skeleton of that wave.
   - **Resistances are rolled when the boss spawns.** Each element (fire, ice, poison, lightning, holy, shadow, water) gets 50% or 80% resistance; the first boss of a run has no immune element, every later boss has exactly one, and each has one weak element (+50% damage, also on DoT ticks). Physical always takes 100%.
7. **Victory.** Clearing the wave 10 boss opens the victory screen: continue in endless mode or end the run.
8. **Endless mode.** Waves keep scaling, with a boss every 10 waves (20, 30, ...). Boss rewards always include a legendary.
9. **Death.** Fragments and the best wave/score are kept; the run is gone.

The run is saved at the start of each wave, so reloading the page repeats the current wave without paying out twice.

## Mechanics

### Damage and crits

- Base crit chance is 5% (items can raise it). A crit deals x1.5.
- Armor has diminishing returns: damage reduction is `armor / (armor + 100)` (100 armor = 50%), with no cap. Dodge is capped at 40%.
- Resistance reduces damage and also the stacks applied (fire, poison, cold): a deterministic accumulator lets 1 in 5 stacks land at 80%. Weakness raises damage, not stacks. Immunity blocks both, unless the source item has `breaksImmunity` (then that element counts as 100%).
- Permanent bonuses (Might upgrade, Cursed Ring, Pact) scale weapons, DoTs and explosions alike.
- A weapon with base damage 0 only applies its effects (no item uses this now: the Ember Blade deals 12 fire damage, +3 per level).
- **Level 1 balance (11c):** every item's level 1 numbers (damage, heal, armor, thorns, steal, crit, dodge, explosion) are 30% higher than the original design, rounded. Growth per level is unchanged, rates and small stack counts were left alone, and the mythics stay at 1 damage / 1 stack per click.

### Damage over time

| DoT | Tick | Stacking | Cap |
| --- | --- | --- | --- |
| Burn | 1 damage per stack per second; stacks start to fade only after 3s without receiving new ones (`BURN_GRACE_MS`, any source resets the wait), then each second it loses `max(1, floor(stacks / 10))` stacks (5 -> 1/s, 30 -> 3/s, 100 -> 10/s) | Each hit adds stacks (Ember Blade: 1 per item level); no duration | None |
| Poison | 1 per second, `base + damage x stacks`; base is `1 + 3 x (level - 1)` | Each hit adds a stack; never expires (lasts until the enemy dies) | None |

DoT ticks never count as crits. Burn spreads through Ember Heart; poison spreads only through Detonating Plague. The Demon Lord's nova puts `4 + floor(wave / 5)` burn stacks on the hero.

### Other effects

- **Cold** (all ice): each stack slows movement and attacks by 10%; at 5 stacks the enemy freezes for 2s and the stacks reset (a frozen enemy gathers no more cold). Cold starts fading 3s after the last application (1 stack, then 1 more every 2s); cold also slows boss abilities. Sources: Frost Bow (+1 stack per hit), Crystal Armor (2 stacks on everything its barrier explosion hits). The enemy tint lerps from normal to frozen with the stacks.
- **Freeze**: a frozen enemy does not move or attack (a frozen boss does not advance its ability timer).
- **Contagion**: when a burning enemy dies, from any killing blow, Ember Heart passes ALL its burn stacks to the nearest living enemies (count equals item level), adding to theirs. Targets that die burning spread again, so it chains.
- **Fire and poison items (11c)**:
  - Oil Flask and Venom Flask add stacks when any weapon hits a target that already burns or is poisoned (`weaponHit` trigger, which also fires for hits with no damage, like the Ember Blade's). At level 3 they slow that target by 20% / 15%; at level 5 the Flask halves the burn stack loss (the remainder accumulates in `decayAcc`) and the Venom Flask adds +1 base poison damage per level.
  - Forge Hammer consumes burn stacks for 3 fire damage each, then re-ignites the target with 2 stacks.
  - Ash Mantle and Basilisk Hide enemy weakening (`enemyDamage` trigger): the attacker deals less damage per stack of its burn / poison, up to a cap. Ash Mantle level 5 sets `player.fireImmune`, which stops the Demon Lord's nova from burning the hero.
  - Detonating Plague: every 3s each poisoned enemy passes stacks to its nearest neighbours (count = level, never lowering their poison base); a poison tick that would kill the enemy makes it burst (`poisonTick` trigger) and deal that tick's damage to the neighbours; a poisoned enemy that dies passes half its stacks (all at level 5).
  - Plague Mushroom: a spore cloud around the hero; from level 3 it stays on the ground for 3s (`state.clouds`, not saved, cleared each wave) and poisons everything inside each second.
  - Poison from several sources keeps the highest base damage (`applyDot`).
- **Rear line (11c)**: "rear" means farther than `NEAR_RANGE` (200 px) from the hero. The Long Crossbow (`targeting: "farthest"`) shoots the farthest enemy; the Phantom Hunter's Bow (`targeting: "rear"`) shoots every rear enemy and, when there is none, does not spend its cooldown.
- **Boss stacks**: every stack on the boss (fire, poison, cold...) is shown as icon and count under its health bar.
- **Area items**: Seismic Hammer (splash around the target), Blast Core (explosion around the hero), Judgment Tome (hits every enemy), Thorn Mail (damages nearby enemies when you are hit), Thunder Staff (chain lightning).
- **Echo Stone**: every 6s it repeats the last activated weapon or relic (not armor) at 50% of the effect (+10% per level): damage, stacks, healing and duration are scaled. Level 3 repeats twice, level 5 repeats at 100%. The repeat does not touch the cooldown of the repeated item and never becomes the "last item" itself.
- **Counter-attack** (Shadow Cloak level 3): on a dodge, the weapon closest to being ready attacks the enemy that missed, as an extra attack (no cooldown change, no Sprint count).
- **Damage taken modifiers**: poisoned enemies (Venom Blade Corrosion), frozen enemies (Crystal Armor) and judged enemies (Tome of Judgment) take extra damage from every source, including damage over time.
- **Regeneration and DoT reduction** (Battle Cuirass): whole HP per second, and a cut of damage-over-time taken. The level 15 milestone is -15% damage taken, applied after armor.

### Evolution of common items

Common items (Rusted Sword, Leather Vest, Lucky Horseshoe) declare `evolution: { into, level }`. When the item reaches that level through a reward, it is replaced in the same slot by its evolved form (Veteran's Blade, Battle Cuirass, Golden Clover), keeping level and cooldown timer. The evolved form (`evolvedFrom` in the JSON):

- has no level cap and stays in the reward pool as a level-up (the base item leaves the pool once its form is owned);
- also levels up by kills: the next level needs `round(20 x 1.5^(level - 5))` kills (20, 30, 45, 68, 101...). Progress shows in the tooltip and the item panel, is saved in `evolveKills`, and resets on any level-up;
- changes rarity with its level: uncommon on evolving, rare at 10, epic at 15, legendary at 20. Rewards roll it by its current rarity weight and the inventory frame takes the rarity color. The rarity is a getter, so everything that reads `item.rarity` follows;
- has its own sprite (the `art` field is only needed when a form shares another item's icon).

Milestones are plain effects with `minLevel`. After the last fixed milestone, effects with `every` repeat: `effectCount = 1 + floor((level - minLevel) / every)`.

| Form | Per level | Milestones |
| --- | --- | --- |
| Veteran's Blade | +3 damage | 5: double strike. 10: +10% crit chance. 15: execution (a hit that leaves a non-boss enemy at 20% HP or less kills it). After 15, every 5 levels alternately: +1 strike (20, 30, 40...) or +10% crit chance (25, 35, 45...) |
| Battle Cuirass | +8 armor | 5: regenerates 1 HP/s. 10: damage over time taken -50%. 15: -15% damage taken, on top of armor. After 15, every 5 levels alternately: +1 HP/s of regeneration (20, 30...) or +25 armor (25, 35...) |
| Golden Clover | Pays `level` fragments every 10 kills of the run (the Horseshoe pays the same before evolving) | 5: +3% crit chance. 10: +1 reroll for the run, granted once (`levelUp` trigger). 15: the guaranteed legendary comes 1 reward screen earlier (never below 1). After 15, every 5 levels alternately: +1 fragment per payout (20, 30...) or +3% crit chance (25, 35...) |

### Mythic items

Two items of the `mythic` rarity (own frame color, translated name): **Elemental Click** and **Seismic Finger**. They have no levels and no cooldown.

- **Unlock**: bought once in the title screen shop for 1000 fragments each. The purchase is stored in the meta save as `unlockedItems` (a list of ids), not as an upgrade level. Old meta saves load with an empty list.
- **One per run**: an unlocked mythic is a guaranteed extra card in the starting pick. If you do not take it, it comes back as an extra card in the wave 1 reward (it survives rerolls). With both unlocked, the run draws one (`state.mythicChoice`, saved with the run) and the other never appears. Once you own one, the other is gone for the run. Mythic items never show up in normal reward rolls.
- **Activation**: click or tap anywhere on the arena (not on its buttons), only while the run is going and not paused. At most 8 activations per second: `clicks.js` keeps a sliding 1s window over real time (a click leaves the window once a full second has passed), and the excess is ignored. A small counter in the arena shows the current rate.
- **Elemental Click**: each click applies 1 stack of fire, poison or cold (random) to a random living enemy. Resistances, immunities and the Arcane Robe's extra stack apply as for any other source.
- **Seismic Finger**: each click deals 1 physical damage (times the permanent damage bonuses) to every living enemy.
- Damage and uses are credited to the item id (`damageByItem`, `itemUses`).
- **Legendary guarantee**: reward screens roll rarity by weight (common 40, uncommon 30, rare 18, epic 9, legendary 3). After 4 screens without a legendary (3, then 2, with the Legendary Luck upgrade), the next one guarantees one; boss rewards in endless mode always do. The counter (`rewardsSinceLegendary`) is saved with the run.
- **Meta upgrades**: enemies drop fragments, kept across runs and spent in the title shop. The next level costs `round(20 x 1.25^level)`.

| Upgrade | Per level | Limit |
| --- | --- | --- |
| Vitality | +10 max HP | none |
| Might | +5% damage | none |
| Guard | +5 armor | none |
| Haste | -3% cooldowns | 16 levels (50%) |
| Precision | +1% critical chance | 15 levels |
| One More Option | Reward screens show 4 items | 1 level, 400 fragments |
| Reroll | +1 reward reroll per run | 3 levels, 100 / 250 / 500 fragments |
| Legendary Luck | Guaranteed legendary after 3, then 2 screens (instead of 4) | 2 levels, 200 / 600 fragments |

The last three have fixed costs instead of the `20 x 1.25^level` curve. Remaining rerolls (`rerollsLeft`) are saved with the run.

## Controls and saves

There is no keyboard input; everything is on-screen buttons: play, pause, reset, speed (1x, 2x, 3x), mute, screen-shake toggle, language, and the inventory bar toggle. Item cards show a tooltip (hover on desktop, touch variant on mobile).

| localStorage key | Content |
| --- | --- |
| `reliquary_run` | Current run (save v2): wave, items and levels, timers, legendary counter, endless flag, player state |
| `reliquary_meta_v1` | Fragments, purchased upgrades, unlocked mythic items, best wave/score, bosses beaten |
| `reliquary_inv_collapsed` | Inventory bar collapsed or open (default open) |
| `reliquary_prefs` | Screen shake preference |
| `lang` | Language, shared with the portfolio |

## i18n

`game/src/i18n.js` exposes `t`, `setLang` and `formatNumber`. Languages are `en` (default) and `pt-BR`, switchable mid-run. Text lives in `game/locales/en.js` and `pt-BR.js`; item text in `items.en.js` and `items.pt-BR.js`. Tests require identical keys in both languages.

## Mobile layouts

- Item bar at the top, arena at full width, no on-screen log.
- Portrait phones: the arena is at most a square.
- Landscape with height up to 500 px: compact mode so the battle fits without scrolling.
- Pure layout rules live in `game/src/layout.js` so they can be tested in node.

## Architecture

| Module | Responsibility |
| --- | --- |
| `main.js` | Entry point: run flow, game loop, wiring. Uses a `runId` plus `later()` so timeouts from a dead run never fire |
| `state.js` | Single shared state object |
| `items.js` | Catalog, reward rolls, levels, passives |
| `combat.js` | Damage, DoTs, all item effect handlers, enemy attacks |
| `waves.js`, `boss.js` | Enemy and boss creation and scaling, boss abilities |
| `meta.js` | Permanent upgrades and the mythic item purchases |
| `clicks.js` | Click limiter for mythic items (8 per second, sliding window) |
| `save.js` | Run and meta persistence |
| `events.js` | Small event bus from logic to UI and renderer (`hit`, `crit`, `dotTick`, `spread`, `explode`, `enemyDied`, `bossAbility`, `sfx`, ...) |
| `ui.js`, `ui-title.js`, `ui-victory.js` | DOM: inventory, HUD, modals, title and shop, victory |
| `item-art.js`, `sprites.js` | 16x16 item icons drawn in code and cached as data URLs; the emoji is the fallback |
| `audio.js`, `fx.js`, `particles.js`, `feel.js` | Sound (Web Audio), effect data, particles, screen shake and hit stop |
| `three/` | Renderer (see below) |

### Data-driven item effects

`game/assets/items.json` holds only numbers and a list of effects: `{ "trigger": ..., "type": ..., params }`. `combat.js` has one handler per type, grouped by trigger, and exports `KNOWN_EFFECTS` (trigger to list of types). A test fails if an item uses a trigger or type that has no handler.

| Trigger | Fires |
| --- | --- |
| `passive` | Constant stats (`stats`) |
| `attack` / `hit` | Once per weapon attack / for each hit |
| `anyAttack` / `anyHit` | Same, for attacks and hits from any source |
| `crit`, `kill`, `dodge` | On those events |
| `use` | When an armor or relic cooldown is ready |
| `hurt`, `block`, `freeze` | Defensive events, and an enemy freezing (any source) |
| `damage`, `vulnerable`, `lowHp`, `death` | Damage dealt modifier (Frenzy), damage taken modifier on enemies, low-HP reaction, revive and its extras |
| `weaponHit` | Every weapon hit, even one with no damage, after the weapon's own effects (flasks) |
| `slow`, `burnDecay`, `dotBase`, `poisonTick` | Slow on burning / poisoned enemies, burn stack loss, extra base poison damage, a poison tick about to kill (Detonating Plague) |
| `enemyDamage` | Damage the enemies deal to the hero, per stack on the attacker |
| `click` | A click on the arena that passed the limiter (mythic items) |
| `levelUp` | Once, when the item reaches `atLevel` (Golden Clover's reroll) |

### Level data

An item (or one of its effects) declares what grows per level next to the base value, either as `<key>PerLevel` or inside a `perLevel` map. Values are linear: `base + perLevel x (level - 1)`. A value that changes at once at a level uses `<key>At`: `"ratioAt": { "3": 0.6, "5": 1 }` (the highest level reached wins and replaces the linear growth).

```json
{ "id": "x", "baseDmg": 10, "baseDmgPerLevel": 3, "cooldown": 3000, "cooldownPerLevel": -100,
  "effects": [
    { "trigger": "hit", "type": "dot", "dot": "burning", "damage": 1, "stacks": 1, "stacksPerLevel": 1 },
    { "trigger": "hit", "type": "cold", "perLevel": { "stacks": 1 }, "minLevel": 3 }
  ] }
```

- Keys without level data are fixed (the generic +20% / -5% rule is gone). Helpers: `levelValue`, `stepOf`, `perLevelOf`, `effectiveCooldown`, `effectCount` in `items.js`.
- `minLevel` (3 or 5) on an effect keeps it off until the item reaches that level (`effectsOf` filters it); `every` repeats it every N levels after that. Texts: `items.<id>.enchant` unlocks at `enchantLevel` (default 1, all existing items use 3) and `items.<id>.enchantExtra` at `enchantExtraLevel` (default 5); tooltips and cards show locked tiers dimmed with "Unlocks at level N".
- `breaksImmunity` (`true`, or the level from which it applies) on an item lets its damage and stacks ignore boss immunity.

### Render pipeline (`game/src/three/`)

An orthographic camera (view height 12.5, minimum half-width 9) looks at a scene spanning z -20 to 18. Each frame:

1. Scene to a low-resolution target (color and depth).
2. Normals pass at the same resolution.
3. Outline and edge highlight.
4. Extra passes (water, god rays).
5. Nearest-neighbor upscale to the canvas, with the 2D effects layer on top.

Files: `view.js` (camera, fit), `pipeline.js`, `lighting.js`, `characters.js` (KayKit models), `environment.js`, `water.js`, `godrays.js`, `effects2d.js`, `overlay.js` (sharp text and bars). Enemies spawn no further right than `visibleLogicRight()`.

## Adding an item

1. **`game/assets/items.json`**: add an entry with `id`, `type` (`weapon`, `armor`, `relic`), `icon` (emoji fallback), `rarity`, `cooldown` (ms, 0 for passive), and for weapons `baseDmg`, `dmgType`, `anim`, `fx`. Describe behavior in `effects`. If no existing effect type fits, add a handler in `combat.js` under the right trigger.
2. **Locales**: add `items.<id>.name`, `.desc`, `.effect` and optionally `.enchant` and `.enchantExtra` to both `game/locales/items.en.js` and `items.pt-BR.js`.
3. **Art**: add a 16x16 grid under the id in `ITEM_ART` in `game/src/item-art.js`. If the item has an element, add it to `ITEM_ELEMENTS`. Preview all icons at `/game/dev/item-art.html`.
4. **Tests**: add cases in `tests/` for any new handler (see `tests/items2.test.js`). Existing tests already check the catalog, art coverage and locale parity.
5. **Docs**: run `npm run docs:items` to regenerate `docs/items.md`. A test fails if you forget.

## Running and testing

Any static server from the repo root works:

```
npx http-server -p 8766
```

Then open `http://localhost:8766/game/`. Tests use `node:test` and need no install:

```
npm test
```

## Known limits

- **Mana and the barrier are gone.** Old saves with mana or barrier fields load fine (the fields are ignored); a saved Mana Stone becomes the Echo Stone.
- **Heavy models**: the KayKit GLB files total about 22 MB.
- **Water reflection** re-renders the whole scene.
- **God rays** are faint, and hero contrast against the scene could be better.
- **Lich** uses a generic attack animation.
- **Victory stats**: `durationMs` resets to zero when continuing after victory.
- **Unused `log.*` keys** remain in the locales since the on-screen log was removed.
