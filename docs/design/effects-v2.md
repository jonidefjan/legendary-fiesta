# Effects v2 (Phase 11)

Design decisions for the effects overhaul, from the owner's grill-me session. This document is the spec for the three Phase 11 PRs. It is a faithful English translation of the decisions file; the original is in Portuguese.

Every section is tagged with the PR that implements it:

| Tag | PR | Scope |
| --- | --- | --- |
| **[11a]** | Global rules | Per-item level infrastructure, armor, dodge, crit, fire, poison, unified cold, boss resistances, boss stack display, shop. |
| **[11b]** | Existing items | The 29 existing items get their N1/N3/N5 redesign; evolution of common items; mana and barrier leave the game. |
| **[11c]** | New items | The 11 new items and their 14 pixel art icons. |

Notation: N1, N3 and N5 mean item level 1, 3 and 5. "Enchant" is the level-gated bonus of an item.

## Already decided before the grill-me

- Mana is discarded (MP bar, `p.mana` / `maxMana`, save data, translations). The Arcane Robe and the Mana Stone need new effects. **[11b]**
- ~~Burn: max stacks = 3 + 1 per level~~ (replaced by the new fire rule below). **[11a]**
- Poison: base 1 + 3 × (level - 1), plus 1 per stack, no stack limit and no spread. Poison never expires: stacks stay until the enemy dies (no duration, no decay). **[11a]**
- Ember Heart: spreads burn to n nearby enemies, with n = level. **[11a]**
- Ember Blade: 0 direct damage and burn on 100% of hits. **[11a]**

## Global rules

### Levels **[11a]** (infrastructure) / **[11b]** (migration of the items)

- Rule per item. Each item defines what grows per level (damage, stacks, chance, targets...) and its description says so. The generic +20% ends.
- Done in 11b: every item declares its own growth and the generic scaling is gone.

### Enchant tiers **[11a]** (infrastructure) / **[11b]** (content)

- The base effect applies from level 1.
- The enchant unlocks at level 3.
- An extra enchant unlocks at level 5 (for example, breaking elemental immunity).
- The extra level-5 enchant is specific to each item. Only some of them break elemental immunity, and that is defined item by item.

### Critical hits **[11a]**

- Keeps the 5% base chance and the x1.5 multiplier.
- Items raise the chance (Coin) or have an effect on crits (Mace).

### Armor **[11a]**

- Diminishing returns: damage reduction = armor / (armor + 100).
- The 75% cap is removed.

### Dodge **[11a]**

- Cap of 40%.

### Elements and resistances

- Resistances and weaknesses stay on all enemies, as today. **[11a]**
- **Resistance** reduces the damage and also the stacks applied: with 80% resistance, only 1 in every 5 stacks lands. Immunity blocks everything of that element until the level-5 enchant that breaks it. **[11a]**
- **Bosses:** the fixed values of today (Lich, Demon Lord) give way to a roll. **[11a]**
  - Each element (fire, ice, poison, lightning, holy, shadow, water) rolls a resistance of 50% or 80%.
  - The first boss of a run has no immune element. From the second boss on, every boss has exactly 1 immune element. Each boss also rolls 1 weak element (+50% damage), which also boosts damage-over-time ticks.
  - Physical damage is outside the roll.
  - The extra level-5 enchant of the element's item breaks the immunity, and the effect then counts as 100%. (The flag and the rule are **[11a]**; which items carry it is **[11b]**.)

### Unified cold **[11a]**

- All ice applies cold stacks. Each stack makes the enemy 10% slower.
- At 5 stacks the enemy freezes for 2s and the stacks reset.
- Decay: cold only starts to fade 3s after the LAST cold application (all ice); then the enemy loses 1 stack, and 1 more every 2s while no new cold lands. Cold also slows the boss ability timer.
- The Frost Bow also uses cold (+1 stack per hit).

### Fire (reworked) **[11a]**

- Burn stacks accumulate without limit.
- Each stack deals 1 damage per second.
- Each second the enemy loses max(1, floor(stacks / 10)) stacks: 5 -> 1/s, 30 -> 3/s, 100 -> 10/s.
- There is no duration anymore.

### Spreading on death **[11a]** (rule) / **[11c]** (the poison source)

- Fire and poison pass to the neighbours whenever the enemy dies carrying them, whatever the killing blow.
- Fire spreads through the Ember Heart (already in the game). Poison has no spread without an item: the new legendary, Detonating Plague, brings it in 11c.

### Evolution **[11b]**

