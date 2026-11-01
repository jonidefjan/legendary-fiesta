// Fase 11b: os 29 itens com valores por nível e encantamentos de nível 3 e 5, mecânicas
// redesenhadas, evolução dos itens comuns e a saída da mana e da barreira
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ITEMS,
  setupRun,
  enemy,
  item,
  fixedRandom,
  captureEvents,
  setLevel,
  memoryStorage,
} from "./helpers.js";
import { state, resetRun } from "../game/src/state.js";
import { on } from "../game/src/events.js";
import { setRandom } from "../game/src/random.js";
import {
  activateItem,
  updateItemTimers,
  updateEnemies,
  updateRegen,
  processDots,
  enemyAttack,
  applyDot,
  applyCold,
  applyElementalDamage,
  coldStacks,
  effectiveResist,
  KNOWN_EFFECTS,
} from "../game/src/combat.js";
import {
  addItemOrLevel,
  addEvolutionKill,
  applyPassives,
  ensureTimers,
  effectiveCooldown,
  effectsOf,
  effectCount,
  enchantTiers,
  evolutionProgress,
  generateRandomItems,
  killsForNextLevel,
  levelValue,
  maxLevelOf,
  setItems,
  RARITIES,
} from "../game/src/items.js";
import * as save from "../game/src/save.js";

