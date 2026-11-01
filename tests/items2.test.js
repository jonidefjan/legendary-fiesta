import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ITEMS, setupRun, item, enemy, fixedRandom, captureEvents, memoryStorage } from "./helpers.js";
import { state, resetRun } from "../game/src/state.js";
import { on } from "../game/src/events.js";
import {
  activateItem,
  applyDot,
  processDots,
  updateEnemies,
  enemyAttack,
  burnDecay,
} from "../game/src/combat.js";
import {
  rewardOptions,
  generateRandomItems,
  maxLevelOf,
  applyPassives,
  PITY_SCREENS,
} from "../game/src/items.js";
import { isBossWave } from "../game/src/boss.js";
import * as save from "../game/src/save.js";

const setLevel = (id, level) => {
  state.itemLevels[id] = level;
};
const burning = (en) => en.dots.find((d) => d.type === "burning");
const poison = (en) => en.dots.find((d) => d.type === "poison");

// Inimigo que já queima com `stacks` stacks (como se a Lâmina de Brasa o tivesse acertado)
function burningEnemy(stacks, overrides = {}) {
  const en = enemy(overrides);
  applyDot(en, "burning", 1, 0, true, { stacks });
  return en;
}

// ─── Queimadura ───
test("queimadura: a Lâmina de Brasa aplica 1 stack por nível do item por golpe", () => {
  for (let level = 1; level <= 5; level++) {
    const target = enemy();
    setupRun(["ember_blade"], [target]);
    setLevel("ember_blade", level);
    activateItem(item("ember_blade"));
    assert.equal(burning(target).stacks, level, `nível ${level}`);
    activateItem(item("ember_blade"));
    assert.equal(burning(target).stacks, 2 * level, "sem teto de stacks");
  }
});

test("queimadura: 1 de dano por stack por segundo e o bônus permanente vale no tick", () => {
  const target = enemy({ hp: 1000 });
  setupRun(["ember_blade"], [target]);
  setLevel("ember_blade", 5);
  activateItem(item("ember_blade"));
  assert.equal(burning(target).damage, 1, "o nível não aumenta o dano por stack");
  const hp = target.hp;
  processDots(1000);
  assert.equal(hp - target.hp, 5);

  const ringed = enemy({ hp: 1000 });
  setupRun(["ember_blade", "cursed_ring"], [ringed]);
  setLevel("ember_blade", 2);
  activateItem(item("ember_blade"));
  processDots(1000);
  assert.equal(1000 - ringed.hp, Math.round(2 * 1.5));
});

test("queimadura: perde max(1, ⌊stacks ÷ 10⌋) stacks por segundo e some em 0", () => {
  assert.equal(burnDecay(5), 1);
  assert.equal(burnDecay(9), 1);
  assert.equal(burnDecay(10), 1);
  assert.equal(burnDecay(30), 3);
  assert.equal(burnDecay(100), 10);
  setupRun([]);
  const target = burningEnemy(30, { hp: 100000 });
  state.enemies = [target];
  processDots(1000);
  assert.equal(burning(target).stacks, 27, "30 → 3 por segundo");
  const small = burningEnemy(3, { hp: 100000 });
  state.enemies = [small];
  for (let i = 0; i < 2; i++) processDots(1000);
  assert.equal(burning(small).stacks, 1);
  processDots(1000);
  assert.equal(small.dots.length, 0, "sem duração: acaba quando os stacks acabam");
});

test("queimadura: não tem teto de stacks nem duração", () => {
  const target = enemy({ hp: 1e9 });
  setupRun([], [target]);
  applyDot(target, "burning", 1, 0, true, { stacks: 500 });
  applyDot(target, "burning", 1, 0, true, { stacks: 500 });
  assert.equal(burning(target).stacks, 1000);
});

test("queimadura do chefe no herói acumula e perde stacks como a dos inimigos", () => {
  setupRun([]);
  state.player.hp = 100;
  applyDot(state.player, "burning", 1, 0, true, { stacks: 6 });
  processDots(1000);
  assert.equal(state.player.hp, 94);
  assert.equal(state.player.dots[0].stacks, 5);
});

// ─── Veneno ───
test("veneno: dano base é 1 + 3 por nível e cada stack soma +1 ao tick", () => {
  const bases = { 1: 1, 2: 4, 3: 7, 4: 10, 5: 13 };
  for (const [level, base] of Object.entries(bases)) {
    const target = enemy();
    setupRun(["poison_blade"], [target]);
    setLevel("poison_blade", Number(level));
    activateItem(item("poison_blade"));
    assert.equal(poison(target).base, base, `nível ${level}`);
    assert.equal(poison(target).damage, 1);
  }
});