- Applies to all common items (Rusted Sword, Leather Vest and the new Lucky Horseshoe).
- At level 5 the item becomes another item and keeps leveling without limit, both through rewards and through kills.
- Kills needed for the next level: starts at 20 and grows x1.5 (20, 30, 45, 68...).
- Rarity rises at the milestones: on evolving it becomes uncommon; N10 rare; N15 epic; N20 legendary. In rewards the item shows up with the chance of its current rarity, and the frame changes.
- The evolved items are described in the Items section: Rusted Sword -> Veteran's Blade, Leather Vest -> Battle Cuirass, Lucky Horseshoe -> Golden Clover.

### Boss stacks **[11a]**

- The stacks of any effect on the boss are shown below its health bar.

### Barrier **[11b]**

- Leaves the game (code, save data and texts).

## Shop

The 4 upgrades of today (Guard revised for the new armor) plus 4 new ones. All **[11a]**.

| Upgrade | Rule | Cost |
| --- | --- | --- |
| Guard (revised) | +5 armor per level | as the others |
| Precision | +1% critical chance per level, up to 15 levels (+15%) | same curve as the others |
| One More Option | single level; the reward shows 4 items | 400 fragments |
| Reroll | 1 reward reroll per run, per level, up to 3 levels | 100, 250, 500 |
| Legendary Luck | 2 levels; the guaranteed legendary comes earlier: after 3 reward screens without a legendary, then after 2 (instead of 4) | 200, 600 |

## Items

### Existing items **[11b]**

Unless noted, the whole entry is implemented in 11b. Item-specific pieces that depend on a global rule list that rule's PR.

- **Dragonscale** (no barrier). When it takes damage, it applies 1 fire stack to the enemy that hit, +1 stack per level. Enchant (unlocks at level 3): when it applies fire to an enemy, it also applies it to another one.
  - N5, Ember Skin: enemies stuck to the hero receive 1 fire stack per second.
- **Crystal Armor:** every 2s it applies 1 cold stack to the enemies adjacent to the hero. Each stack makes the enemy 10% slower (moving and attacking); at 5 stacks it freezes for 2s and the stacks reset. The level increases the radius or the pace. Enchant: frozen enemies take +30% damage.
  - N5, Shards: when an enemy freezes, it releases shards that apply 2 cold stacks to its neighbours, and the armor breaks ice immunity.
  - Until 11b, in 11a: the barrier explosion applies 2 cold stacks to all enemies hit.
- **Rusted Sword -> Veteran's Blade** (evolves at level 5):
  - +3 damage per level.
  - Milestones: N5 double strike; N10 critical chance; N15 execution.
  - After 15, the milestones always improve the number of strikes or the crit.
- **Seismic Hammer:** 14 damage, +4 per level, 40% splash. N3: the splash rises to 60%, with a larger radius. N5: the splash also applies the on-hit effects of the other items (lifesteal etc.).
- **Iron Shield:** every 8s it blocks the next hit, with -1s of cooldown per level. N3: the block returns 100% of the hit's damage to the attacker. N5: blocks the next 2 hits.
- **Leather Vest -> Battle Cuirass** (evolves at level 5):
  - +8 armor per level.
  - Milestones: N5 regenerates 1 HP/s; N10 damage over time received -50%; N15 -15% damage taken, on top of armor (replaces the slow/freeze immunity).
  - After that, the milestones improve the armor or the regeneration.
- **Venom Blade:**
  - N3, Corrosion: poisoned enemies take +1% damage from everything per stack, up to +25%.
  - N5: each hit applies 2 stacks and breaks poison immunity.
  - (Base poison, from 11a: 1 + 3 x (level - 1), plus 1 per stack, no limit.)
- **Ember Blade:** 0 damage; each hit applies 1 stack per level (N5 = 5). N3: a target with 20+ stacks releases a flare of 1 x stacks to its neighbours. N5: breaks fire immunity.
  - In 11a: the 1 stack per level and the new fire rule are implemented; the N3 and N5 enchants are 11b.
- **Frost Bow:** +3 damage per level, +1 cold stack per hit. N3: the arrow pierces and also hits the next enemy. N5: the freeze on the bow's targets lasts 3s and breaks ice immunity.
  - In 11a: the +1 cold stack per hit replaces the old 20% freeze chance.
- **Water Orb:** +3 damage and +0.05s of cooldown advance per level. N3, Tide: consecutive hits on the same target add +3 damage, up to 5 stacks. N5: with 5 Tide, the next hit becomes a wave that hits everyone for 50%.
- **Ember Heart:** when an enemy dies burning, it passes ALL its stacks to n neighbours (n = level), adding to theirs. N3: the jump causes a flare of 1 x stacks on the new target. N5: breaks the fire immunity of bosses.
  - In 11a: the spreading of all stacks to n = level neighbours, for any killing blow, is implemented; the N3 and N5 enchants are 11b.
