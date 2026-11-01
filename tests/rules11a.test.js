// Fase 11a: regras globais (armadura, esquiva, fogo, frio, resistências de chefe, níveis
// por item, loja nova). Os itens individuais são redesenhados na 11b.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setupRun, enemy, item, fixedRandom, memoryStorage, captureEvents, REAL_CRIT_CHANCE } from "./helpers.js";
import { state, resetMeta, createPlayer, PLAYER_BASE } from "../game/src/state.js";
import { setRandom } from "../game/src/random.js";
import { on } from "../game/src/events.js";
import {
  activateItem,
  applyDot,
  applyCold,
  applyElementalDamage,
  landStacks,
  effectiveResist,
  processDots,
  updateEnemies,
  enemyAttack,
  armorReduction,
  burnDecay,
  coldStacks,
  slowFactor,
  coldTint,
  CRIT_MULT,
  COLD_FREEZE_STACKS,
  FREEZE_MS,
} from "../game/src/combat.js";
import {
  rollBossResist,
  createBossWave,
  updateBosses,
  novaBurnStacks,
  BOSS_ELEMENTS,
} from "../game/src/boss.js";
import {
  applyPassives,
  ensureTimers,
  effectiveCooldown,
  effectsOf,
  enchantTiers,
  levelValue,
  perLevelOf,
  rewardOptions,
  rewardOffer,
  pityScreens,
  PITY_SCREENS,
  MAX_EVASION,
} from "../game/src/items.js";
import * as meta from "../game/src/meta.js";
import * as save from "../game/src/save.js";
import { formatStacks } from "../game/src/layout.js";

beforeEach(() => resetMeta());
afterEach(() => setRandom(null));

const burning = (en) => en.dots.find((d) => d.type === "burning");
const lost = (en) => en.maxHp - en.hp;

// Item de teste com dados por nível explícitos (o catálogo real só migra na 11b)
function custom(overrides = {}) {
  return {
    id: "t_item",
    type: "weapon",
    icon: "T",
    name: "Teste",
    rarity: "common",
    cooldown: 2000,
    baseDmg: 10,
    dmgType: "physical",
    effects: [],
    ...overrides,
  };
}

function own(it, level = 1) {
  state.items = [it];
  state.itemLevels = { [it.id]: level };
  applyPassives();
  ensureTimers();
}

// ─── Armadura, esquiva e crítico ───
test("armadura: redução = armadura / (armadura + 100), sem teto", () => {
  assert.equal(armorReduction(0), 0);
  assert.equal(armorReduction(100), 0.5);
  assert.equal(armorReduction(300), 0.75);
  assert.ok(armorReduction(900) > 0.75, "o teto de 75% saiu");
  assert.ok(armorReduction(1e6) < 1, "nunca chega a 100%");
  setupRun([]);
  state.player.armor = 100;
  enemyAttack(enemy({ dmg: 100 }));
  assert.equal(state.player.hp, 100 - 50);
  state.player.hp = 1000;
  state.player.maxHp = 1000;
  state.player.armor = 900; // 90%
  enemyAttack(enemy({ dmg: 100 }));
  assert.equal(state.player.hp, 1000 - 10);
});

test("esquiva: teto de 40%", () => {
  assert.equal(MAX_EVASION, 0.4);
  setupRun(["shadow_cloak"]);
  state.items[0] = { ...item("shadow_cloak"), effects: [{ trigger: "passive", type: "stats", evasion: 3 }] };
  applyPassives();
  assert.equal(state.player.evasion, 0.4);
});

test("crítico: 5% de base e ×1,5 (inalterados)", () => {
  assert.equal(REAL_CRIT_CHANCE, 0.05);
  assert.equal(CRIT_MULT, 1.5);
});

// ─── Fogo ───
test("fogo: stacks sem limite, 1 de dano por stack, perde max(1, ⌊stacks ÷ 10⌋) por segundo", () => {
  const target = enemy({ hp: 1e6, maxHp: 1e6 });
  setupRun([], [target]);
  applyDot(target, "burning", 1, 0, true, { stacks: 100 });
  processDots(1000);
  assert.equal(lost(target), 100, "100 stacks = 100 de dano");
  assert.equal(burning(target).stacks, 90, "100 → perde 10");
  processDots(1000);
  assert.equal(burning(target).stacks, 81, "90 → perde 9");
  const few = enemy({ hp: 1e6, maxHp: 1e6 });
  state.enemies = [few];
  applyDot(few, "burning", 1, 0, true, { stacks: 5 });
  processDots(1000);
  assert.equal(burning(few).stacks, 4, "5 → perde 1");
  assert.equal(burnDecay(0), 1);
});