test("veneno nível 1 com 5 stacks causa 1 + 5 = 6 por tick", () => {
  const target = enemy({ hp: 1000 });
  setupRun(["poison_blade"], [target]);
  for (let i = 0; i < 5; i++) activateItem(item("poison_blade"));
  const hp = target.hp;
  processDots(1000);
  assert.equal(hp - target.hp, 6);
});

test("veneno não tem teto de stacks e o Anel multiplica o tick inteiro", () => {
  const target = enemy({ hp: 100000 });
  setupRun(["poison_blade", "cursed_ring"], [target]);
  for (let i = 0; i < 12; i++) activateItem(item("poison_blade"));
  assert.equal(poison(target).stacks, 12);
  const hp = target.hp;
  processDots(1000);
  assert.equal(hp - target.hp, Math.round((1 + 12) * 1.3));
});

// ─── Contágio (Coração de Brasa) ───
function spreadSetup(level, count = 4) {
  const dead = burningEnemy(3, { hp: 0, x: 200 });
  const others = [];
  for (let i = 0; i < count; i++) others.push(enemy({ x: 230 + i * 40 }));
  setupRun(["ember_heart"], [dead, ...others]);
  setLevel("ember_heart", level);
  return { dead, others };
}

test("contágio: passa TODOS os stacks para os N vivos mais próximos, N = nível", () => {
  for (let level = 1; level <= 5; level++) {
    const { others } = spreadSetup(level, 6);
    updateEnemies(16);
    const burn = others.filter((e) => burning(e));
    assert.equal(burn.length, level, `nível ${level}`);
    assert.deepEqual(burn, others.slice(0, level), "os mais próximos");
    assert.equal(burning(burn[0]).stacks, 3);
    assert.equal(burning(burn[0]).damage, 1);
  }
});

test("contágio: os stacks do morto somam aos que o alvo já tem", () => {
  const { others } = spreadSetup(2);
  applyDot(others[0], "burning", 1, 0, true, { stacks: 5 });
  applyDot(others[1], "burning", 1, 0, true, { stacks: 1 });
  updateEnemies(16);
  assert.equal(burning(others[0]).stacks, 8);
  assert.equal(burning(others[1]).stacks, 4);
});

test("contágio: ignora mortos e vida 0, avisa com log e evento spread", () => {
  const { dead, others } = spreadSetup(2, 3);
  others[0].dead = true;
  others[1].hp = 0;
  const events = captureEvents();
  const spreads = [];
  on("spread", (e) => spreads.push(e));
  updateEnemies(16);
  assert.ok(!burning(others[0]) && !burning(others[1]));
  assert.ok(burning(others[2]));
  assert.deepEqual(spreads, [{ from: { x: dead.x, y: dead.y }, to: [{ x: others[2].x, y: others[2].y }] }]);
  assert.ok(events.some((e) => e.type === "log" && /Coração de Brasa/.test(e.payload.msg)));
  assert.ok(events.some((e) => e.type === "sfx" && e.payload.name === "spread"));
  assert.ok(state.effects.some((e) => e.type === "text" && e.text === "🔥"), "efeito visível");
});

test("contágio: não acontece sem o item, sem queimadura nem para o veneno", () => {
  const dead = burningEnemy(3, { hp: 0 });
  const a = enemy({ x: 230 });
  setupRun([], [dead, a]);
  updateEnemies(16);
  assert.ok(!burning(a), "sem o item");

  const noBurn = enemy({ hp: 0 });
  const b = enemy({ x: 230 });
  setupRun(["ember_heart"], [noBurn, b]);
  const spreads = [];
  on("spread", (e) => spreads.push(e));
  updateEnemies(16);
  assert.equal(spreads.length, 0);

  const poisoned = enemy({ hp: 0 });
  applyDot(poisoned, "poison", 1, 4, true, { maxStacks: Infinity, base: 1 });
  const c = enemy({ x: 230 });
  setupRun(["ember_heart"], [poisoned, c]);
  updateEnemies(16);
  assert.ok(!c.dots.length, "veneno não passa");
});

test("contágio: dispara quando o morto cai por dano contínuo", () => {
  const dying = burningEnemy(2, { hp: 2, x: 200 });
  const a = enemy({ x: 260 });
  setupRun(["ember_heart"], [dying, a]);
  processDots(1000);
  assert.ok(dying.hp <= 0);
  updateEnemies(16);
  assert.ok(dying.dead);
  assert.ok(burning(a));
});