- **Shadow Dagger:** 2 strikes of 9; +2 damage per strike per level. N3: 3 strikes per attack. N5: each strike has a 30% chance to return 0.5s of cooldown and breaks shadow immunity.
- **Holy Mace:** 18 damage and 5 healing per hit; +4 damage and +1 healing per level. N3: crits heal +10. N5: every 5 hits, a ray of light hits everyone for 50% of the damage and breaks holy immunity.
- **Tome of Judgment:** 9 holy damage to everyone every 5s; +3 damage per level. N3: those hit are judged for 3s and take +15% damage. N5: damage x2 on bosses and breaks holy immunity.
- **Thunder Staff:** 22 lightning damage; +5 damage and +1 bounce per level. N3, Storm: every 4 uses, the attack deals +50% damage. N5: bounces do not lose damage and break lightning immunity.
- **Blood Scythe:** 20 shadow damage and 30% lifesteal; +5 damage per level, and +1 permanent damage in the run every 20 kills.
  - N3: Harvest (every 3 kills, the next hit deals x2) and the hit reaches 2 targets.
  - N5: steals 50% and breaks shadow immunity; healing above max HP raises max HP by 1, up to +50 in the run. (Combination confirmed.)
- **Chainmail:** +18 armor, +8 per level. N3, Deflection: 15% chance to return half the damage received. N5: Deflection rises to 30% and returns 100%.
- **Thorn Mail:** +8 armor per level and +3 thorns damage per level (L5 = 40 armor, 18 thorns). N3: thorns deal +1% damage per armor point. N5: thorns also trigger when the hero dodges or blocks.
- **Arcane Robe** (new, without mana): Magic Amplifier. Elemental (non-physical) weapons deal +10% damage, +5% per level. N3: elemental effects (fire, poison, cold) apply +1 stack. N5: +1 range on bounces and splashes.
- **Shadow Cloak:** +10% dodge, +4% per level (global cap of 40%). N3: when dodging, the weapon attacks at once. N5: Escape gives +100% on the next attack.
- **Mana Stone -> Echo Stone:** every 6s it repeats the last activated item (weapon or relic) at 50% of the effect, +10% per level. N3: 2 repeats. N5: 100% of the effect.
- **Vital Crystal:** heals 8, +3 per level. N3, Resonance: every 10 charges the heal gains a permanent +3 in the run. N5: below 30% health, the cooldown is halved.
- **Speed Boots:** weapons recharge 15% faster, +5% per level. N3, Sprint: every 5 attacks, the weapon that attacked is ready. N5: Sprint applies to all items.
- **Vampiric Amulet:** steals 8% of each hit, +2% per level. N3, Thirst: below 50% health the steal doubles. N5: the steal also applies to damage over time.
- **Berserker Totem:** +40% speed for 3s every 7s, +0.5s of duration per level. N3, Frenzy: below 25% health it activates by itself. N5: during the frenzy, +20% damage.
- **Lucky Coin:** +15% crit, +5% per level; a critical kill gives +1 fragment. N3, Big Luck: 25% chance of an extra attack on a crit. N5: crits deal x2 instead of x1.5.
- **Cursed Ring:** +30% damage, +10% per level; -20% max health. N3, Pact: each kill drains 2 HP and gives +1% damage, up to +25%. N5: the Pact cap rises to +50% and the health penalty falls to -10%.
- **Blast Core:** 10 damage around the hero every 6s, +5 per level. N3: the explosion applies 3 fire stacks per level. N5: the radius doubles and it breaks fire immunity.
- **Phoenix Feather:** revives once per wave with 40% health, +10% per level. N3, Rebirth: resets cooldowns. N5: on reviving, it explodes in fire and applies 20 stacks to all enemies.

### New items **[11c]**

The evolution of common items (Lucky Horseshoe -> Golden Clover) is **[11b]** infrastructure; the item itself is 11c.

- **Lucky Horseshoe** (new common relic) **-> Golden Clover**, at level 5:
  - +1 fragment every 10 kills, per level.
  - Milestones: N5 +3% crit; N10 +1 reroll per run; N15 more legendary chance.
- **Detonating Plague** (poison legendary relic):
  - Every 3s, each poisoned enemy passes 1 stack to each neighbour; the level defines how many neighbours.
  - When the next poison tick is larger than the enemy's current health, it explodes and deals the accumulated poison damage to its neighbours.
  - On death, the enemy passes half of its stacks to the neighbours.