test("fogo: não tem duração, só acaba quando os stacks acabam", () => {
  const target = enemy({ hp: 1e6, maxHp: 1e6 });
  setupRun([], [target]);
  applyDot(target, "burning", 1, 0, true, { stacks: 3 });
  for (let i = 0; i < 2; i++) processDots(1000);
  assert.equal(burning(target).stacks, 1);
  processDots(1000);
  assert.equal(target.dots.length, 0);
});

test("Lâmina de Brasa: 1 stack por nível do item por golpe, sem dano direto", () => {
  for (const level of [1, 3, 5]) {
    const target = enemy();
    setupRun(["ember_blade"], [target]);
    state.itemLevels.ember_blade = level;
    activateItem(item("ember_blade"));
    assert.equal(target.hp, target.maxHp);
    assert.equal(burning(target).stacks, level);
  }
});

test("nova de fogo do chefe aplica stacks de queimadura no herói", () => {
  assert.equal(novaBurnStacks(10), 6);
  assert.equal(novaBurnStacks(30), 10);
  setupRun([], []);
  state.player.evasion = 0;
  setRandom(() => 0.9); // Senhor Demônio
  const boss = createBossWave(10, { width: 800, height: 400 }).find((e) => e.isBoss);
  setRandom(null);
  assert.equal(boss.kind, "demon");
  state.enemies = [boss];
  boss.abilityTimer = boss.abilityInterval;
  updateBosses(16);
  assert.equal(burning(state.player).stacks, novaBurnStacks(10));
  assert.equal(burning(state.player).damage, 1);
});

test("Coração de Brasa passa todos os stacks para qualquer golpe que mate", () => {
  const dying = enemy({ hp: 4, x: 150 });
  applyDot(dying, "burning", 1, 0, true, { stacks: 40 });
  const a = enemy({ x: 300 });
  const b = enemy({ x: 340 });
  setupRun(["rusted_sword", "ember_heart"], [dying, a, b]);
  state.itemLevels.ember_heart = 2;
  activateItem(item("rusted_sword")); // golpe de arma, não dano contínuo
  updateEnemies(16);
  assert.equal(burning(a).stacks, 40);
  assert.equal(burning(b).stacks, 40);
});

// ─── Veneno ───
test("veneno: base 1 + 3×(nível−1), +1 por stack, sem limite", () => {
  const target = enemy({ hp: 1e6, maxHp: 1e6 });
  setupRun(["poison_blade"], [target]);
  state.itemLevels.poison_blade = 3;
  for (let i = 0; i < 20; i++) activateItem(item("poison_blade"));
  const dot = target.dots.find((d) => d.type === "poison");
  assert.equal(dot.stacks, 20);
  assert.equal(dot.base, 7);
  const hp = target.hp;
  processDots(1000);
  assert.equal(hp - target.hp, 7 + 20);
});

test("veneno: não se espalha sem item (nem o Coração de Brasa)", () => {
  const dying = enemy({ hp: 0, x: 150 });
  applyDot(dying, "poison", 1, 4, true, { maxStacks: Infinity, base: 1 });
  const a = enemy({ x: 300 });
  setupRun(["ember_heart"], [dying, a]);
  updateEnemies(16);
  assert.equal(a.dots.length, 0);
});

// ─── Frio unificado ───
test("frio: cada stack deixa o inimigo 10% mais lento (andar e atacar)", () => {
  const target = enemy({ moving: true, speed: 1, x: 500, atkInterval: 1000 });
  setupRun([], [target]);
  applyCold(target, 3);
  assert.equal(coldStacks(target), 3);
  assert.ok(Math.abs(slowFactor(target) - 0.7) < 1e-9);
  const x = target.x;
  updateEnemies(100);
  assert.ok(Math.abs(x - target.x - 100 * 0.06 * 0.7) < 1e-6, "andou 70% do normal");

  const hitter = enemy({ moving: false, x: 120, atkInterval: 1000 });
  setupRun([], [hitter]);
  applyCold(hitter, 4);
  updateEnemies(500);
  assert.ok(Math.abs(hitter.atkTimer - 500 * 0.6) < 1e-6, "tempo de ataque a 60%");
});