test("contágio: o tick que mata não faz perder stacks: passam todos", () => {
  const dying = burningEnemy(20, { hp: 5, x: 200 });
  const a = enemy({ x: 260 });
  setupRun(["ember_heart"], [dying, a]);
  processDots(1000);
  assert.ok(dying.hp <= 0);
  assert.equal(burning(dying).stacks, 20, "o morto não decai");
  updateEnemies(16);
  assert.ok(dying.dead);
  assert.equal(burning(a).stacks, 20, "a queimadura passou inteira");
});

test("contágio: vale para qualquer golpe que mata, não só o dano contínuo", () => {
  const dying = burningEnemy(7, { hp: 5, x: 150 });
  const a = enemy({ x: 260 });
  setupRun(["rusted_sword", "ember_heart"], [dying, a]);
  activateItem(item("rusted_sword"));
  updateEnemies(16);
  assert.ok(dying.dead);
  assert.equal(burning(a).stacks, 7);
});

test("Núcleo Explosivo: sem inimigo no alcance não explode nem gasta a recarga", () => {
  const far = enemy({ x: 500 });
  setupRun(["blast_core"], [far]);
  const booms = [];
  on("explode", (e) => booms.push(e));
  const events = captureEvents();
  assert.equal(activateItem(item("blast_core")), false);
  assert.equal(booms.length, 0);
  assert.equal(far.hp, 1000);
  const timer = state.itemTimers.blast_core;
  assert.equal(timer.elapsed, timer.cooldown, "recarga continua pronta");
  assert.ok(!events.some((e) => e.type === "log"));
  far.x = 200;
  assert.equal(activateItem(item("blast_core")), true);
  assert.equal(booms.length, 1);
});

test("contágio: dispara quando o morto cai por explosão", () => {
  const dying = burningEnemy(2, { hp: 5, x: 200 });
  const a = enemy({ x: 400, hp: 1000 });
  setupRun(["ember_heart", "blast_core"], [dying, a]);
  setLevel("ember_heart", 1);
  activateItem(item("blast_core"));
  updateEnemies(16);
  assert.ok(dying.dead);
  assert.ok(burning(a));
  assert.equal(burning(a).stacks, 2);
});

test("contágio: dispara quando o morto cai por reflexo (Parry)", () => {
  const dying = burningEnemy(2, { hp: 5, x: 150 });
  const a = enemy({ x: 400 });
  setupRun(["ember_heart", "iron_shield"], [dying, a]);
  setLevel("iron_shield", 3); // Aparo
  state.player.blocksLeft = 1;
  enemyAttack(dying);
  assert.ok(dying.hp <= 0);
  updateEnemies(16);
  assert.ok(dying.dead);
  assert.ok(burning(a));
});

test("contágio: dispara quando o morto cai por espinhos", () => {
  const attacker = burningEnemy(2, { hp: 3, x: 150 });
  const a = enemy({ x: 400 });
  setupRun(["ember_heart", "thorn_mail"], [attacker, a]);
  enemyAttack(enemy({ x: 180 }));
  assert.ok(attacker.hp <= 0);
  updateEnemies(16);
  assert.ok(attacker.dead);
  assert.ok(burning(a));
});

test("contágio: a cadeia continua quando um alvo morre queimando", () => {
  const first = burningEnemy(2, { hp: 0, x: 200 });
  const second = enemy({ hp: 1, x: 230 });
  const third = enemy({ x: 260 });
  setupRun(["ember_heart"], [first, second, third]);
  setLevel("ember_heart", 1);
  updateEnemies(16);
  assert.equal(burning(second).stacks, 2);
  assert.ok(!burning(third));
  processDots(1000);
  updateEnemies(16);
  assert.ok(second.dead);
  assert.equal(burning(third).stacks, 2, "a cadeia seguiu");
});

// ─── Itens de área ───
test("Martelo Sísmico: 40% do dano nos vivos dentro de 90 px do alvo", () => {
  const target = enemy({ x: 150 });
  const near = enemy({ x: 200 });
  const edge = enemy({ x: 240 }); // 90 de distância
  const far = enemy({ x: 241 });
  const dead = enemy({ x: 160, dead: true });
  const zero = enemy({ x: 160, hp: 0 });
  setupRun(["seismic_hammer"], [target, near, edge, far, dead, zero]);
  activateItem(item("seismic_hammer"));
  assert.equal(target.hp, 1000 - 14);
  assert.equal(near.hp, 1000 - Math.round(14 * 0.4));
  assert.equal(edge.hp, 1000 - Math.round(14 * 0.4));
  assert.equal(far.hp, 1000);
  assert.equal(dead.hp, 1000, "morto não recebe");
  assert.equal(zero.hp, 0);
});

