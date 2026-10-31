# Reliquary: game documentation

Reliquary is an auto-battler. The hero fights on its own; the player decides what to carry. It is vanilla JavaScript (ES modules, no build step) with a 3D pixel-art renderer on vendored Three.js 0.170. It lives in `game/` and is served at `/game/`.

This page describes the game as it is now. For the full item list see [items.md](items.md).

## Run flow

1. **Title screen.** Start a new run, continue a saved one, or spend fragments in the shop (meta upgrades).
2. **Weapon pick.** Choose 1 of 3 random weapons.
3. **Waves.** Each wave spawns a lineup of skeletons (skeleton, rogue, warrior). Enemy HP grows 20% per wave and damage 15% per wave (on mobile, damage is 15% lower).
4. **Reward.** After each wave clear, choose 1 of 3 items. A new item is added; one you already own goes up a level. The next wave starts as soon as you pick.
5. **Item levels.** Up to level 5. Each level adds 20% to the item's main effect and cuts its cooldown by 5%. Items at max level leave the reward pool. Items that cannot scale (for example the Phoenix Feather) declare their own `maxLevel`.
6. **Boss every 10 waves.** One of two bosses, chosen at random, with an escort:
   - **Lich**: summons skeletons every 6s (up to 6 alive at once). Resists ice and shadow; takes extra damage from fire and holy.
   - **Demon Lord**: fire nova every 5s; enrages below 33% HP (faster attacks and abilities). Resists fire; takes extra damage from water and ice.
   - Both have 12x the HP and 2x the damage of a regular skeleton of that wave.
7. **Victory.** Clearing the wave 10 boss opens the victory screen: continue in endless mode or end the run.
8. **Endless mode.** Waves keep scaling, with a boss every 10 waves (20, 30, ...). Boss rewards always include a legendary.
9. **Death.** Fragments and the best wave/score are kept; the run is gone.

The run is saved at the start of each wave, so reloading the page repeats the current wave without paying out twice.

## Mechanics

### Damage and crits

- Base crit chance is 5% (items can raise it). A crit deals x1.5.
- Armor reduces damage received by its value in percent, capped at 75%. Evasion is capped at 50%.
- Permanent bonuses (Might upgrade, Cursed Ring, Pact) scale weapons, DoTs and explosions alike.
- A weapon with base damage 0 (Ember Blade) only applies its effects.

### Damage over time

| DoT | Tick | Stacking | Cap |
| --- | --- | --- | --- |
| Burn | 1 per second, fixed damage per stack | Each hit adds a stack and refreshes the duration | 3 stacks, +1 per item level |
| Poison | 1 per second, `base + damage x stacks`; base is `1 + 3 x (level - 1)` | Each hit adds a stack | None |

DoT ticks never count as crits. Burn can spread (contagion); poison cannot.

### Other effects

- **Freeze**: a frozen enemy does not move or attack (a frozen boss does not advance its ability timer). Sources: Frost Bow (20% on hit), Crystal Armor (when its barrier breaks).
- **Contagion**: when a burning enemy dies, Ember Heart copies its burn to the nearest living enemies (count equals item level). Targets that die burning spread again, so it chains.
- **Area items**: Seismic Hammer (splash around the target), Blast Core (explosion around the hero), Judgment Tome (hits every enemy), Thorn Mail (damages nearby enemies when you are hit), Thunder Staff (chain lightning).
- **Legendary guarantee**: reward screens roll rarity by weight (common 40, uncommon 30, rare 18, epic 9, legendary 3). After 4 screens without a legendary, the next one guarantees one; boss rewards in endless mode always do. The counter (`rewardsSinceLegendary`) is saved with the run.
- **Meta upgrades**: enemies drop fragments, kept across runs and spent in the title shop. The next level costs `round(20 x 1.25^level)`.

| Upgrade | Per level | Limit |
| --- | --- | --- |
| Vitality | +10 max HP | none |
| Might | +5% damage | none |
| Guard | +2 armor | none |
| Haste | -3% cooldowns | 16 levels (50%) |

## Controls and saves

There is no keyboard input; everything is on-screen buttons: play, pause, reset, speed (1x, 2x, 3x), mute, screen-shake toggle, language, and the inventory bar toggle. Item cards show a tooltip (hover on desktop, touch variant on mobile).

| localStorage key | Content |
| --- | --- |
| `reliquary_run` | Current run (save v2): wave, items and levels, timers, legendary counter, endless flag, player state |
| `reliquary_meta_v1` | Fragments, purchased upgrades, best wave/score, bosses beaten |
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
| `meta.js` | Permanent upgrades |
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
| `hurt`, `block`, `barrierAbsorb`, `barrierBreak` | Defensive events |
| `damage`, `lowHp`, `death` | Damage modifier, low-HP reaction, revive |

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
2. **Locales**: add `items.<id>.name`, `.desc`, `.effect` and optionally `.enchant` to both `game/locales/items.en.js` and `items.pt-BR.js`.
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

- **Mana is unused in practice.** The MP bar and `maxMana` still exist and only Mage Robe and Mana Stone touch them (the Mage Robe `magicBoost` stat has no effect). Both items are being redesigned, after which mana will be removed from the HUD, state, save and translations.
- **Heavy models**: the KayKit GLB files total about 22 MB.
- **Water reflection** re-renders the whole scene.
- **God rays** are faint, and hero contrast against the scene could be better.
- **Lich** uses a generic attack animation.
- **Victory stats**: `durationMs` resets to zero when continuing after victory.
- **Unused `log.*` keys** remain in the locales since the on-screen log was removed.