test("frio: no 5º stack congela por 2s e os stacks zeram", () => {
  const target = enemy();
  setupRun([], [target]);
  const freezes = [];
  on("freeze", (e) => freezes.push(e));
  applyCold(target, COLD_FREEZE_STACKS - 1);
  assert.equal(target.frozen, undefined);
  applyCold(target, 1);
  assert.equal(target.frozen, FREEZE_MS);
  assert.equal(FREEZE_MS, 2000);
  assert.equal(coldStacks(target), 0);
  assert.equal(freezes.length, 1);
  // congelado não acumula frio: não recongela na hora
  applyCold(target, 4);
  assert.equal(coldStacks(target), 0);
  updateEnemies(2000);
  assert.equal(target.frozen, 0);
  applyCold(target, 1);
  assert.equal(coldStacks(target), 1);
});

test("Arco Gélido soma 1 stack de frio por golpe, em vez de 20% de congelar", () => {
  const target = enemy();
  setupRun(["frost_bow"], [target]);
  fixedRandom(0); // a antiga chance de 20% sempre acertaria: agora não existe
  activateItem(item("frost_bow"));
  assert.equal(coldStacks(target), 1);
  assert.equal(target.frozen, undefined);
  assert.ok(!item("frost_bow").effects.some((e) => e.type === "freeze"));
});

test("Armadura Cristalina: a explosão aplica 2 stacks de frio em todos os atingidos", () => {
  const a = enemy({ x: 200 });
  const b = enemy({ x: 700 });
  setupRun(["crystal_armor"], [a, b]);
  state.player.barrier = 1;
  state.player.barrierSource = "crystal_armor";
  enemyAttack(enemy({ dmg: 5 }));
  assert.equal(coldStacks(a), 2);
  assert.equal(coldStacks(b), 2);
});

test("frio: o tom gelado do renderer sobe com os stacks e congelado vale 1", () => {
  const target = enemy();
  setupRun([], [target]);
  assert.equal(coldTint(target), 0);
  applyCold(target, 2);
  assert.ok(coldTint(target) > 0 && coldTint(target) < 1);
  target.frozen = 500;
  assert.equal(coldTint(target), 1);
});