- **4 new poison items:**
  - **Venom Vial** (rare relic): hits from any weapon on a poisoned target add +1 stack per level. N3: poisoned enemies walk 15% slower. N5: +1 base poison damage per level.
  - **Serpent Dagger** (uncommon weapon, 1.6s, 5 damage): each hit applies 1 stack, +1 per level. N3: direct damage +3% per stack on the target. N5: double strike on targets with 20+ stacks.
  - **Basilisk Hide** (rare armor): when hit, it applies 2 stacks per level to the attacker. N3: poisoned enemies deal -1% damage per stack, up to -30%. N5: heals 1 HP per poisoned enemy every 3s.
  - **Pestilent Mushroom** (uncommon relic): every 5s, a cloud applies 2 stacks per level to all enemies near the hero. N3: the cloud stays on the ground for 3s. N5: doubles the stacks on already poisoned targets.
- **3 new fire items:**
  - **Oil Flask** (rare relic): hits from any weapon on a burning target add +1 stack per level. N3: burning enemies walk 20% slower. N5: the stack loss is halved.
  - **Forge Hammer** (epic weapon): the hit consumes all the target's stacks and deals 3 x stacks damage. N3: consumes only half. N5: the burst hits the neighbours.
  - **Ash Cloak** (rare armor): burning enemies deal -2% damage per stack, up to -40%. N3: when hit, it applies 3 stacks to the attacker. N5: immune to boss fire.
- **Long Crossbow** (rare weapon, 3s): shoots the farthest enemy, 12 damage +3 per level. N3: the shot pierces the whole line. N5: targets in the rear take +50%.
- **Phantom Hunter's Bow** (legendary weapon): fires at every enemy that has not yet come close to the hero, 18 damage. N3: +1 arrow per target. N5: kills in the rear return 1s of cooldown.

## Clarifications made while implementing 11b

- **Thorn Mail:** both the armor (+8) and the thorns (+3) grow per level, by the owner's decision after review.
- **Fixed-rate effects:** the Crystal Armor aura (2s) and Burning Skin (1/s) do not speed up with the shop cooldown upgrade, Speed Boots, the Water Orb advance or Sprint N5 (`fixedRate` in the JSON). Only real cooldown items accelerate.
- **Arcane Robe N3 (+1 stack)** applies to every stack source: weapons, Dragonscale, Burning Skin, Blast Core, Phoenix burst, Shards, Ember Heart spread and the Crystal aura.
- **Blood Scythe souls** derive from `state.kills`, so they count every kill of the run.
- **Extra attacks** (Echo, counter-attack, Lucky Coin) keep permanent modifiers (boss multiplier) and skip one-shot ones (Storm, Tide, Harvest, Escape); they do not count toward charges or the Holy Mace ray counter.
- **Rusted Sword:** also gets +3 damage per level before evolving, so the level 5 sword and the level 5 Veteran's Blade deal the same damage.
- **Shadow Cloak, Counter-attack:** the weapon closest to being ready attacks the enemy that missed.
- **Arcane Robe, N5 "+1 range":** +1 chain bounce (Thunder Staff), +1 neighbour for the fire jump (Ember Heart) and +30 splash radius (Seismic Hammer).
- **Dragonscale, "another enemy":** the nearest other enemy to the one hit. It applies to Ember Skin too.
- **Crystal Armor aura:** radius 100 plus 25 per level (the level grows the radius, the pace stays 2s).
- **Echo Stone** scales damage, stacks, healing and duration; it repeats weapons and relics, not armor. The id changed to `echo_stone`; saves with `mana_stone` are migrated.
- **Tome of Judgment, N3:** the judgment is applied after the hits of the same attack, so it boosts the following hits (and every other source).
- **Veteran's Blade after 15:** alternating +1 strike (20, 30...) and +10% crit chance (25, 35...). Battle Cuirass: +1 regeneration (20, 30...) and +25 armor (25, 35...). The crit chance is global, like the Lucky Coin.
- **Evolution:** kill progress resets on every level-up (reward or kills).
- **Blood Scythe:** the "+1 permanent damage per 20 kills" counts every kill of the run (`counters.souls`); overheal gives +1 max HP per heal, saved as `maxHpBonus`.
- **Phoenix Feather** now levels to 5.

## Open implementation notes

- In 11a, the data format for per-level values and level-gated effects is defined in `game/assets/items.json` and documented in `docs/game.md`. 11b migrates each item to it.
- Boss resistances are rolled when the boss spawns. Bosses are not saved mid-wave (the run is saved at the start of each wave, and continuing rebuilds the wave), so the roll is not part of the save.