test("Martelo Sísmico: respingo não causa crítico nem efeitos de golpe, mas o abate conta", () => {
  const target = enemy({ x: 150 });
  const weak = enemy({ x: 200, hp: 3 });
  const spare = enemy({ x: 230 });
  setupRun(["seismic_hammer", "blood_scythe", "vampiric_amulet"], [target, weak, spare]);
  setLevel("blood_scythe", 3); // a Colheita (contador de abates) liberou no nível 3
  state.player.critChance = 1;
  state.player.hp = 50; // 50% da vida: o Amuleto rouba 8% (não os 15% de vida baixa)
  const events = captureEvents();
  activateItem(item("seismic_hammer"));
  assert.equal(weak.hp, 3 - 6, "6 = 40% de 14 arredondado (sem crítico)");
  assert.equal(weak.lastHitCrit, false);
  assert.equal(events.filter((e) => e.type === "sfx" && e.payload.name === "crit").length, 1, "só o alvo crita");
  // Roubo de vida só do golpe principal (21 com crítico × 8%); vizinhos não somam
  assert.equal(state.player.hp, 52);
  updateEnemies(16);
  assert.ok(weak.dead);
  assert.equal(state.player.counters.harvest, 1, "abate por respingo conta para a Colheita");
});

test("Núcleo Explosivo: dano fixo em todos num raio de 220 px, só vivos", () => {
  const inside = enemy({ x: 300 }); // 200 do herói (x=100)
  const edge = enemy({ x: 320 }); // 220
  const outside = enemy({ x: 321 });
  const dead = enemy({ x: 200, dead: true });
  setupRun(["blast_core"], [inside, edge, outside, dead]);
  const booms = [];
  on("explode", (e) => booms.push(e));
  activateItem(item("blast_core"));
  assert.equal(inside.hp, 990);
  assert.equal(edge.hp, 990);
  assert.equal(outside.hp, 1000);
  assert.equal(dead.hp, 1000);
  assert.equal(booms.length, 1);
  assert.equal(booms[0].kind, "fire");
  assert.equal(state.itemTimers.blast_core.elapsed, 0, "recarga reiniciada");
});

test("Núcleo Explosivo: +5 de dano por nível, recarga de 6 s; fogo no nível 3", () => {
  const target = enemy({ x: 200 });
  setupRun(["blast_core"], [target]);
  assert.equal(item("blast_core").cooldown, 6000);
  setLevel("blast_core", 2);
  activateItem(item("blast_core"));
  assert.equal(target.hp, 1000 - 15);
  assert.equal(burning(target), undefined, "sem fogo antes do nível 3");

  setLevel("blast_core", 3);
  activateItem(item("blast_core"));
  assert.equal(target.hp, 1000 - 15 - 20);
  assert.equal(burning(target).stacks, 9, "3 stacks por nível do item");
});

test("Tomo do Julgamento: 9 de dano em todos os vivos, sem crítico nos outros", () => {
  const first = enemy({ x: 150 });
  const far = enemy({ x: 900 });
  const dead = enemy({ x: 300, dead: true });
  setupRun(["judgment_tome"], [first, far, dead]);
  state.player.critChance = 1;
  activateItem(item("judgment_tome"));
  assert.equal(far.hp, 1000 - 9);
  assert.equal(far.lastHitCrit, false);
  assert.equal(dead.hp, 1000);
  assert.ok(first.hp < 1000);
  assert.equal(item("judgment_tome").cooldown, 5000);
});

test("Cota de Espinhos: golpe que tira HP fere todos os vivos a 120 px do herói", () => {
  const attacker = enemy({ x: 170, dmg: 5 });
  const edge = enemy({ x: 220 }); // 120 do herói (x=100)
  const outside = enemy({ x: 221 });
  const dead = enemy({ x: 150, dead: true });
  setupRun(["thorn_mail"], [attacker, edge, outside, dead]);
  assert.equal(enemyAttack(attacker), "hit");
  assert.equal(attacker.hp, 994);
  assert.equal(edge.hp, 994);
  assert.equal(outside.hp, 1000);
  assert.equal(dead.hp, 1000);
});