const lost = (en) => en.maxHp - en.hp;
const big = (overrides = {}) => enemy({ hp: 1e6, maxHp: 1e6, ...overrides });
const burning = (en) => en.dots.find((d) => d.type === "burning");
const poison = (en) => en.dots.find((d) => d.type === "poison");
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ""} ${a} != ${b}`);

// Run pronta com itens nos níveis dados e sorteio fixo (sem crítico, sem chances)
function run(ids, enemies = [big()], levels = {}) {
  setupRun(ids, enemies);
  fixedRandom(0.5);
  for (const [id, level] of Object.entries(levels)) state.itemLevels[id] = level;
  applyPassives();
  ensureTimers();
  return state;
}

// ─── Tabela: valores de cada item no nível 1, 3 e 5 ───
// [id, onde, chave, N1, N3, N5]; "item" lê do próprio item, o resto é o tipo do efeito
const TABLE = [
  ["rusted_sword", "item", "baseDmg", 10, 16, 22],
  ["ember_blade", "item", "baseDmg", 12, 18, 24],
  ["ember_blade", "dot", "stacks", 1, 3, 5],
  ["shadow_dagger", "item", "baseDmg", 12, 16, 20],
  ["thunder_staff", "item", "baseDmg", 29, 39, 49],
  ["thunder_staff", "chain", "targets", 2, 4, 6],
  ["thunder_staff", "chain", "ratio", 0.5, 0.5, 1],
  ["leather_vest", "stats", "armor", 16, 32, 48],
  ["iron_shield", "blockNext", "blocks", 1, 1, 2],
  ["mage_robe", "stats", "elementalBoost", 0.13, 0.23, 0.33],
  ["dragonscale", "burnAttacker", "stacks", 1, 3, 5],
  ["health_crystal", "heal", "amount", 10, 16, 22],
  ["echo_stone", "echo", "ratio", 0.65, 0.85, 1],
  ["echo_stone", "echo", "repeats", 1, 2, 2],
  ["berserker_totem", "frenzy", "duration", 3000, 4000, 5000],
  ["phoenix_feather", "revive", "hpRatio", 0.52, 0.72, 0.92],
  ["frost_bow", "item", "baseDmg", 22, 28, 34],
  ["frost_bow", "cold", "freezeMs", 2000, 2000, 3000],
  ["poison_blade", "item", "baseDmg", 13, 13, 13],
  ["poison_blade", "dot", "base", 1, 7, 13],
  ["poison_blade", "dot", "stacks", 1, 1, 2],
  ["holy_mace", "item", "baseDmg", 23, 31, 39],
  ["holy_mace", "heal", "amount", 7, 9, 11],
  ["blood_scythe", "item", "baseDmg", 26, 36, 46],
  ["blood_scythe", "lifesteal", "ratio", 0.39, 0.39, 0.5],
  ["water_orb", "item", "baseDmg", 20, 26, 32],
  ["water_orb", "cooldownOthers", "ms", 300, 400, 500],
  ["chainmail", "stats", "armor", 23, 39, 55],
  ["chainmail", "reflect", "chance", 0.15, 0.15, 0.3],
  ["chainmail", "reflect", "ratio", 0.5, 0.5, 1],
  ["shadow_cloak", "stats", "evasion", 0.13, 0.21, 0.29],
  ["crystal_armor", "coldAura", "radius", 100, 150, 200],
  ["vampiric_amulet", "lifesteal", "ratio", 0.1, 0.14, 0.18],
  ["speed_boots", "stats", "weaponSpeed", 0.1, 0.18, 0.26],
  ["lucky_coin", "stats", "critChance", 0.2, 0.3, 0.4],
  ["cursed_ring", "stats", "damageBoost", 0.4, 0.6, 0.8],
  ["cursed_ring", "stats", "maxHpMult", -0.2, -0.2, -0.1],
  ["cursed_ring", "pact", "max", 0.25, 0.25, 0.5],
  ["seismic_hammer", "item", "baseDmg", 18, 26, 34],
  ["seismic_hammer", "splash", "ratio", 0.4, 0.6, 0.6],
  ["seismic_hammer", "splash", "radius", 90, 130, 130],
  ["blast_core", "blast", "damage", 13, 23, 33],
  ["blast_core", "blast", "radius", 220, 220, 440],
  ["judgment_tome", "item", "baseDmg", 12, 18, 24],
  ["thorn_mail", "thorns", "damage", 8, 14, 20],
  ["thorn_mail", "stats", "armor", 10, 26, 42],
];

test("tabela: valor de cada item no nível 1, 3 e 5 (e nada cresce sem declarar)", () => {
  for (const [id, where, key, ...expected] of TABLE) {
    const it = item(id);
    const obj = where === "item" ? it : it.effects.find((e) => e.type === where);
    assert.ok(obj, `${id}: efeito ${where}`);
    run([id], [big()]);
    [1, 3, 5].forEach((level, i) => {
      state.itemLevels[id] = level;
      near(levelValue(it, obj, key), expected[i], `${id}.${where}.${key} N${level}`);
    });
  }
});

test("recarga: o Escudo de Ferro perde 1 s por nível; os outros itens não mudam", () => {
  run(["iron_shield"]);
  const cooldowns = [1, 3, 5].map((level) => {
    state.itemLevels.iron_shield = level;
    return effectiveCooldown(item("iron_shield"));
  });
  assert.deepEqual(cooldowns, [8000, 6000, 4000]);
  for (const it of ITEMS.filter((i) => i.cooldown > 0 && i.id !== "iron_shield")) {
    state.itemLevels[it.id] = 5;
    assert.equal(effectiveCooldown(it), it.cooldown, `${it.id} não declara cooldownPerLevel`);
    delete state.itemLevels[it.id];
  }
});

test("dano de cada arma no nível 1 e 5 (alvo único, sem crítico)", () => {
  // [id, N1, N5]: Adaga bate 2× no N1 e 3× no N5 (golpe extra do nível 3)
  const table = [
    ["rusted_sword", 10, 22],
    ["shadow_dagger", 24, 60],
    ["thunder_staff", 29, 49],
    ["frost_bow", 22, 34],
    ["poison_blade", 13, 13],
    ["holy_mace", 23, 39],
    ["blood_scythe", 26, 46],
    ["water_orb", 20, 32],
    ["seismic_hammer", 18, 34],
    ["judgment_tome", 12, 24],
    ["ember_blade", 12, 24],
  ];
  for (const [id, n1, n5] of table) {
    for (const [level, expected] of [[1, n1], [5, n5]]) {
      const target = big();
      run([id], [target], { [id]: level });
      activateItem(item(id));
      assert.equal(lost(target), expected, `${id} N${level}`);
    }
  }
});

// ─── Encantamentos: N3 e N5 ───
test("todo item tem o encantamento no nível 3 e o extra no 5 (formas evoluídas: 10 e 15)", () => {
  for (const it of ITEMS) {
    if (it.rarity === "mythic") continue; // míticos não têm nível nem encantamentos
    const evolved = !!it.evolvedFrom;
    const tiers = enchantTiers(it, 1);
    if (!it.evolution) assert.equal(tiers.length, evolved ? 2 : 2, `${it.id}: 2 encantamentos`);
    if (evolved) {
      assert.deepEqual(tiers.map((x) => x.minLevel), [10, 15], it.id);
    } else if (!it.evolution) {
      assert.deepEqual(tiers.map((x) => x.minLevel), [3, 5], it.id);
    }
    // Todo efeito com minLevel segue esses degraus
    for (const e of it.effects || []) {
      if (e.minLevel) assert.ok([3, 5, 10, 15, 20, 25].includes(e.minLevel), `${it.id}: minLevel ${e.minLevel}`);
    }
  }
  assert.equal(enchantTiers(item("rusted_sword")).length, 0);
  assert.equal(enchantTiers(item("leather_vest")).length, 0);
  const bow = item("frost_bow");
  assert.deepEqual(enchantTiers(bow, 2).map((x) => x.unlocked), [false, false]);
  assert.deepEqual(enchantTiers(bow, 3).map((x) => x.unlocked), [true, false]);
  assert.deepEqual(enchantTiers(bow, 5).map((x) => x.unlocked), [true, true]);
});

test("os efeitos de nível 3 e 5 só valem quando o item chega lá", () => {
  const expected = {
    ember_blade: ["flare"],
    shadow_dagger: ["strikes", "cooldownRefund"],
    thunder_staff: ["storm"],
    iron_shield: ["reflect"],
    mage_robe: ["stats", "stats"],
    dragonscale: ["emberSkin"],
    berserker_totem: ["useNow", "frenzyBoost"],
    phoenix_feather: ["resetCooldowns", "reviveBurst"],
    frost_bow: ["pierce"],
    poison_blade: ["corrosion"],
    holy_mace: ["heal", "ray"],
    blood_scythe: ["harvest", "cleave"],
    water_orb: ["tide", "tideWave"],
    chainmail: ["reflect"],
    shadow_cloak: ["counterAttack", "empowerNext"],
    crystal_armor: ["frozenVuln", "shards"],
    speed_boots: ["sprint"],
    lucky_coin: ["extraAttack", "stats"],
    cursed_ring: ["pact"],
    judgment_tome: ["judge", "bossBonus"],
  };
  for (const [id, types] of Object.entries(expected)) {
    const it = item(id);
    const gated = (it.effects || []).filter((e) => e.minLevel).map((e) => e.type);
    assert.deepEqual(gated, types, id);
    run([id]);
    const at = (level) => {
      state.itemLevels[id] = level;
      return (it.effects || []).filter((e) => effectsOf(it, e.trigger).includes(e) && e.minLevel).length;
    };
    assert.equal(at(1), 0, `${id} N1`);
    assert.equal(at(2), 0, `${id} N2`);
    assert.ok(at(3) > 0 || at(5) > 0, `${id} N3/N5`);
    assert.equal(at(5), types.length, `${id} N5 tem tudo`);
  }
});

test("quebram a imunidade no nível 5 (e só nele): fogo, gelo, veneno, sombra, sagrado e raio", () => {
  const table = {
    ember_blade: "fire",
    ember_heart: "fire",
    blast_core: "fire",
    detonating_plague: "poison",
    frost_bow: "ice",
    crystal_armor: "ice",
    poison_blade: "poison",
    shadow_dagger: "shadow",
    blood_scythe: "shadow",
    holy_mace: "holy",
    judgment_tome: "holy",
    thunder_staff: "lightning",
  };
  assert.deepEqual(
    ITEMS.filter((i) => i.breaksImmunity).map((i) => i.id).sort(),
    Object.keys(table).sort(),
  );
  for (const [id, element] of Object.entries(table)) {
    const boss = enemy({ immune: element, resist: { [element]: 1 } });
    run([id], [boss]);
    for (const level of [1, 3, 4]) {
      state.itemLevels[id] = level;
      assert.equal(effectiveResist(boss, element, id), 1, `${id} N${level} continua imune`);
    }
    state.itemLevels[id] = 5;
    assert.equal(effectiveResist(boss, element, id), 0, `${id} N5 quebra`);
  }
});

// ─── Armas ───
test("Lâmina de Brasa: 12 de dano, 1 stack por nível; labareda (N3) com 20+ stacks", () => {
  const main = big({ x: 150 });
  const side = big({ x: 200 });
  const far = big({ x: 500 });
  run(["ember_blade"], [main, side, far], { ember_blade: 2 });
  applyDot(main, "burning", 1, 0, true, { stacks: 30 });
  activateItem(item("ember_blade"));
  assert.equal(burning(main).stacks, 32);
  assert.equal(lost(side), 0, "nível 2 sem labareda");

  setLevel("ember_blade", 3); // 3 stacks por golpe: 35 → labareda de 1 por stack
  activateItem(item("ember_blade"));
  assert.equal(burning(main).stacks, 35);
  assert.equal(lost(side), 35);
  assert.equal(lost(far), 0, "fora do raio");

  const few = big();
  state.enemies = [few];
  activateItem(item("ember_blade"));
  assert.equal(lost(few), 12 + 3 * 2, "só o golpe direto (N3): abaixo de 20 stacks não solta labareda");
});

test("Adaga das Sombras: 3 golpes a partir do nível 3; recarga e imunidade só no 5", () => {
  const target = big();
  run(["shadow_dagger"], [target]);
  let strikes = 0;
  on("hit", () => strikes++);
  activateItem(item("shadow_dagger"));
  assert.equal(strikes, 2);
  setLevel("shadow_dagger", 3);
  strikes = 0;
  activateItem(item("shadow_dagger"));
  assert.equal(strikes, 3);
  assert.equal(state.itemTimers.shadow_dagger.elapsed, 0, "N3 não devolve recarga");
  fixedRandom(0.1);
  setLevel("shadow_dagger", 5);
  activateItem(item("shadow_dagger"));
  assert.equal(state.itemTimers.shadow_dagger.elapsed, 1500);
});

test("Cajado do Trovão: +1 salto por nível, Tempestade no N3, saltos sem perda no N5", () => {
  const list = [big({ x: 150 }), ...[250, 300, 350, 400, 450, 500, 550].map((x) => big({ x }))];
  run(["thunder_staff"], list);
  activateItem(item("thunder_staff"));
  assert.deepEqual(list.map(lost), [29, 15, 15, 0, 0, 0, 0, 0], "N1: 2 saltos a 50%");

  setLevel("thunder_staff", 5);
  list.forEach((e) => (e.hp = e.maxHp));
  activateItem(item("thunder_staff"));
  assert.deepEqual(list.map(lost), [49, 49, 49, 49, 49, 49, 49, 0], "N5: 6 saltos sem perder dano");
});

test("Arco Gélido: atravessa no N3 (acerta e esfria o próximo); congelamento de 3 s no N5", () => {
  const a = big({ x: 150 });
  const b = big({ x: 220 });
  run(["frost_bow"], [a, b]);
  activateItem(item("frost_bow"));
  assert.equal(lost(b), 0);
  setLevel("frost_bow", 3);
  activateItem(item("frost_bow"));
  assert.equal(lost(b), 28);
  assert.equal(coldStacks(b), 1);
  assert.equal(coldStacks(a), 2);

  setLevel("frost_bow", 5);
  for (let i = 0; i < 5; i++) activateItem(item("frost_bow"));
  assert.equal(a.frozen, 3000);
});

test("Lâmina Venenosa: Corrosão (N3) e 2 stacks por golpe (N5)", () => {
  const target = big();
  run(["poison_blade"], [target]);
  activateItem(item("poison_blade"));
  assert.equal(poison(target).stacks, 1);
  setLevel("poison_blade", 3);
  for (let i = 0; i < 9; i++) activateItem(item("poison_blade")); // 10 stacks
  const before = lost(target);
  applyElementalDamage(target, 100, "physical", "player");
  assert.equal(lost(target) - before, 110, "+1% por stack");
  for (let i = 0; i < 40; i++) applyDot(target, "poison", 1, 0, true, { maxStacks: Infinity, stacks: 1 });
  const b2 = lost(target);
  applyElementalDamage(target, 100, "physical", "player");
  assert.equal(lost(target) - b2, 125, "teto de +25%");

  const fresh = big();
  run(["poison_blade"], [fresh], { poison_blade: 5 });
  activateItem(item("poison_blade"));
  assert.equal(poison(fresh).stacks, 2);
});

test("Maça Sagrada: raio de luz a cada 5 golpes no N5, 50% do dano em todos", () => {
  const main = big({ x: 150 });
  const other = big({ x: 300 });
  run(["holy_mace"], [main, other], { holy_mace: 5 });
  for (let i = 0; i < 4; i++) activateItem(item("holy_mace"));
  assert.equal(lost(other), 0);
  activateItem(item("holy_mace"));
  assert.equal(lost(other), 20, "50% de 39");
  assert.equal(lost(main), 39 * 5 + 20);
});

test("Foice de Sangue: 2 alvos (N3), +1 de dano a cada 20 abates, 50% e vida máxima (N5)", () => {
  const a = big({ x: 150 });
  const b = big({ x: 250 });
  run(["blood_scythe"], [a, b]);
  activateItem(item("blood_scythe"));
  assert.equal(lost(b), 0, "N1 acerta só um alvo");
  setLevel("blood_scythe", 3);
  activateItem(item("blood_scythe"));
  assert.equal(lost(b), 36);

  // 20 abates: +1 de dano permanente
  state.kills = 19; // as almas contam todos os abates da run
  state.enemies = [enemy({ hp: 0 })];
  updateEnemies(16);
  const t2 = big();
  state.enemies = [t2];
  activateItem(item("blood_scythe"));
  assert.equal(lost(t2), 37);

  // N5: rouba 50% e cura acima da vida máxima vira vida máxima, até +50
  setLevel("blood_scythe", 5);
  state.player.hp = state.player.maxHp;
  const maxHp = state.player.maxHp;
  const t3 = big();
  state.enemies = [t3];
  activateItem(item("blood_scythe"));
  assert.equal(state.player.maxHp, maxHp + 1);
  assert.equal(state.player.maxHpBonus, 1);
  state.player.maxHpBonus = 49;
  applyPassives();
  state.player.hp = state.player.maxHp;
  activateItem(item("blood_scythe"));
  assert.equal(state.player.maxHpBonus, 50);
  activateItem(item("blood_scythe"));
  assert.equal(state.player.maxHpBonus, 50, "teto de +50 na run");
  state.player.hp = 10;
  const t4 = big();
  state.enemies = [t4];
  activateItem(item("blood_scythe"));
  assert.equal(state.player.hp, 10 + Math.round(47 * 0.5), "50% de 47 (46 + 1 de almas)");
});

test("Orbe Aquático: com 5 de Maré (N5) o golpe vira onda de 50% em todos", () => {
  const a = big({ x: 150 });
  const b = big({ x: 300 });
  run(["water_orb"], [a, b], { water_orb: 5 });
  for (let i = 0; i < 5; i++) activateItem(item("water_orb"));
  assert.equal(lost(b), 0);
  assert.equal(state.player.tide.stacks, 5);
  const before = lost(a);
  activateItem(item("water_orb")); // 32 + 5×3 = 47
  assert.equal(lost(a) - before, 47);
  assert.equal(lost(b), 24, "onda: 50% do golpe (23,5 arredondado)");
  assert.equal(state.player.tide.stacks, 0, "a Maré recomeça");
});

test("Martelo Sísmico: respingo de 60% e raio maior (N3); efeitos de golpe dos outros itens (N5)", () => {
  const main = big({ x: 150 });
  const edge = big({ x: 270 }); // 120 do alvo: dentro do raio 130, fora do 90
  run(["seismic_hammer", "vampiric_amulet"], [main, edge]);
  state.player.hp = 50;
  activateItem(item("seismic_hammer"));
  assert.equal(lost(edge), 0);
  setLevel("seismic_hammer", 3); // 26 de dano
  activateItem(item("seismic_hammer"));
  assert.equal(lost(edge), Math.round(26 * 0.6));
  const hp = state.player.hp;
  setLevel("seismic_hammer", 5); // 34
  activateItem(item("seismic_hammer"));
  // roubo 10% (Amuleto N1): 34 no alvo e 20 no respingo = 3 + 2
  assert.equal(state.player.hp - hp, Math.round(34 * 0.1) + Math.round(20 * 0.1));
});

test("Tomo do Julgamento: julgados recebem +15% (N3); chefes levam ×2 (N5)", () => {
  const a = big({ x: 150 });
  const b = big({ x: 300 });
  run(["judgment_tome"], [a, b], { judgment_tome: 3 });
  activateItem(item("judgment_tome"));
  assert.equal(a.judged.ms, 3000);
  const before = lost(a);
  applyElementalDamage(a, 100, "physical", "player");
  assert.equal(lost(a) - before, 115);
  updateEnemies(3001);
  assert.equal(a.judged, null, "o julgamento acaba");

  const boss = big({ x: 150, isBoss: true });
  const adds = big({ x: 300 });
  run(["judgment_tome"], [boss, adds], { judgment_tome: 5 });
  activateItem(item("judgment_tome")); // base 24
  assert.equal(lost(boss), 48);
  assert.equal(lost(adds), 24, "o ×2 é só para chefe; o julgamento vale nos golpes seguintes");
  const boss2 = big({ x: 300, isBoss: true });
  const first = big({ x: 150 });
  run(["judgment_tome"], [first, boss2], { judgment_tome: 5 });
  activateItem(item("judgment_tome"));
  assert.equal(lost(boss2), 48, "o ×2 vale também nos outros alvos que são chefe");
});

// ─── Armaduras ───
test("Escudo de Ferro: bloqueia 2 ataques no N5", () => {
  const atk = big({ dmg: 10 });
  run(["iron_shield"], [atk], { iron_shield: 5 });
  activateItem(item("iron_shield"));
  assert.equal(state.player.blocksLeft, 2);
  assert.equal(enemyAttack(atk), "blocked");
  assert.equal(enemyAttack(atk), "blocked");
  assert.equal(enemyAttack(atk), "hit");
});

test("Cota de Malha: Deflexão de 30% devolvendo 100% no N5", () => {
  const atk = big({ dmg: 20 });
  run(["chainmail"], [atk], { chainmail: 5 });
  fixedRandom(0.25); // acima de 15%, abaixo de 30%
  const hp0 = state.player.hp;
  enemyAttack(atk);
  const taken = hp0 - state.player.hp;
  assert.equal(lost(atk), taken, "100% do dano recebido");
  fixedRandom(0.31);
  const before = lost(atk);
  enemyAttack(atk);
  assert.equal(lost(atk), before);
});

test("Cota de Espinhos: +1% por ponto de armadura (N3); dispara ao esquivar e bloquear (N5)", () => {
  const atk = big({ x: 150, dmg: 5 });
  run(["thorn_mail"], [atk], { thorn_mail: 3 });
  enemyAttack(atk);
  assert.equal(lost(atk), Math.round(14 * (1 + 0.01 * 26)), "14 de dano e 26 de armadura");

  atk.hp = atk.maxHp;
  state.player.evasion = 1;
  assert.equal(enemyAttack(atk), "dodged");
  assert.equal(lost(atk), 0, "N3 não reage à esquiva");
  setLevel("thorn_mail", 5);
  state.player.evasion = 1;
  assert.equal(enemyAttack(atk), "dodged");
  assert.equal(lost(atk), Math.round(20 * 1.42));
  atk.hp = atk.maxHp;
  state.player.evasion = 0;
  state.player.blocksLeft = 1;
  assert.equal(enemyAttack(atk), "blocked");
  assert.equal(lost(atk), Math.round(20 * 1.42));
});

test("Manto do Arcano: +13% (+5% por nível) só nas armas elementais; +1 stack (N3); alcance (N5)", () => {
  const target = big();
  run(["rusted_sword", "frost_bow", "mage_robe"], [target]);
  activateItem(item("rusted_sword"));
  assert.equal(lost(target), 10, "físico não muda");
  const before = lost(target);
  activateItem(item("frost_bow"));
  assert.equal(lost(target) - before, Math.round(22 * 1.13));

  assert.equal(coldStacks(target), 1);
  setLevel("mage_robe", 3);
  assert.equal(state.player.extraStacks, 1);
  const t2 = big();
  state.enemies = [t2];
  activateItem(item("frost_bow"));
  assert.equal(coldStacks(t2), 2, "stack extra");

  // Alcance (N5): +1 salto do Cajado
  const list = [big({ x: 150 }), big({ x: 200 }), big({ x: 250 }), big({ x: 300 })];
  run(["thunder_staff", "mage_robe"], list, { mage_robe: 5 });
  assert.equal(state.player.reach, 1);
  activateItem(item("thunder_staff"));
  assert.deepEqual(list.map((e) => lost(e) > 0), [true, true, true, true], "2 saltos + 1");
});

test("Armadura Cristalina: gelo quebradiço +30% (N3); estilhaços e imunidade (N5)", () => {
  const a = big({ x: 150 });
  const b = big({ x: 200 });
  run(["crystal_armor"], [a, b], { crystal_armor: 3 });
  a.frozen = 1000;
  const before = lost(a);
  applyElementalDamage(a, 100, "physical", "player");
  assert.equal(lost(a) - before, 130);
  const b0 = lost(b);
  applyElementalDamage(b, 100, "physical", "player");
  assert.equal(lost(b) - b0, 100, "só congelado");

  const c = big({ x: 150 });
  const d = big({ x: 200 });
  const far = big({ x: 600 });
  run(["crystal_armor"], [c, d, far], { crystal_armor: 5 });
  applyCold(c, 4);
  applyCold(c, 1); // congela e solta estilhaços
  assert.equal(c.frozen, 2000);
  assert.equal(coldStacks(d), 2);
  assert.equal(coldStacks(far), 0);
});

test("Escama Dracônica: fogo em quem bate (+1 stack por nível); outro inimigo (N3); Pele em brasa (N5)", () => {
  const atk = big({ x: 150, dmg: 5 });
  const other = big({ x: 250 });
  run(["dragonscale"], [atk, other]);
  enemyAttack(atk);
  assert.equal(burning(atk).stacks, 1);
  assert.equal(other.dots.length, 0);

  setLevel("dragonscale", 3);
  enemyAttack(atk);
  assert.equal(burning(atk).stacks, 1 + 3);
  assert.equal(burning(other).stacks, 3, "N3: em outro inimigo também");

  // Pele em brasa (N5): 1 stack por segundo nos colados
  const stuck = big({ x: 150 });
  const spare = big({ x: 400 });
  run(["dragonscale"], [stuck, spare], { dragonscale: 5 });
  const timer = state.itemTimers.dragonscale;
  timer.elapsed = timer.cooldown;
  updateItemTimers(0);
  assert.equal(burning(stuck).stacks, 1);
  assert.equal(burning(spare).stacks, 1, "o 'outro inimigo' também pega");
});

test("Dragonscale não tem barreira nem bônus de vida baixa", () => {
  const it = item("dragonscale");
  assert.ok(!it.effects.some((e) => ["barrier", "lowHpBonus", "reflect"].includes(e.type)));
});

test("Manto das Sombras: o contra-ataque usa a arma mais perto de ficar pronta", () => {
  const atk = big({ dmg: 10 });
  run(["rusted_sword", "shadow_dagger", "shadow_cloak"], [atk], { shadow_cloak: 3 });
  state.itemTimers.rusted_sword.elapsed = 500;
  state.itemTimers.shadow_dagger.elapsed = 2000;
  const used = [];
  on("attack", (e) => used.push(e.itemId));
  state.player.evasion = 1;
  assert.equal(enemyAttack(atk), "dodged");
  assert.deepEqual(used, ["shadow_dagger"]);
  assert.equal(state.itemTimers.shadow_dagger.elapsed, 2000, "a recarga não muda");
});

// ─── Relíquias ───
test("Cristal Vital: abaixo de 30% de vida a recarga cai pela metade (N5)", () => {
  run(["health_crystal"], [big()], { health_crystal: 5 });
  state.itemTimers.health_crystal.elapsed = 0;
  state.player.hp = 90;
  updateItemTimers(1000);
  assert.equal(state.itemTimers.health_crystal.elapsed, 1000);
  state.itemTimers.health_crystal.elapsed = 0;
  state.player.hp = 20;
  updateItemTimers(1000);
  assert.equal(state.itemTimers.health_crystal.elapsed, 2000);
});

test("Botas da Velocidade: Sprint recarrega todas as armas (só armas) no N5", () => {
  run(["rusted_sword", "frost_bow", "health_crystal", "speed_boots"], [big()], { speed_boots: 5 });
  state.itemTimers.frost_bow.elapsed = 0;
  state.itemTimers.health_crystal.elapsed = 0;
  state.player.counters.sprint = 4;
  activateItem(item("rusted_sword"));
  assert.equal(state.itemTimers.rusted_sword.elapsed, state.itemTimers.rusted_sword.cooldown);
  assert.equal(state.itemTimers.frost_bow.elapsed, state.itemTimers.frost_bow.cooldown, "as outras armas também");
  assert.equal(state.itemTimers.health_crystal.elapsed, 0, "relíquia e armadura não");

  run(["rusted_sword", "health_crystal", "speed_boots"], [big()], { speed_boots: 3 });
  state.itemTimers.health_crystal.elapsed = 0;
  state.player.counters.sprint = 4;
  activateItem(item("rusted_sword"));
  assert.equal(state.itemTimers.health_crystal.elapsed, 0, "N3: só a arma que atacou");
});

test("Amuleto Vampírico: o roubo vale também para dano contínuo no N5", () => {
  const target = big();
  run(["vampiric_amulet"], [target], { vampiric_amulet: 3 });
  applyDot(target, "burning", 1, 0, true, { stacks: 50 });
  state.player.hp = 50;
  processDots(1000);
  assert.equal(state.player.hp, 50, "N3 não rouba do dano contínuo");
  setLevel("vampiric_amulet", 5); // 18%
  processDots(1000);
  // a queimadura espera 3 s antes de perder stacks: o segundo tick ainda causa 50 de dano
  assert.equal(state.player.hp, 50 + Math.round(50 * 0.18));
});

test("Totem Berserker: Frenesi automático (N3) e +20% de dano durante o frenesi (N5)", () => {
  const target = big();
  run(["berserker_totem", "rusted_sword"], [target], { berserker_totem: 2 });
  state.itemTimers.berserker_totem.elapsed = 0;
  state.player.hp = 10;
  updateItemTimers(16);
  assert.equal(state.player.berserking, false, "N2 não ativa sozinho");

  setLevel("berserker_totem", 5);
  state.player.berserking = true;
  state.player.berserkSpeed = 0.4;
  const start = lost(target);
  activateItem(item("rusted_sword"));
  assert.equal(lost(target) - start, Math.round(10 * 1.2));
  state.player.berserking = false;
  const before = lost(target);
  activateItem(item("rusted_sword"));
  assert.equal(lost(target) - before, 10);
});

test("Pena de Fênix (N5): ao reviver explode em fogo e aplica 20 stacks em todos", () => {
  const a = big({ x: 150 });
  const b = big({ x: 300 });
  run(["phoenix_feather"], [a, b], { phoenix_feather: 5 });
  state.player.hp = 1;
  enemyAttack(enemy({ dmg: 100 }));
  assert.equal(state.player.hp, 92);
  assert.equal(burning(a).stacks, 20);
  assert.equal(burning(b).stacks, 20);
});

test("Moeda da Fortuna: crítico ×2 no N5", () => {
  const target = big();
  run(["rusted_sword", "lucky_coin"], [target], { lucky_coin: 5 });
  state.player.critChance = 1;
  activateItem(item("rusted_sword")); // sorteio 0,5: crítico garantido e sem ataque extra (25%)
  assert.equal(state.player.critMult, 2);
  assert.equal(lost(target), 20, "10 × 2");
  setLevel("lucky_coin", 3);
  assert.equal(state.player.critMult, 1.5, "antes do nível 5 o crítico é ×1,5");
});

test("Anel Amaldiçoado: Pacto até +50% e vida máxima -10% no N5", () => {
  run(["cursed_ring"], [big()], { cursed_ring: 5 });
  assert.equal(state.player.maxHp, 90);
  const dead = Array.from({ length: 60 }, () => enemy({ hp: 0 }));
  state.player.hp = 90;
  state.enemies = dead;
  updateEnemies(16);
  near(state.player.pactBonus, 0.5);
});

test("Núcleo Explosivo (N5): raio dobra e quebra a imunidade a fogo", () => {
  const boss = enemy({ x: 400, immune: "fire", resist: { fire: 1 }, hp: 1e6, maxHp: 1e6 });
  run(["blast_core"], [boss], { blast_core: 4 });
  assert.equal(activateItem(item("blast_core")), false, "fora do raio de 220");
  setLevel("blast_core", 5);
  boss.x = 500; // 400 do herói: só o raio dobrado alcança
  assert.equal(activateItem(item("blast_core")), true);
  assert.equal(lost(boss), 33);
  assert.equal(burning(boss).stacks, 15);
});

test("Coração de Brasa: labareda de 1 por stack no alvo novo (N3)", () => {
  const dying = big({ x: 150, hp: 0 });
  applyDot(dying, "burning", 1, 0, true, { stacks: 6 });
  const next = big({ x: 200 });
  run(["ember_heart"], [dying, next], { ember_heart: 2 });
  updateEnemies(16);
  assert.equal(lost(next), 0);
  const dying2 = big({ x: 150, hp: 0 });
  applyDot(dying2, "burning", 1, 0, true, { stacks: 6 });
  const next2 = big({ x: 200 });
  run(["ember_heart"], [dying2, next2], { ember_heart: 3 });
  const spread = [];
  on("spread", (e) => spread.push(e));
  updateEnemies(16);
  assert.equal(lost(next2), 6);
  assert.equal(spread.length, 1);
});

// ─── Pedra de Eco ───
test("Pedra de Eco: repete o último item ativado com 65% (+10% por nível)", () => {
  const target = big();
  run(["rusted_sword", "echo_stone"], [target]);
  activateItem(item("rusted_sword"));
  assert.equal(lost(target), 10);
  assert.equal(state.player.lastActivated, "rusted_sword");
  const swordTimer = state.itemTimers.rusted_sword.elapsed;
  assert.equal(activateItem(item("echo_stone")), true);
  assert.equal(lost(target), 10 + 7);
  assert.equal(state.player.lastActivated, "rusted_sword", "o eco não vira o último item");
  assert.equal(state.itemTimers.rusted_sword.elapsed, swordTimer, "não mexe na recarga");
  assert.equal(state.runStats.itemUses.rusted_sword, 1, "nem nas estatísticas");
});

test("Pedra de Eco: 2 repetições a 85% no N3 e 2 a 100% no N5", () => {
  const target = big();
  run(["rusted_sword", "echo_stone"], [target], { echo_stone: 3 });
  activateItem(item("rusted_sword"));
  activateItem(item("echo_stone"));
  assert.equal(lost(target), 10 + 9 + 9, "2 × 85% de 10 = 8,5 -> 9");

  const t2 = big();
  run(["rusted_sword", "echo_stone"], [t2], { echo_stone: 5 });
  activateItem(item("rusted_sword"));
  activateItem(item("echo_stone"));
  assert.equal(lost(t2), 10 * 3);
});

test("Pedra de Eco: repete relíquias (cura a 65%) mas não armaduras; sem nada para repetir não gasta", () => {
  run(["health_crystal", "iron_shield", "echo_stone"], [big()]);
  const echo = item("echo_stone");
  assert.equal(activateItem(echo), false, "nada ativado ainda");
  assert.equal(state.itemTimers.echo_stone.elapsed, state.itemTimers.echo_stone.cooldown);
  state.player.hp = 50;
  activateItem(item("health_crystal"));
  assert.equal(state.player.hp, 60);
  activateItem(echo);
  assert.equal(state.player.hp, 67, "65% de 10 = 6,5 -> 7");
  activateItem(item("iron_shield"));
  assert.equal(state.player.lastActivated, "health_crystal", "armadura não conta");
});

test("Pedra de Eco dispara sozinha quando a recarga acaba (6 s)", () => {
  const target = big();
  run(["rusted_sword", "echo_stone"], [target]);
  assert.equal(item("echo_stone").cooldown, 6000);
  activateItem(item("rusted_sword"));
  state.itemTimers.echo_stone.elapsed = 5999;
  state.itemTimers.rusted_sword.elapsed = 0;
  updateItemTimers(2);
  assert.equal(lost(target), 10 + 7);
});

// ─── Marcos das formas evoluídas ───
function evolved(id, level, enemies = [big()]) {
  const base = ITEMS.find((i) => i.id === id).evolvedFrom;
  run([id], enemies);
  state.itemLevels[id] = level;
  applyPassives();
  ensureTimers();
  return base;
}

test("Lâmina do Veterano: +3 de dano por nível; golpe duplo no 5, crítico no 10, execução no 15", () => {
  const blade = item("veterans_blade");
  const t5 = big();
  evolved("veterans_blade", 5, [t5]);
  activateItem(blade);
  assert.equal(lost(t5), 2 * 22, "2 golpes de 10 + 12");
  near(state.player.critChance, 0);

  const t10 = big();
  evolved("veterans_blade", 10, [t10]);
  near(state.player.critChance, 0.1);
  activateItem(blade);
  assert.equal(lost(t10), 2 * 37);

  // Execução (15): inimigo comum com 20% de vida ou menos morre; chefe não
  const weak = enemy({ hp: 190, maxHp: 1000 });
  evolved("veterans_blade", 15, [weak]);
  activateItem(blade); // 50 de dano no 1º golpe: 190 -> 140 (14%), o 2º executa
  assert.ok(weak.hp <= 0);
  updateEnemies(16);
  assert.equal(weak.dead, true);

  const boss = enemy({ hp: 190, maxHp: 1000, isBoss: true });
  evolved("veterans_blade", 15, [boss]);
  activateItem(blade);
  assert.ok(boss.hp > 0, "chefes são poupados");
  const healthy = enemy({ hp: 900, maxHp: 1000 });
  evolved("veterans_blade", 15, [healthy]);
  activateItem(blade);
  assert.ok(healthy.hp > 0);
});

test("Lâmina do Veterano depois do 15: a cada 5 níveis, +1 golpe (20, 30...) ou +10% de crítico (25, 35...)", () => {
  const blade = item("veterans_blade");
  const table = [
    // nível, golpes, crítico
    [5, 2, 0],
    [10, 2, 0.1],
    [15, 2, 0.1],
    [19, 2, 0.1],
    [20, 3, 0.1],
    [24, 3, 0.1],
    [25, 3, 0.2],
    [30, 4, 0.2],
    [35, 4, 0.3],
    [40, 5, 0.3],
  ];
  for (const [level, strikes, crit] of table) {
    const target = big();
    evolved("veterans_blade", level, [target]);
    near(state.player.critChance, crit, `crítico N${level}`);
    let hits = 0;
    on("hit", () => hits++);
    activateItem(blade);
    assert.equal(hits, strikes, `golpes N${level}`);
  }
  // effectCount: contagem das repetições
  const rep = blade.effects.find((e) => e.type === "strikes" && e.every);
  for (const [level, count] of [[19, 0], [20, 1], [29, 1], [30, 2], [40, 3]]) {
    state.itemLevels.veterans_blade = level;
    assert.equal(effectCount(blade, rep), count, `repetições no nível ${level}`);
  }
});

test("Couraça de Batalha: +8 de armadura por nível; regeneração no 5, dano contínuo -50% no 10, imune no 15", () => {
  evolved("battle_cuirass", 5);
  assert.equal(state.player.armor, 16 + 8 * 4);
  assert.equal(state.player.regen, 1);
  state.player.hp = 50;
  updateRegen(999);
  assert.equal(state.player.hp, 50);
  updateRegen(1);
  assert.equal(state.player.hp, 51, "1 HP por segundo");
  assert.equal(state.player.dotReduction, 0);
  assert.equal(state.player.damageReduction, 0);

  evolved("battle_cuirass", 10);
  assert.equal(state.player.dotReduction, 0.5);
  applyDot(state.player, "burning", 10, 0, true, { stacks: 1 });
  state.player.hp = 50;
  processDots(1000);
  assert.equal(state.player.hp, 45, "10 de dano contínuo cai pela metade");

  evolved("battle_cuirass", 15);
  assert.equal(state.player.damageReduction, 0.15);
  const atk = enemy({ dmg: 100 });
  const hp0 = state.player.hp;
  enemyAttack(atk);
  const armor = 16 + 8 * 14;
  assert.equal(hp0 - state.player.hp, Math.round(100 * (1 - armor / (armor + 100)) * 0.85), "-15% além da armadura");
});

test("Couraça de Batalha depois do 15: regeneração +1 (20, 30...) ou +25 de armadura (25, 35...)", () => {
  const table = [
    // nível, regen, armadura extra
    [15, 1, 0],
    [20, 2, 0],
    [25, 2, 25],
    [30, 3, 25],
    [35, 3, 50],
  ];
  for (const [level, regen, extra] of table) {
    evolved("battle_cuirass", level);
    assert.equal(state.player.regen, regen, `regen N${level}`);
    assert.equal(state.player.armor, 16 + 8 * (level - 1) + extra, `armadura N${level}`);
  }
});

// ─── Evolução ───
test("Espada Enferrujada vira Lâmina do Veterano no nível 5, no mesmo lugar, com nível e recarga", () => {
  run(["leather_vest", "rusted_sword", "chainmail"], [big()]);
  const events = [];
  on("evolved", (e) => events.push(e));
  const sword = item("rusted_sword");
  state.itemTimers.rusted_sword.elapsed = 777;
  for (let i = 0; i < 3; i++) assert.equal(addItemOrLevel(sword).evolvedTo, undefined);
  assert.equal(state.itemLevels.rusted_sword, 4);
  const result = addItemOrLevel(sword);
  assert.deepEqual(result, { leveled: true, level: 5, evolvedTo: "veterans_blade" });
  assert.deepEqual(state.items.map((i) => i.id), ["leather_vest", "veterans_blade", "chainmail"]);
  assert.equal(state.itemLevels.veterans_blade, 5);
  assert.equal("rusted_sword" in state.itemLevels, false);
  assert.equal(state.itemTimers.veterans_blade.elapsed, 777);
  assert.equal("rusted_sword" in state.itemTimers, false);
  assert.deepEqual(events, [{ from: "rusted_sword", to: "veterans_blade" }]);
  assert.equal(item("veterans_blade").name, "Lâmina do Veterano");
  assert.equal(item("veterans_blade").rarity, "uncommon");
});

test("Colete de Couro vira Couraça de Batalha no nível 5 e o armor muda na hora", () => {
  run(["leather_vest"], [big()]);
  const vest = item("leather_vest");
  for (let i = 0; i < 4; i++) addItemOrLevel(vest);
  assert.deepEqual(state.items.map((i) => i.id), ["battle_cuirass"]);
  assert.equal(state.player.armor, 16 + 8 * 4);
  assert.equal(state.player.regen, 1);
});

test("a forma evoluída continua no sorteio como 'subir de nível' e o item base some", () => {
  run(["rusted_sword"], [big()]);
  assert.ok(!generateRandomItems(40).some((i) => i.id === "veterans_blade"), "só aparece depois de evoluir");
  for (let i = 0; i < 4; i++) addItemOrLevel(item("rusted_sword"));
  const all = generateRandomItems(40);
  assert.ok(all.some((i) => i.id === "veterans_blade"));
  assert.ok(!all.some((i) => i.id === "rusted_sword"));
  // sem teto: nível 30 ainda aparece
  state.itemLevels.veterans_blade = 30;
  assert.ok(generateRandomItems(40).some((i) => i.id === "veterans_blade"));
  assert.equal(maxLevelOf(item("veterans_blade")), Infinity);
});

test("a forma evoluída sobe por recompensa sem limite", () => {
  run(["rusted_sword"], [big()]);
  for (let i = 0; i < 4; i++) addItemOrLevel(item("rusted_sword"));
  for (let i = 0; i < 10; i++) addItemOrLevel(item("veterans_blade"));
  assert.equal(state.itemLevels.veterans_blade, 15);
  assert.equal(state.items.length, 1);
});

test("abates para o próximo nível: 20 e ×1,5 a cada nível (20, 30, 45, 68...)", () => {
  assert.deepEqual([5, 6, 7, 8, 9, 10].map((l) => killsForNextLevel(l)), [20, 30, 45, 68, 101, 152]);
});

test("a forma evoluída sobe de nível por abates e mostra o progresso", () => {
  run(["rusted_sword"], [big()]);
  for (let i = 0; i < 4; i++) addItemOrLevel(item("rusted_sword"));
  const blade = item("veterans_blade");
  assert.deepEqual(evolutionProgress(blade), { kills: 0, need: 20 });
  const levels = [];
  on("itemLeveled", (e) => levels.push(e));
  state.enemies = Array.from({ length: 19 }, () => enemy({ hp: 0 }));
  updateEnemies(16);
  assert.deepEqual(evolutionProgress(blade), { kills: 19, need: 20 });
  assert.equal(state.itemLevels.veterans_blade, 5);
  state.enemies = [enemy({ hp: 0 })];
  updateEnemies(16);
  assert.equal(state.itemLevels.veterans_blade, 6);
  assert.deepEqual(evolutionProgress(blade), { kills: 0, need: 30 });
  assert.deepEqual(levels, [{ id: "veterans_blade", level: 6 }]);
  // 30 abates -> nível 7
  for (let i = 0; i < 30; i++) addEvolutionKill();
  assert.equal(state.itemLevels.veterans_blade, 7);
  assert.equal(evolutionProgress(blade).need, 45);
  // item que não evoluiu não tem progresso
  assert.equal(evolutionProgress(item("rusted_sword")), null);
});

test("subir por recompensa zera o progresso de abates (meta nova)", () => {
  run(["rusted_sword"], [big()]);
  for (let i = 0; i < 4; i++) addItemOrLevel(item("rusted_sword"));
  for (let i = 0; i < 10; i++) addEvolutionKill();
  assert.equal(state.evolveKills.veterans_blade, 10);
  addItemOrLevel(item("veterans_blade"));
  assert.equal(state.evolveKills.veterans_blade, 0);
});

test("a raridade sobe nos marcos: incomum, raro no 10, épico no 15, lendário no 20", () => {
  run(["rusted_sword"], [big()]);
  for (let i = 0; i < 4; i++) addItemOrLevel(item("rusted_sword"));
  const blade = item("veterans_blade");
  const rarityAt = (level) => {
    state.itemLevels.veterans_blade = level;
    return blade.rarity;
  };
  assert.deepEqual(
    [5, 9, 10, 14, 15, 19, 20, 50].map(rarityAt),
    ["uncommon", "uncommon", "rare", "rare", "epic", "epic", "legendary", "legendary"],
  );
  assert.equal(RARITIES[rarityAt(20)].color, RARITIES.legendary.color);
});

test("a chance de aparecer na recompensa usa a raridade atual", () => {
  run(["rusted_sword"], [big()]);
  for (let i = 0; i < 4; i++) addItemOrLevel(item("rusted_sword"));
  // Sorteio: 1º random escolhe a raridade (comum 40, incomum 30, raro 18, épico 9, lendário 3),
  // o 2º o item da raridade (índice 0 = o primeiro do catálogo nela, a Lâmina)
  const draw = (roll) => {
    const seq = [roll, 0];
    let i = 0;
    setRandom(() => seq[i++ % 2]);
    return generateRandomItems(1).map((x) => x.id);
  };
  const cases = [
    [5, 0.5, 0.8], // [nível, roll na faixa dela, roll de outra faixa]
    [10, 0.8, 0.5],
    [15, 0.92, 0.5],
    [20, 0.99, 0.5],
  ];
  for (const [level, own, other] of cases) {
    state.itemLevels.veterans_blade = level;
    assert.deepEqual(draw(own), ["veterans_blade"], `N${level} na faixa ${state.itemLevels.veterans_blade}`);
    assert.notDeepEqual(draw(other), ["veterans_blade"], `N${level} fora da faixa`);
  }
  setRandom(null);
});

test("a evolução é genérica: um par novo só com dados evolui e sobe por abates", () => {
  const base = {
    id: "fake_horseshoe",
    type: "relic",
    icon: "🧲",
    rarity: "common",
    cooldown: 0,
    passive: true,
    evolution: { into: "fake_clover", level: 5 },
    effects: [],
  };
  const form = {
    id: "fake_clover",
    evolvedFrom: "fake_horseshoe",
    art: "fake_horseshoe",
    type: "relic",
    icon: "🍀",
    rarity: "uncommon",
    cooldown: 0,
    passive: true,
    effects: [],
  };
  setItems([...ITEMS, base, form]);
  try {
    resetRun();
    state.items = [base];
    state.itemLevels = {};
    for (let i = 0; i < 4; i++) addItemOrLevel(base);
    assert.equal(state.items[0].id, "fake_clover");
    assert.equal(state.items[0].rarity, "uncommon");
    for (let i = 0; i < 20; i++) addEvolutionKill();
    assert.equal(state.itemLevels.fake_clover, 6);
    state.itemLevels.fake_clover = 10;
    assert.equal(form.rarity, "rare");
  } finally {
    setItems(ITEMS);
  }
});

test("save: forma evoluída, nível e abates sobrevivem; save antigo com o item base no 5 evolui", () => {
  const storage = memoryStorage();
  save.setStorage(storage);
  run(["rusted_sword"], [big()]);
  for (let i = 0; i < 4; i++) addItemOrLevel(item("rusted_sword"));
  for (let i = 0; i < 7; i++) addEvolutionKill();
  save.saveRun();
  const data = JSON.parse(storage.data[save.RUN_KEY]);
  assert.deepEqual(data.items, ["veterans_blade"]);
  assert.equal(data.itemLevels.veterans_blade, 5);
  assert.equal(data.evolveKills.veterans_blade, 7);

  setupRun([]);
  assert.equal(save.loadRun(), true);
  assert.deepEqual(state.items.map((i) => i.id), ["veterans_blade"]);
  assert.equal(state.itemLevels.veterans_blade, 5);
  assert.equal(state.evolveKills.veterans_blade, 7);
  assert.equal(item("veterans_blade").rarity, "uncommon");

  // Save de antes da 11b: espada no nível 5 (o teto de então)
  storage.data[save.RUN_KEY] = JSON.stringify({
    version: 2,
    wave: 4,
    items: ["rusted_sword", "leather_vest"],
    itemLevels: { rusted_sword: 5, leather_vest: 5 },
    itemTimers: { rusted_sword: { elapsed: 5, cooldown: 2200 } },
    player: { hp: 50, maxHp: 100 },
  });
  setupRun([]);
  assert.equal(save.loadRun(), true);
  assert.deepEqual(state.items.map((i) => i.id), ["veterans_blade", "battle_cuirass"]);
  assert.equal(state.itemLevels.battle_cuirass, 5);
  assert.equal(state.itemTimers.veterans_blade.elapsed, 5);
  assert.equal(state.player.armor, 16 + 8 * 4);
  save.setStorage(null);
});

test("save: Pedra de Mana vira Pedra de Eco e os campos de mana e barreira são ignorados", () => {
  const storage = memoryStorage();
  save.setStorage(storage);
  storage.data[save.RUN_KEY] = JSON.stringify({
    version: 2,
    wave: 6,
    items: ["mana_stone", "dragonscale", "ancient_tome"],
    itemLevels: { mana_stone: 3, dragonscale: 2 },
    itemTimers: { mana_stone: { elapsed: 10, cooldown: 4000 } },
    player: { hp: 70, maxHp: 100, mana: 55, maxMana: 140, barrier: 20, barrierSource: "dragonscale" },
  });
  setupRun([]);
  assert.equal(save.loadRun(), true);
  assert.deepEqual(state.items.map((i) => i.id), ["echo_stone", "dragonscale"]);
  assert.equal(state.itemLevels.echo_stone, 3);
  assert.ok(state.itemTimers.echo_stone);
  assert.equal(state.player.hp, 70);
  assert.equal("mana" in state.player, false);
  assert.equal("barrier" in state.player, false);
  const saved = save.serializeRun();
  assert.equal("mana" in saved.player, false);
  assert.equal("maxMana" in saved.player, false);
  assert.equal("barrier" in saved.player, false);
  save.setStorage(null);
});

test("a vida máxima ganha pela Foice vai no save", () => {
  const storage = memoryStorage();
  save.setStorage(storage);
  run(["blood_scythe"], [big()]);
  state.player.maxHpBonus = 12;
  applyPassives();
  assert.equal(state.player.maxHp, 112);
  save.saveRun();
  setupRun([]);
  save.loadRun();
  assert.equal(state.player.maxHpBonus, 12);
  save.setStorage(null);
});

// ─── Mana e barreira saíram do jogo ───
test("mana e barreira não existem mais: estado, efeitos, interface e textos", () => {
  setupRun([]);
  for (const key of ["mana", "maxMana", "magicBoost", "manaOverflow", "barrier", "barrierSource", "nextBlockActive"]) {
    assert.equal(key in state.player, false, key);
  }
  const triggers = Object.keys(KNOWN_EFFECTS);
  assert.ok(!triggers.some((t) => /barrier/i.test(t)));
  const types = ITEMS.flatMap((i) => (i.effects || []).map((e) => e.type));
  assert.ok(!types.some((t) => /mana|barrier|overflow/i.test(t)), "tipos de efeito");
  assert.ok(!Object.values(KNOWN_EFFECTS).flat().some((t) => /mana|barrier|overflow/i.test(t)));
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const html = read("../game/index.html");
  assert.ok(!/mana-bar|mana-val|>MP</.test(html), "sem a barra de MP");
  assert.ok(!/mana-bar|--mana/.test(read("../game/style.css")));
  for (const file of ["en.js", "pt-BR.js", "items.en.js", "items.pt-BR.js"]) {
    const text = read(`../game/locales/${file}`);
    assert.ok(!/barrier|barreira|\bmana\b/i.test(text), file);
  }
  for (const src of ["combat.js", "items.js", "state.js", "save.js", "ui.js", "main.js"]) {
    assert.ok(!/maxMana|magicBoost|manaOverflow|barrierSource|barrierBreak|barrierAbsorb/.test(read(`../game/src/${src}`)), src);
  }
});

test("o catálogo tem 45 itens: os 29 de antes (com a Pedra de Eco), 3 formas evoluídas e as novidades da 11c", () => {
  // 29 + Lâmina e Couraça + 11 novos + Trevo de Ouro + 2 míticos
  assert.equal(ITEMS.length, 45);
  assert.equal(ITEMS.filter((i) => i.evolvedFrom).length, 3);
  assert.equal(ITEMS.filter((i) => i.evolution).length, 3);
  assert.ok(!ITEMS.some((i) => i.id === "mana_stone"));
  assert.ok(ITEMS.some((i) => i.id === "echo_stone"));
});

// ─── Revisão da 11b ───
// Passa o tempo do jogo em passos de 100 ms, como o loop principal
function simulate(ms) {
  for (let t = 0; t < ms; t += 100) {
    updateItemTimers(100);
    processDots(100);
    updateEnemies(100);
  }
}

test("laço: o Arco Gélido sozinho congela o alvo (golpes a cada 2,8 s, antes da espera de 3 s)", () => {
  const target = enemy({ hp: 1e6, maxHp: 1e6, x: 150, atkInterval: 1e9 });
  run(["frost_bow"], [target]);
  state.player.hp = state.player.maxHp = 1e6;
  let froze = false;
  on("freeze", () => (froze = true));
  simulate(20000);
  assert.ok(froze, "5 golpes seguidos chegam ao congelamento");
});

test("laço: a Armadura Cristalina sozinha congela o inimigo colado (pulso de 2 s)", () => {
  const target = enemy({ hp: 1e6, maxHp: 1e6, x: 150, atkInterval: 1e9 });
  run(["crystal_armor"], [target]);
  let froze = false;
  on("freeze", () => (froze = true));
  simulate(14000);
  assert.ok(froze);
});

test("ritmo fixo: aura e Pele em brasa não aceleram com Pressa, Botas, Orbe nem Sprint", () => {
  assert.equal(item("crystal_armor").fixedRate, true);
  assert.equal(item("dragonscale").fixedRate, true);
  run(["crystal_armor", "dragonscale", "water_orb", "speed_boots", "health_crystal"], [big({ x: 150 })], {
    speed_boots: 5,
    dragonscale: 5,
  });
  state.player.cooldownBonus = 0.5;
  ensureTimers();
  assert.equal(effectiveCooldown(item("crystal_armor")), 2000);
  assert.equal(effectiveCooldown(item("dragonscale")), 1000);
  assert.equal(effectiveCooldown(item("health_crystal")), 2500, "item de recarga de verdade acelera");
  state.itemTimers.crystal_armor.elapsed = 0;
  state.itemTimers.dragonscale.elapsed = 0;
  state.player.counters.sprint = 4;
  activateItem(item("water_orb"));
  assert.equal(state.itemTimers.crystal_armor.elapsed, 0, "Orbe e Sprint ignoram a aura");
  assert.equal(state.itemTimers.dragonscale.elapsed, 0);
});

test("Eco não encurta um Frenesi ativo", () => {
  run(["berserker_totem", "echo_stone"], [big()]);
  activateItem(item("berserker_totem"));
  const full = state.player.berserkRemaining;
  activateItem(item("echo_stone"));
  assert.equal(state.player.berserkRemaining, full);
});

test("ataque extra mantém o ×2 contra chefe do Tomo (N5), mas não os bônus de uso único", () => {
  const boss = big({ isBoss: true });
  run(["judgment_tome", "echo_stone"], [boss], { judgment_tome: 5 });
  activateItem(item("judgment_tome"));
  assert.equal(lost(boss), 48);
  activateItem(item("echo_stone")); // 65% de 24 ×2
  assert.equal(lost(boss), 48 + 37, "65% de 24 ×2, e o chefe já está julgado (+15%)");
  // Tempestade (uso único) não entra no extra
  const t = big();
  run(["thunder_staff", "echo_stone"], [t], { thunder_staff: 3 });
  state.player.counters.storm = 3;
  activateItem(item("thunder_staff")); // 4º uso: +50%
  assert.equal(lost(t), 59);
  activateItem(item("echo_stone"));
  assert.equal(lost(t), 59 + 25, "65% de 39, sem a Tempestade");
  assert.equal(state.player.counters.storm, 4, "o eco não conta como uso");
});

test("Eco não conta cargas do Cristal Vital nem golpes do raio da Maça", () => {
  run(["health_crystal", "echo_stone"], [big()]);
  activateItem(item("health_crystal"));
  assert.equal(state.player.charges.health_crystal, 1);
  activateItem(item("echo_stone"));
  assert.equal(state.player.charges.health_crystal, 1);

  run(["holy_mace", "echo_stone"], [big()], { holy_mace: 5 });
  activateItem(item("holy_mace"));
  state.player.counters.ray_holy_mace = 3;
  activateItem(item("echo_stone"));
  assert.equal(state.player.counters.ray_holy_mace, 3, "extra não conta para o raio");
});

test("evoluir leva as estatísticas e o último item ativado para o id novo", () => {
  run(["rusted_sword"], [big()]);
  state.runStats.damageByItem.rusted_sword = 120;
  state.runStats.itemUses.rusted_sword = 7;
  state.player.lastActivated = "rusted_sword";
  for (let i = 0; i < 4; i++) addItemOrLevel(item("rusted_sword"));
  assert.equal(state.runStats.damageByItem.veterans_blade, 120);
  assert.equal(state.runStats.itemUses.veterans_blade, 7);
  assert.equal("rusted_sword" in state.runStats.damageByItem, false);
  assert.equal(state.player.lastActivated, "veterans_blade");
});

test("Manto do Arcano N3: +1 stack em toda fonte (Escama, Eco do Núcleo, Fênix, Estilhaços, Coração)", () => {
  // Escama: 1 stack + 1 do Manto
  const atk = big({ x: 150, dmg: 5 });
  run(["dragonscale", "mage_robe"], [atk], { mage_robe: 3 });
  enemyAttack(atk);
  assert.equal(burning(atk).stacks, 2);
  // Núcleo Explosivo N3: 9 + 1
  const b = big({ x: 150 });
  run(["blast_core", "mage_robe"], [b], { blast_core: 3, mage_robe: 3 });
  activateItem(item("blast_core"));
  assert.equal(burning(b).stacks, 10);
  // Fênix N5: 20 + 1
  const p = big({ x: 150 });
  run(["phoenix_feather", "mage_robe"], [p], { phoenix_feather: 5, mage_robe: 3 });
  state.player.hp = 1;
  enemyAttack(enemy({ dmg: 100 }));
  assert.equal(burning(p).stacks, 21);
  // Estilhaços: 2 + 1 de frio nos vizinhos
  const c = big({ x: 150 });
  const d = big({ x: 200 });
  run(["crystal_armor", "mage_robe"], [c, d], { crystal_armor: 5, mage_robe: 3 });
  applyCold(c, 4);
  applyCold(c, 1);
  assert.equal(coldStacks(d), 3);
  // Coração de Brasa: salto de 6 stacks vira 7
  const dying = big({ x: 150, hp: 0 });
  applyDot(dying, "burning", 1, 0, true, { stacks: 6 });
  const next = big({ x: 200 });
  run(["ember_heart", "mage_robe"], [dying, next], { mage_robe: 3 });
  updateEnemies(16);
  assert.equal(burning(next).stacks, 7);
});

test("Foice de Sangue: as almas contam todos os abates da run, mesmo antes de pegar a Foice", () => {
  run(["blood_scythe"], [big()]);
  state.kills = 40;
  const t = big();
  state.enemies = [t];
  activateItem(item("blood_scythe"));
  assert.equal(lost(t), 28);
});

test("Escama: não avisa que o atacante pegou fogo quando nenhum stack entra", () => {
  const atk = big({ x: 150, dmg: 5, immune: "fire", resist: { fire: 1 } });
  run(["dragonscale"], [atk]);
  const ev = captureEvents();
  enemyAttack(atk);
  assert.equal(ev.some((e) => e.type === "log" && /fogo/.test(e.payload.msg)), false);
});