// ─── Resistências de chefe ───
function lcg(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test("sorteio do chefe: no máximo 1 imune, 1 fraco, físico fora, valores em {0,5; 0,8}", () => {
  let withImmune = 0;
  let withoutImmune = 0;
  setRandom(lcg(3));
  assert.equal(rollBossResist(10).immune, null, "o primeiro chefe da run não tem imune");
  for (let seed = 1; seed <= 400; seed++) {
    setRandom(lcg(seed));
    const { resist, immune, weak } = rollBossResist(20);
    assert.equal(resist.physical, 0, "físico sempre 100%");
    assert.deepEqual(Object.keys(resist).sort(), [...BOSS_ELEMENTS, "physical"].sort());
    assert.ok(BOSS_ELEMENTS.includes(weak), "sempre há 1 elemento fraco");
    assert.equal(resist[weak], -0.5);
    const immunes = BOSS_ELEMENTS.filter((el) => resist[el] >= 1);
    assert.ok(immunes.length <= 1, "no máximo 1 imune");
    assert.ok(immune, "do segundo chefe em diante sempre há 1 imune");
    if (immune) {
      withImmune++;
      assert.deepEqual(immunes, [immune]);
      assert.notEqual(immune, weak);
    } else {
      withoutImmune++;
      assert.equal(immunes.length, 0);
    }
    for (const el of BOSS_ELEMENTS) {
      if (el === weak || el === immune) continue;
      assert.ok(resist[el] === 0.5 || resist[el] === 0.8, `${el} = ${resist[el]}`);
    }
  }
  assert.equal(withoutImmune, 0);
  assert.ok(withImmune > 0);
});

test("o chefe nasce com o sorteio (imune e fraco no objeto) e sem os valores fixos antigos", () => {
  setRandom(lcg(7));
  const boss = createBossWave(10, { width: 800, height: 400 }).find((e) => e.isBoss);
  assert.ok(BOSS_ELEMENTS.includes(boss.weak));
  assert.equal(boss.resist[boss.weak], -0.5);
  assert.equal(boss.resist.physical, 0);
  assert.ok(boss.immune === null || BOSS_ELEMENTS.includes(boss.immune));
});

test("resistência reduz os stacks aplicados: 80% deixa entrar 1 a cada 5", () => {
  const target = enemy({ resist: { poison: 0.8, fire: 0.5, ice: -0.5 } });
  let landed = 0;
  for (let i = 0; i < 5; i++) landed += landStacks(target, "poison", 1);
  assert.equal(landed, 1);
  assert.equal(landStacks(target, "poison", 5), 1, "o acumulador continua certo");
  assert.equal(landStacks(target, "poison", 1), 0);
  let fire = 0;
  for (let i = 0; i < 10; i++) fire += landStacks(target, "fire", 1);
  assert.equal(fire, 5, "50% = metade");
  assert.equal(landStacks(target, "ice", 3), 3, "fraqueza aumenta o dano, não os stacks");
  assert.equal(landStacks(enemy(), "fire", 7), 7, "sem resistência entra tudo");
});

test("resistência a veneno reduz os stacks do golpe da Lâmina Venenosa", () => {
  const target = enemy({ hp: 1e6, maxHp: 1e6, resist: { poison: 0.8 } });
  setupRun(["poison_blade"], [target]);
  for (let i = 0; i < 10; i++) activateItem(item("poison_blade"));
  assert.equal(target.dots.find((d) => d.type === "poison").stacks, 2);
});

test("imunidade bloqueia dano e stacks do elemento", () => {
  const boss = enemy({ immune: "fire", resist: { fire: 1, ice: 0.5 } });
  setupRun(["ember_blade"], [boss]);
  const hp = boss.hp;
  assert.equal(applyElementalDamage(boss, 50, "fire", "player"), 0);
  assert.equal(boss.hp, hp);
  assert.equal(landStacks(boss, "fire", 10), 0);
  activateItem(item("ember_blade"));
  assert.equal(boss.dots.length, 0, "a Lâmina de Brasa não queima o imune");
  assert.ok(applyElementalDamage(boss, 50, "ice", "player") > 0, "outros elementos acertam");
});

test("breaksImmunity: o elemento passa a valer 100%", () => {
  const boss = enemy({ immune: "fire", resist: { fire: 1 } });
  setupRun(["ember_blade"], [boss]);
  const base = item("ember_blade");
  state.items = [{ ...base, breaksImmunity: true }];
  assert.equal(effectiveResist(boss, "fire", "ember_blade"), 0);
  assert.equal(applyElementalDamage(boss, 50, "fire", "player", false, "ember_blade"), 50);
  activateItem(state.items[0]);
  assert.equal(burning(boss).stacks, 1, "os stacks também entram");

  // flag com nível: só vale a partir dele
  state.items = [{ ...base, breaksImmunity: 5 }];
  state.itemLevels.ember_blade = 4;
  assert.equal(effectiveResist(boss, "fire", "ember_blade"), 1);
  state.itemLevels.ember_blade = 5;
  assert.equal(effectiveResist(boss, "fire", "ember_blade"), 0);
});

test("breaksImmunity só vale para quem tem a flag", () => {
  const boss = enemy({ immune: "fire", resist: { fire: 1 } });
  setupRun(["ember_blade", "blast_core"], [boss]);
  state.items[0] = { ...item("ember_blade"), breaksImmunity: true };
  assert.equal(effectiveResist(boss, "fire", "blast_core"), 1);
  assert.equal(effectiveResist(boss, "fire", null), 1);
});

test("Coração de Brasa também respeita a resistência dos vizinhos", () => {
  const dying = enemy({ hp: 0, x: 150 });
  applyDot(dying, "burning", 1, 0, true, { stacks: 10 });
  const resistant = enemy({ x: 300, resist: { fire: 0.8 } });
  setupRun(["ember_heart"], [dying, resistant]);
  updateEnemies(16);
  assert.equal(burning(resistant).stacks, 2);
});

// ─── Níveis por item ───
test("dados por nível: campo + campoPerLevel e o mapa perLevel", () => {
  const it = custom({
    baseDmgPerLevel: 3,
    cooldownPerLevel: -100,
    effects: [{ trigger: "hit", type: "x", amount: 5, perLevel: { amount: 2 } }],
  });
  own(it, 3);
  assert.equal(perLevelOf(it, "baseDmg"), 3);
  assert.equal(perLevelOf(it.effects[0], "amount"), 2);
  assert.equal(perLevelOf(it, "cooldown"), -100);
  assert.equal(levelValue(it, it, "baseDmg"), 16);
  assert.equal(levelValue(it, it.effects[0], "amount"), 9);
  assert.equal(effectiveCooldown(it), 1800, "recarga -100 ms por nível, não -5%");
  state.enemies = [enemy()];
  activateItem(it);
  assert.equal(lost(state.enemies[0]), 16);
});

test("sem dados por nível vale a regra genérica: +20% no efeito e -5% de recarga", () => {
  const it = custom();
  own(it, 3);
  assert.equal(perLevelOf(it, "baseDmg"), null);
  assert.equal(levelValue(it, it, "baseDmg"), 10 * 1.4);
  assert.equal(levelValue(it, it, "baseDmg", 10, { legacy: false }), 10);
  assert.equal(effectiveCooldown(it), Math.round(2000 * 0.9));
  state.enemies = [enemy()];
  activateItem(it);
  assert.equal(lost(state.enemies[0]), 14);
});

test("passivos com valor por nível explícito (armadura)", () => {
  const armor = custom({
    type: "armor",
    cooldown: 0,
    passive: true,
    effects: [{ trigger: "passive", type: "stats", armor: 10, armorPerLevel: 4 }],
  });
  own(armor, 3);
  assert.equal(state.player.armor, 18);
  own(item("leather_vest"), 3);
  assert.equal(state.player.armor, Math.round(12 * 1.4), "item sem dados segue a regra genérica");
});

test("minLevel: o efeito só vale a partir do nível", () => {
  const it = custom({
    effects: [
      { trigger: "hit", type: "cold", stacks: 1 },
      { trigger: "hit", type: "cold", stacks: 2, minLevel: 3 },
    ],
  });
  for (const [level, expected] of [[1, 1], [2, 1], [3, 3], [5, 3]]) {
    const target = enemy();
    setupRun([], [target]);
    own(it, level);
    assert.equal(effectsOf(it, "hit").length, level >= 3 ? 2 : 1);
    activateItem(it);
    assert.equal(coldStacks(target), expected, `nível ${level}`);
  }
});

test("encantamentos: texto base libera no nível 1 (ou enchantLevel) e o extra no 5", () => {
  const it = custom({ enchant: "N3", enchantLevel: 3, enchantExtra: "N5" });
  own(it, 1);
  assert.deepEqual(enchantTiers(it, 1).map((x) => [x.text, x.minLevel, x.unlocked]), [
    ["N3", 3, false],
    ["N5", 5, false],
  ]);
  assert.deepEqual(enchantTiers(it, 3).map((x) => x.unlocked), [true, false]);
  assert.deepEqual(enchantTiers(it, 5).map((x) => x.unlocked), [true, true]);
  // item atual do catálogo: o encantamento vale desde o nível 1
  const bow = item("frost_bow");
  assert.deepEqual(enchantTiers(bow, 1).map((x) => x.unlocked), [true]);
  assert.equal(enchantTiers(item("rusted_sword")).length, 0);
});

// ─── Loja ───
test("Guarda: +5 de armadura por nível", () => {
  state.meta.upgrades = { guard: 3 };
  const p = createPlayer();
  meta.applyUpgrades(p);
  assert.equal(p.baseArmor, 15);
});

test("Precisão: +1% de crítico por nível, até 15 níveis", () => {
  state.fragments = 1e9;
  let bought = 0;
  while (meta.buyUpgrade("precision")) bought++;
  assert.equal(bought, 15);
  assert.equal(meta.isMaxed("precision"), true);
  assert.equal(meta.upgradeCost("precision"), Infinity);
  setupRun([]);
  meta.applyUpgrades(state.player);
  applyPassives();
  assert.ok(Math.abs(state.player.critChance - (PLAYER_BASE.critChance + 0.15)) < 1e-9);
  assert.equal(meta.describeLevel("precision", 4), "+4% crítico");
  // mesma curva de custo das outras
  resetMeta();
  assert.equal(meta.upgradeCost("precision"), meta.upgradeCost("vitality"));
});

test("Mais uma opção: nível único de 400 fragmentos, a recompensa mostra 4 itens", () => {
  assert.equal(meta.rewardOptionCount(), 3);
  state.fragments = 399;
  assert.equal(meta.buyUpgrade("extraOption"), false);
  state.fragments = 1000;
  assert.equal(meta.upgradeCost("extraOption"), 400);
  assert.equal(meta.buyUpgrade("extraOption"), true);
  assert.equal(state.fragments, 600);
  assert.equal(meta.rewardOptionCount(), 4);
  assert.equal(meta.isMaxed("extraOption"), true);
  assert.equal(meta.buyUpgrade("extraOption"), false, "só um nível");
  setupRun([]);
  assert.equal(rewardOptions(meta.rewardOptionCount()).length, 4);
});

test("Rerrolar: 3 níveis de 100, 250 e 500; cada nível dá 1 rerrolagem por run", () => {
  state.fragments = 10000;
  assert.equal(meta.rerollsPerRun(), 0);
  const costs = [];
  while (!meta.isMaxed("reroll")) {
    costs.push(meta.upgradeCost("reroll"));
    assert.equal(meta.buyUpgrade("reroll"), true);
  }
  assert.deepEqual(costs, [100, 250, 500]);
  assert.equal(state.fragments, 10000 - 850);
  assert.equal(meta.rerollsPerRun(), 3);
  assert.equal(meta.buyUpgrade("reroll"), false);
});

test("rerrolar na tela de recompensa gasta uma rerrolagem e não conta a tela duas vezes", () => {
  setupRun([]);
  state.rerollsLeft = 2;
  state.rewardsSinceLegendary = 1;
  const offer = rewardOffer(4);
  assert.equal(offer.options.length, 4);
  const first = offer.options.map((i) => i.id).join();
  const afterFirst = state.rewardsSinceLegendary;
  assert.ok(afterFirst === 0 || afterFirst === 2);
  assert.ok(offer.reroll());
  assert.equal(state.rerollsLeft, 1);
  assert.ok(state.rewardsSinceLegendary === 0 || state.rewardsSinceLegendary === 2, "sem somar duas vezes");
  assert.ok(offer.reroll());
  assert.equal(state.rerollsLeft, 0);
  assert.equal(offer.reroll(), null, "acabaram");
  assert.equal(state.rerollsLeft, 0);
  assert.equal(offer.options.length, 4);
  assert.notEqual(offer.options.map((i) => i.id).join(), first, "rerrolar muda as opções");
});

test("rerrolar evita as opções atuais quando o sorteio permite", () => {
  setupRun([]);
  state.rerollsLeft = 20;
  const offer = rewardOffer(4);
  for (let i = 0; i < 10; i++) {
    const before = new Set(offer.options.map((it) => it.id));
    offer.reroll();
    assert.ok(offer.options.every((it) => !before.has(it.id)));
  }
});

test("rerrolar numa tela de chefe mantém o lendário garantido", () => {
  setupRun([]);
  state.rerollsLeft = 5;
  const offer = rewardOffer(3, { boss: true });
  for (let i = 0; i < 20; i++) {
    assert.ok(offer.options.some((it) => it.rarity === "legendary"));
    offer.reroll();
  }
});

test("Sorte lendária: a garantia chega após 3 telas, depois após 2 (em vez de 4)", () => {
  assert.equal(pityScreens(), PITY_SCREENS);
  assert.equal(PITY_SCREENS, 4);
  state.meta.upgrades = { luck: 1 };
  assert.equal(pityScreens(), 3);
  state.meta.upgrades = { luck: 2 };
  assert.equal(pityScreens(), 2);
  assert.equal(meta.describeLevel("luck", 1), "após 3 telas sem lendário");
  assert.equal(meta.describeLevel("luck", 2), "após 2 telas sem lendário");

  const guaranteed = (luck, screens) => {
    state.meta.upgrades = { luck };
    let all = true;
    for (let i = 0; i < 80; i++) {
      setupRun([]);
      state.rewardsSinceLegendary = screens;
      if (!rewardOptions(3).some((it) => it.rarity === "legendary")) all = false;
    }
    return all;
  };
  assert.equal(guaranteed(0, 3), false, "sem a melhoria, 3 telas ainda não garantem");
  assert.equal(guaranteed(0, 4), true);
  assert.equal(guaranteed(1, 3), true);
  assert.equal(guaranteed(1, 2), false);
  assert.equal(guaranteed(2, 2), true);
});

test("Sorte lendária: 2 níveis de 200 e 600", () => {
  state.fragments = 5000;
  assert.equal(meta.upgradeCost("luck"), 200);
  meta.buyUpgrade("luck");
  assert.equal(meta.upgradeCost("luck"), 600);
  meta.buyUpgrade("luck");
  assert.equal(meta.isMaxed("luck"), true);
  assert.equal(state.fragments, 5000 - 800);
});

test("a loja tem 8 melhorias com nome e descrição nos dois idiomas", () => {
  assert.deepEqual(
    meta.UPGRADES.map((u) => u.id),
    ["vitality", "might", "guard", "haste", "precision", "extraOption", "reroll", "luck"],
  );
});

// ─── Saves ───
test("save: rerrolagens restantes vão na run e o meta guarda as melhorias novas", () => {
  setupRun(["rusted_sword"]);
  const storage = memoryStorage();
  save.setStorage(storage);
  state.rerollsLeft = 2;
  state.meta.upgrades = { reroll: 3, luck: 1, extraOption: 1, precision: 7 };
  save.saveRun();
  assert.equal(JSON.parse(storage.data[save.RUN_KEY]).rerollsLeft, 2);

  setupRun([]);
  state.meta.upgrades = {};
  state.rerollsLeft = 0;
  save.loadMeta();
  assert.deepEqual(state.meta.upgrades, { reroll: 3, luck: 1, extraOption: 1, precision: 7 });
  assert.equal(save.loadRun(), true);
  assert.equal(state.rerollsLeft, 2);
});

test("save antigo (sem rerrolagens nem melhorias novas) usa os padrões", () => {
  setupRun(["rusted_sword"]);
  const storage = memoryStorage({
    [save.RUN_KEY]: JSON.stringify({
      version: save.SAVE_VERSION,
      wave: 3,
      items: ["rusted_sword"],
      player: { hp: 50, maxHp: 100 },
    }),
    [save.META_KEY]: JSON.stringify({ fragments: 40, upgrades: { vitality: 2, guard: 1 } }),
  });
  save.setStorage(storage);
  state.rerollsLeft = 1; // a run nova já tinha definido pela loja
  save.loadMeta();
  assert.equal(save.loadRun(), true);
  assert.equal(state.rerollsLeft, 1, "sem o campo, fica o que a loja deu");
  assert.equal(meta.upgradeLevel("reroll"), 0);
  assert.equal(meta.rewardOptionCount(), 3);
  assert.equal(meta.rerollsPerRun(), 0);
  assert.equal(pityScreens(), 4);
  assert.equal(meta.upgradeLevel("guard"), 1);
});

// ─── Overlay ───
test("formatStacks encurta números grandes para caber ao lado do ícone", () => {
  assert.equal(formatStacks(0), "0");
  assert.equal(formatStacks(7), "7");
  assert.equal(formatStacks(999), "999");
  assert.equal(formatStacks(1000), "1k");
  assert.equal(formatStacks(1500), "1.5k");
  assert.equal(formatStacks(12345), "12k");
  assert.equal(formatStacks(2500000), "2.5M");
});

// ─── Ajustes da revisão ───
test("chefe: o primeiro da run não tem imune; os seguintes sempre têm exatamente 1", () => {
  setRandom(lcg(11));
  const a = createBossWave(10, { width: 800, height: 400 }).find((e) => e.isBoss);
  const b = createBossWave(20, { width: 800, height: 400 }).find((e) => e.isBoss);
  assert.equal(a.immune, null);
  assert.ok(BOSS_ELEMENTS.includes(b.immune));
  assert.equal(b.resist[b.immune], 1);
});

test("frio: sem frio novo perde 1 stack a cada 2s; frio novo reinicia a contagem", () => {
  const target = enemy({ hp: 1e6, maxHp: 1e6 });
  setupRun([], [target]);
  applyCold(target, 3);
  processDots(1999);
  assert.equal(coldStacks(target), 3);
  processDots(1);
  assert.equal(coldStacks(target), 2);
  processDots(1500);
  applyCold(target, 1);
  processDots(1500);
  assert.equal(coldStacks(target), 3, "o frio novo reiniciou o relógio");
  processDots(500);
  assert.equal(coldStacks(target), 2);
  processDots(2000);
  processDots(2000);
  assert.equal(target.dots.length, 0);
});

test("veneno nunca expira: fica até o inimigo morrer, sem decair", () => {
  const target = enemy({ hp: 1e6, maxHp: 1e6 });
  setupRun([], [target]);
  applyDot(target, "poison", 1, 0, true, { maxStacks: Infinity, base: 1, stacks: 4 });
  for (let i = 0; i < 30; i++) processDots(1000);
  const p = target.dots.find((d) => d.type === "poison");
  assert.equal(p.stacks, 4);
  assert.equal(lost(target), 30 * 5);
});

test("fraqueza aumenta o tick de dano contínuo (e a resistência não corta duas vezes)", () => {
  const weak = enemy({ hp: 1e6, maxHp: 1e6, resist: { fire: -0.5, poison: 0.5 } });
  setupRun([], [weak]);
  applyDot(weak, "burning", 1, 0, true, { stacks: 10 });
  applyDot(weak, "poison", 1, 0, true, { maxStacks: Infinity, base: 0, stacks: 10 });
  processDots(1000);
  assert.equal(lost(weak), 15 + 10, "fogo ×1,5; veneno resistido não é cortado de novo");
});

test("explosão da Armadura Cristalina congela vários e avisa uma vez só", () => {
  const list = [enemy({ x: 200 }), enemy({ x: 300 }), enemy({ x: 400 })];
  setupRun(["crystal_armor"], list);
  for (const en of list) applyCold(en, 3);
  const freezes = [];
  on("freeze", (e) => freezes.push(e));
  const logs = captureEvents();
  state.player.barrier = 1;
  state.player.barrierSource = "crystal_armor";
  enemyAttack(enemy({ dmg: 5 }));
  assert.ok(list.every((en) => en.frozen === FREEZE_MS));
  assert.equal(freezes.length, 1);
  assert.equal(logs.filter((e) => e.type === "sfx" && e.payload.name === "freeze").length, 1);
  assert.equal(logs.filter((e) => e.type === "log" && /congelad/.test(e.payload.msg)).length, 1);
});

test("Coração de Brasa não gasta vaga com vizinho imune a fogo", () => {
  const dying = enemy({ hp: 0, x: 150 });
  applyDot(dying, "burning", 1, 0, true, { stacks: 6 });
  const immune = enemy({ x: 200, immune: "fire", resist: { fire: 1 } });
  const ok = enemy({ x: 400 });
  setupRun(["ember_heart"], [dying, immune, ok]);
  updateEnemies(16);
  assert.equal(burning(ok).stacks, 6, "o único vizinho do nível 1 não imune recebe");
  assert.equal(immune.dots.length, 0);
});

test("golpe em alvo imune: só o aviso, sem número, sem evento de golpe e sem som", () => {
  const boss = enemy({ immune: "physical", resist: { physical: 1 } });
  setupRun(["rusted_sword"], [boss]);
  const hits = [];
  on("hit", (e) => hits.push(e));
  const ev = captureEvents();
  activateItem(item("rusted_sword"));
  assert.equal(hits.length, 0);
  assert.equal(boss.hp, boss.maxHp);
  assert.ok(!ev.some((e) => e.type === "sfx" && e.payload.name === "hit"));
  assert.ok(!state.effects.some((e) => e.type === "number"));
  assert.ok(state.effects.some((e) => e.type === "text" && e.text === "IMUNE"));
});

test("frio também atrasa a habilidade do chefe", () => {
  setupRun([], []);
  setRandom(() => 0.1); // Lich
  const boss = createBossWave(10, { width: 800, height: 400 }).find((e) => e.isBoss);
  setRandom(null);
  state.enemies = [boss];
  boss.resist.ice = 0;
  applyCold(boss, 4);
  boss.abilityTimer = 0;
  updateBosses(1000);
  assert.ok(Math.abs(boss.abilityTimer - 600) < 1e-6);
});