test("Cota de Espinhos: +3 de dano por nível e não age em esquiva nem bloqueio antes do nível 5", () => {
  const a = enemy({ x: 170, dmg: 5 });
  setupRun(["thorn_mail"], [a]);
  setLevel("thorn_mail", 2);
  enemyAttack(a);
  assert.equal(a.hp, 1000 - 9);

  a.hp = 1000;
  state.player.evasion = 1;
  fixedRandom(0);
  assert.equal(enemyAttack(a), "dodged");
  assert.equal(a.hp, 1000, "esquiva");

  state.player.evasion = 0;
  state.player.blocksLeft = 1;
  assert.equal(enemyAttack(a), "blocked");
  assert.equal(a.hp, 1000, "bloqueio");
});

// ─── Lendário garantido ───
const isLegendary = (i) => i.rarity === "legendary";

beforeEach(() => {
  setupRun([]);
});

test("guaranteeLegendary: sempre traz um lendário e continua sem repetir", () => {
  for (let run = 0; run < 200; run++) {
    const picked = generateRandomItems(3, new Set(), { guaranteeLegendary: true });
    assert.equal(picked.length, 3);
    assert.ok(picked.some(isLegendary));
    assert.equal(new Set(picked.map((i) => i.id)).size, 3);
  }
});

test("a 5ª tela depois de 4 sem lendário garante um e zera o contador", () => {
  fixedRandom(0); // só comuns e depois os primeiros do catálogo: nenhum lendário
  for (let screen = 1; screen <= PITY_SCREENS; screen++) {
    const options = rewardOptions(3);
    assert.ok(!options.some(isLegendary), `tela ${screen}`);
    assert.equal(state.rewardsSinceLegendary, screen);
  }
  const fifth = rewardOptions(3);
  assert.ok(fifth.some(isLegendary), "5ª tela");
  assert.equal(state.rewardsSinceLegendary, 0);
});

test("lendário que aparece sozinho também zera o contador", () => {
  state.rewardsSinceLegendary = 2;
  fixedRandom(0.999); // raridade lendária
  const options = rewardOptions(3);
  assert.ok(options.some(isLegendary));
  assert.equal(state.rewardsSinceLegendary, 0);
});

test("recompensa de chefe garante lendário, mesmo com o contador em zero", () => {
  assert.equal(isBossWave(20), true);
  for (let run = 0; run < 100; run++) {
    state.rewardsSinceLegendary = 0;
    assert.ok(rewardOptions(3, { boss: true }).some(isLegendary));
    assert.equal(state.rewardsSinceLegendary, 0);
  }
});

test("sem lendário sorteável o sorteio segue normal e sem erro", () => {
  for (const it of ITEMS.filter(isLegendary)) {
    if (!state.items.includes(it)) state.items.push(it);
    state.itemLevels[it.id] = maxLevelOf(it);
  }
  applyPassives();
  state.rewardsSinceLegendary = PITY_SCREENS;
  const options = rewardOptions(3, { boss: true });
  assert.equal(options.length, 3);
  assert.ok(!options.some(isLegendary));
  assert.equal(state.rewardsSinceLegendary, PITY_SCREENS + 1);
});

test("tela sem opções não conta para o contador", () => {
  for (const it of ITEMS) {
    if (it.evolvedFrom) continue; // as formas evoluídas não têm nível máximo
    if (!state.items.includes(it)) state.items.push(it);
    state.itemLevels[it.id] = maxLevelOf(it);
  }
  state.rewardsSinceLegendary = 2;
  assert.deepEqual(rewardOptions(3), []);
  assert.equal(state.rewardsSinceLegendary, 2);
});

test("rewardsSinceLegendary começa em 0 na run nova e vai e volta no save", () => {
  const storage = memoryStorage();
  save.setStorage(storage);
  state.rewardsSinceLegendary = 3;
  save.saveRun();
  assert.equal(JSON.parse(storage.data[save.RUN_KEY]).rewardsSinceLegendary, 3);

  resetRun();
  assert.equal(state.rewardsSinceLegendary, 0, "run nova zera");
  assert.equal(save.loadRun(), true);
  assert.equal(state.rewardsSinceLegendary, 3);

  // Save sem o campo (run antiga) carrega como 0
  const old = JSON.parse(storage.data[save.RUN_KEY]);
  delete old.rewardsSinceLegendary;
  storage.data[save.RUN_KEY] = JSON.stringify(old);
  assert.equal(save.loadRun(), true);
  assert.equal(state.rewardsSinceLegendary, 0);
});
