// Fase 4: efeitos dos itens (crítico, congelamento, roubo de vida, esquiva, Pacto...)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ITEMS,
  setupRun,
  enemy,
  item,
  fixedRandom,
  captureEvents,
  setLevel,
  REAL_CRIT_CHANCE,
} from "./helpers.js";
import { state, PLAYER_BASE } from "../game/src/state.js";
import { on } from "../game/src/events.js";
import { setRandom } from "../game/src/random.js";
import {
  activateItem,
  updateItemTimers,
  enemyAttack,
  updateEnemies,
  CRIT_MULT,
  coldStacks,
} from "../game/src/combat.js";
import { RARITIES } from "../game/src/items.js";
import {
  applyPassives,
  generateRandomItems,
  addItemOrLevel,
} from "../game/src/items.js";
import { applyUpgrades } from "../game/src/meta.js";
import * as save from "../game/src/save.js";
import { memoryStorage } from "./helpers.js";

const lost = (en) => en.maxHp - en.hp;

// ─── Crítico ───
test("crítico causa dano ×1,5 e avisa com o evento crit", () => {
  const target = enemy();
  setupRun(["rusted_sword"], [target]);
  fixedRandom(0.5);
  const crits = [];
  on("crit", (e) => crits.push(e));

  state.player.critChance = 0;
  activateItem(item("rusted_sword"));
  assert.equal(lost(target), 8);
  assert.equal(crits.length, 0);

  state.player.critChance = 1;
  activateItem(item("rusted_sword"));
  assert.equal(lost(target), 8 + Math.round(8 * CRIT_MULT));
  assert.equal(crits.length, 1);
  assert.equal(crits[0].damage, 12);
  assert.equal(crits[0].x, target.x);
});

test("chance base de crítico é 5% e cada golpe rola separado", () => {
  PLAYER_BASE.critChance = REAL_CRIT_CHANCE;
  try {
    const target = enemy();
    setupRun(["shadow_dagger"], [target]);
    assert.equal(state.player.critChance, 0.05);
    // 2 golpes; cada um rola crítico e depois a Sombra: crítico, nada, normal, nada
    const rolls = [0.01, 0.9, 0.9, 0.9];
    let i = 0;
    setRandom(() => rolls[i++ % rolls.length]);
    const crits = [];
    on("crit", (e) => crits.push(e));
    activateItem(item("shadow_dagger"));
    assert.equal(crits.length, 1);
    assert.equal(lost(target), Math.round(9 * CRIT_MULT) + 9);
  } finally {
    PLAYER_BASE.critChance = 0;
  }
});

test("Moeda da Fortuna: +15% de crítico; ataque extra do nível 3 que não encadeia", () => {
  const target = enemy();
  setupRun(["rusted_sword", "lucky_coin"], [target]);
  assert.ok(Math.abs(state.player.critChance - 0.15) < 1e-9);
  let attacks = 0;
  on("attack", () => attacks++);
  fixedRandom(0); // crítico e 25% de ataque extra sempre
  activateItem(item("rusted_sword"));
  assert.equal(attacks, 1, "no nível 1 não há ataque extra");

  attacks = 0;
  setLevel("lucky_coin", 3);
  assert.ok(Math.abs(state.player.critChance - 0.25) < 1e-9);
  const before = lost(target);
  activateItem(item("rusted_sword"));
  assert.equal(attacks, 2, "um ataque + um extra, sem encadear");
  assert.equal(lost(target) - before, 12 * 2);
});

test("Moeda da Fortuna: abate com golpe crítico dá +1 fragmento", () => {
  const crit = enemy({ hp: 5, fragments: 2 });
  setupRun(["rusted_sword", "lucky_coin"], [crit]);
  fixedRandom(0.5);
  state.player.critChance = 1;
  activateItem(item("rusted_sword"));
  updateEnemies(16);
  assert.equal(state.fragments, 3);

  const normal = enemy({ hp: 5, fragments: 2 });
  setupRun(["rusted_sword", "lucky_coin"], [normal]);
  state.fragments = 0;
  fixedRandom(0.5);
  state.player.critChance = 0;
  activateItem(item("rusted_sword"));
  updateEnemies(16);
  assert.equal(state.fragments, 2);
});

// ─── Armas ───
test("Arco Gélido: o 5º stack de frio congela; parado, não ataca e descongela com o tempo", () => {
  const target = enemy({ moving: true, speed: 1, x: 400 });
  setupRun(["frost_bow"], [target]);
  const freezes = [];
  on("freeze", (e) => freezes.push(e));
  for (let i = 0; i < 4; i++) {
    activateItem(item("frost_bow"));
    assert.equal(target.frozen, undefined, "ainda não congelou");
  }
  activateItem(item("frost_bow"));
  assert.equal(target.frozen, 2000);
  assert.equal(freezes.length, 1);
  assert.equal(target.dots.length, 0, "os stacks zeram");

  const x = target.x;
  updateEnemies(1000);
  assert.equal(target.x, x, "parado");
  assert.equal(target.atkTimer, 0);
  assert.equal(target.frozen, 1000);
  updateEnemies(1000);
  assert.equal(target.frozen, 0);
  updateEnemies(100);
  assert.ok(target.x < x, "voltou a andar");
});

test("congelado não avança o tempo de ataque", () => {
  const target = enemy({ x: 120, moving: false, atkInterval: 500, frozen: 400 });
  const hp0 = setupRun([], [target]).player.hp;
  updateEnemies(300);
  assert.equal(state.player.hp, hp0);
  assert.equal(target.atkTimer, 0);
  updateEnemies(300); // descongela neste quadro, sem contar o tempo como ataque
  assert.equal(target.frozen, 0);
  assert.equal(target.atkTimer, 0);
  updateEnemies(300);
  assert.equal(target.atkTimer, 300);
});

test("Lâmina Venenosa acumula veneno sem limite de stacks", () => {
  const target = enemy();
  setupRun(["poison_blade"], [target]);
  for (let i = 0; i < 7; i++) activateItem(item("poison_blade"));
  const poison = target.dots.find((d) => d.type === "poison");
  assert.equal(poison.stacks, 7);
  assert.equal(poison.damage, 1);
  assert.equal(poison.base, 1);
  assert.equal(poison.duration, undefined, "veneno não tem duração");
});

test("Maça Sagrada cura 5 HP por golpe; +10 nos críticos só a partir do nível 3", () => {
  setupRun(["holy_mace"], [enemy()]);
  fixedRandom(0.5);
  state.player.hp = 50;
  state.player.critChance = 0;
  activateItem(item("holy_mace"));
  assert.equal(state.player.hp, 55);
  state.player.critChance = 1;
  activateItem(item("holy_mace"));
  assert.equal(state.player.hp, 60, "nível 1: crítico não cura a mais");

  setLevel("holy_mace", 3); // cura 5 + 2 por nível
  state.player.hp = 40;
  state.player.critChance = 1;
  activateItem(item("holy_mace"));
  assert.equal(state.player.hp, 40 + 7 + 10);
});

test("Foice de Sangue rouba 30% do dano causado", () => {
  setupRun(["blood_scythe"], [enemy()]);
  state.player.hp = 50;
  activateItem(item("blood_scythe"));
  assert.equal(state.player.hp, 56); // 20 de dano × 30%
});

test("Foice de Sangue: a partir do nível 3, a cada 3 abates o próximo ataque causa dano ×2", () => {
  const dead = [enemy({ hp: 0 }), enemy({ hp: 0 }), enemy({ hp: 0 })];
  const target = enemy({ x: 500 });
  setupRun(["blood_scythe"], [...dead, target]);
  setLevel("blood_scythe", 3); // 20 + 5 por nível = 30
  updateEnemies(16);
  assert.equal(state.kills, 3);
  activateItem(item("blood_scythe"));
  assert.equal(lost(target), 60);
  activateItem(item("blood_scythe"));
  assert.equal(lost(target), 90, "só o primeiro é duplo");
});

test("Foice de Sangue no nível 1 não colhe: 3 abates não duplicam o ataque", () => {
  const dead = [enemy({ hp: 0 }), enemy({ hp: 0 }), enemy({ hp: 0 })];
  const target = enemy({ x: 500 });
  setupRun(["blood_scythe"], [...dead, target]);
  updateEnemies(16);
  activateItem(item("blood_scythe"));
  assert.equal(lost(target), 20);
});

test("Orbe Aquático: Maré (nível 3) acumula no mesmo alvo e zera ao trocar", () => {
  const a = enemy({ x: 200 });
  const b = enemy({ x: 300 });
  setupRun(["water_orb"], [a, b]);
  setLevel("water_orb", 3); // 15 + 3 por nível = 21
  const orb = item("water_orb");
  const hits = [];
  for (let i = 0; i < 7; i++) {
    const before = lost(a);
    activateItem(orb);
    hits.push(lost(a) - before);
  }
  assert.deepEqual(hits, [21, 24, 27, 30, 33, 36, 36], "teto de 5 acúmulos");
  a.x = 400; // agora o alvo mais próximo é b
  activateItem(orb);
  assert.equal(lost(b), 21);
  assert.equal(state.player.tide.target, b);
});

test("Orbe Aquático adianta 0,3s a recarga dos outros itens, com teto na recarga cheia", () => {
  setupRun(["water_orb", "health_crystal", "echo_stone"], [enemy()]);
  state.itemTimers.health_crystal.elapsed = 0;
  state.itemTimers.echo_stone.elapsed = state.itemTimers.echo_stone.cooldown - 100;
  activateItem(item("water_orb"));
  assert.equal(state.itemTimers.health_crystal.elapsed, 300);
  assert.equal(state.itemTimers.echo_stone.elapsed, state.itemTimers.echo_stone.cooldown);
  assert.equal(state.itemTimers.water_orb.elapsed, 0);
});

test("Cajado do Trovão: Tempestade (nível 3) no 4º uso (+50%)", () => {
  const target = enemy();
  setupRun(["thunder_staff"], [target]);
  setLevel("thunder_staff", 3); // 22 + 5 por nível = 32
  const dmg = [];
  for (let i = 0; i < 5; i++) {
    const before = lost(target);
    activateItem(item("thunder_staff"));
    dmg.push(lost(target) - before);
  }
  assert.deepEqual(dmg, [32, 32, 32, 48, 32]);
});

// ─── Armaduras ───
test("Cota de Malha: Deflexão (nível 3) devolve metade do dano recebido", () => {
  const attacker = enemy({ dmg: 20 });
  setupRun(["chainmail"], [attacker]);
  fixedRandom(0);
  enemyAttack(attacker);
  assert.equal(lost(attacker), 0, "nível 1 não tem Deflexão");

  setLevel("chainmail", 3); // 18 + 8×2 = 34 de armadura
  const hp0 = state.player.hp;
  enemyAttack(attacker);
  // 20 com 34 de armadura (34 / 134 = 25,4%) = 15; devolve 8
  assert.equal(hp0 - state.player.hp, 15);
  assert.equal(lost(attacker), 8);

  fixedRandom(0.99);
  enemyAttack(attacker);
  assert.equal(lost(attacker), 8, "sem reflexo quando a chance falha");
});

test("Manto das Sombras: esquiva evita o dano; nível 3 contra-ataca e nível 5 reforça o próximo ataque", () => {
  const attacker = enemy({ dmg: 20 });
  const target = enemy({ x: 500 });
  setupRun(["rusted_sword", "shadow_cloak"], [attacker, target]);
  assert.ok(Math.abs(state.player.evasion - 0.1) < 1e-9);
  const ev = captureEvents();
  const dodges = [];
  on("dodge", (e) => dodges.push(e));

  fixedRandom(0.05);
  enemyAttack(attacker);
  assert.equal(state.player.hp, 100);
  assert.equal(dodges.length, 1);
  assert.ok(ev.some((e) => e.type === "sfx" && e.payload.name === "dodge"));
  assert.equal(state.player.empowered, 0, "nível 1: sem Fuga");
  assert.equal(lost(attacker), 0, "nível 1: sem contra-ataque");

  setLevel("shadow_cloak", 5);
  state.itemTimers.rusted_sword.elapsed = 0;
  enemyAttack(attacker);
  assert.equal(lost(attacker), 8, "contra-ataque da espada, na hora");
  assert.equal(state.itemTimers.rusted_sword.elapsed, 0, "não mexe na recarga");
  assert.equal(state.player.empowered, 1);

  fixedRandom(0.5);
  const before = lost(attacker);
  activateItem(item("rusted_sword")); // alvo mais próximo: attacker (x=200)
  assert.equal(lost(attacker) - before, 16, "+100%");
  assert.equal(state.player.empowered, 0);
  activateItem(item("rusted_sword"));
  assert.equal(lost(attacker) - before, 16 + 8, "só o primeiro é reforçado");

  state.player.evasion = 0;
  enemyAttack(attacker);
  assert.ok(state.player.hp < 100, "sem esquiva quando a rolagem falha");
});

test("esquiva tem teto de 40%", () => {
  setupRun(["shadow_cloak"]);
  state.itemLevels.shadow_cloak = 5;
  applyPassives();
  assert.ok(Math.abs(state.player.evasion - 0.26) < 1e-9, "10% + 4% por nível");
  state.player.baseArmor = 0;
  state.items[0] = { ...item("shadow_cloak"), effects: [{ trigger: "passive", type: "stats", evasion: 5 }] };
  applyPassives();
  assert.equal(state.player.evasion, 0.4);
});

test("Armadura Cristalina: a cada 2s aplica frio nos colados no herói e o 5º stack congela", () => {
  const near = enemy({ x: 150 });
  const far = enemy({ x: 600 });
  setupRun(["crystal_armor"], [near, far]);
  const ev = captureEvents();
  assert.equal(item("crystal_armor").cooldown, 2000);
  for (let i = 0; i < 4; i++) {
    state.itemTimers.crystal_armor.elapsed = state.itemTimers.crystal_armor.cooldown;
    updateItemTimers(0);
    assert.equal(coldStacks(near), i + 1);
  }
  assert.equal(coldStacks(far), 0, "fora do raio");
  state.itemTimers.crystal_armor.elapsed = state.itemTimers.crystal_armor.cooldown;
  updateItemTimers(0);
  assert.equal(near.frozen, 2000);
  assert.equal(coldStacks(near), 0, "os stacks zeram ao congelar");
  assert.ok(ev.some((e) => e.type === "sfx" && e.payload.name === "freeze"));
});

test("Armadura Cristalina sem inimigo ao alcance não gasta a recarga", () => {
  setupRun(["crystal_armor"], [enemy({ x: 600 })]);
  const timer = state.itemTimers.crystal_armor;
  timer.elapsed = timer.cooldown;
  updateItemTimers(0);
  assert.equal(timer.elapsed, timer.cooldown);
});

// ─── Relíquias ───
// ─── Relíquias ───
test("Amuleto Vampírico: 8% do dano; a Sede (nível 3) dobra o roubo abaixo de 50% de vida", () => {
  setupRun(["thunder_staff", "vampiric_amulet"], [enemy()]);
  state.player.hp = 80;
  activateItem(item("thunder_staff")); // 22 × 8% = 1,76 -> 2
  assert.equal(state.player.hp, 82);
  state.player.hp = 40;
  activateItem(item("thunder_staff"));
  assert.equal(state.player.hp, 42, "nível 1: sem Sede");

  setLevel("vampiric_amulet", 3); // 8% + 2% por nível = 12%
  state.player.hp = 80;
  activateItem(item("thunder_staff")); // 22 × 12% = 2,64 -> 3
  assert.equal(state.player.hp, 83);
  state.player.hp = 40;
  activateItem(item("thunder_staff")); // 22 × 24% = 5,28 -> 5
  assert.equal(state.player.hp, 45);
});

test("Botas da Velocidade: armas recarregam 15% mais rápido", () => {
  setupRun(["rusted_sword", "speed_boots"], [enemy()]);
  assert.ok(Math.abs(state.player.weaponSpeed - 0.15) < 1e-9);
  state.itemTimers.rusted_sword.elapsed = 0;
  updateItemTimers(1000);
  assert.ok(Math.abs(state.itemTimers.rusted_sword.elapsed - 1150) < 1e-6);
});

test("Botas da Velocidade: Sprint (nível 3) a cada 5 ataques deixa a arma pronta na hora", () => {
  setupRun(["rusted_sword", "speed_boots"], [enemy()]);
  setLevel("speed_boots", 3);
  const timer = state.itemTimers.rusted_sword;
  for (let i = 1; i <= 5; i++) {
    activateItem(item("rusted_sword"));
    if (i < 5) assert.equal(timer.elapsed, 0, `ataque ${i}`);
  }
  assert.equal(timer.elapsed, timer.cooldown);
});

test("Anel Amaldiçoado: +30% de dano e -20% de vida máxima, sem acumular", () => {
  const target = enemy();
  setupRun(["rusted_sword", "cursed_ring"], [target]);
  assert.equal(state.player.maxHp, 80);
  applyPassives();
  applyPassives();
  assert.equal(state.player.maxHp, 80, "idempotente");
  assert.equal(state.player.hp, 80, "vida limitada ao novo máximo");

  activateItem(item("rusted_sword"));
  assert.equal(lost(target), 10); // 8 × 1,3

  state.meta.upgrades = { vitality: 2 };
  applyUpgrades(state.player);
  assert.equal(state.player.maxHp, Math.round(120 * 0.8));
  applyUpgrades(state.player);
  applyPassives();
  assert.equal(state.player.maxHp, 96);
  state.meta.upgrades = {};
});

test("Anel Amaldiçoado: Pacto (nível 3) drena 2 HP por abate, soma 1% até 25% e nunca mata", () => {
  const dead = Array.from({ length: 30 }, () => enemy({ hp: 0 }));
  setupRun(["rusted_sword", "cursed_ring"], dead);
  setLevel("cursed_ring", 3); // +30% +10% por nível = +50%
  state.player.hp = 80;
  updateEnemies(16);
  assert.equal(state.kills, 30);
  assert.ok(Math.abs(state.player.pactBonus - 0.25) < 1e-9, "teto de +25%");
  assert.equal(state.player.hp, 20);

  // Com pouca vida o Pacto para em 1 HP
  const more = Array.from({ length: 20 }, () => enemy({ hp: 0 }));
  state.enemies = more;
  updateEnemies(16);
  assert.equal(state.player.hp, 1);
  assert.equal(state.running, true);

  // O bônus entra no dano: 8 × (1 + 0,5 + 0,25) = 14
  const target = enemy();
  state.enemies = [target];
  activateItem(item("rusted_sword"));
  assert.equal(lost(target), 14);
});

// ─── Save e catálogo ───
test("campos novos da run sobrevivem ao salvar e carregar", () => {
  const storage = memoryStorage();
  save.setStorage(storage);
  setupRun(["blood_scythe", "cursed_ring"]);
  Object.assign(state.player, {
    pactBonus: 0.12,
    counters: { storm: 2, sprint: 3, harvest: 1 },
    harvestReady: true,
    empowered: 0.5,
  });
  save.saveRun();

  setupRun([]);
  assert.equal(state.player.pactBonus, 0);
  assert.equal(save.loadRun(), true);
  assert.equal(state.player.pactBonus, 0.12);
  assert.deepEqual(state.player.counters, { storm: 2, sprint: 3, harvest: 1 });
  assert.equal(state.player.harvestReady, true);
  assert.equal(state.player.empowered, 0.5);

  // Run nova zera tudo
  setupRun([]);
  assert.equal(state.player.pactBonus, 0);
  assert.deepEqual(state.player.counters, {});
  assert.equal(state.player.harvestReady, false);
  save.setStorage(null);
});

test("itens cortados saem do catálogo e saves antigos com eles carregam sem eles", () => {
  assert.equal(ITEMS.some((i) => i.id === "ancient_tome"), false);
  assert.equal(ITEMS.some((i) => i.id === "time_glass"), false);

  const storage = memoryStorage();
  save.setStorage(storage);
  setupRun(["rusted_sword"]);
  save.saveRun();
  const data = JSON.parse(storage.data[save.RUN_KEY]);
  data.items.push("ancient_tome", "time_glass");
  data.itemLevels.time_glass = 3;
  data.itemTimers.ancient_tome = { elapsed: 1, cooldown: 2 };
  storage.data[save.RUN_KEY] = JSON.stringify(data);

  setupRun([]);
  assert.equal(save.loadRun(), true);
  assert.deepEqual(state.items.map((i) => i.id), ["rusted_sword"]);
  assert.equal("time_glass" in state.itemLevels, false);
  assert.equal("ancient_tome" in state.itemTimers, false);
  save.setStorage(null);
});

test("todos os itens do catálogo podem ser sorteados e subir de nível", () => {
  setupRun([]);
  // As formas evoluídas só aparecem para quem já as tem
  const sortable = ITEMS.filter((i) => !i.evolvedFrom);
  const all = generateRandomItems(ITEMS.length);
  assert.equal(all.length, sortable.length);
  assert.equal(new Set(all.map((i) => i.id)).size, sortable.length);

  setupRun(["lucky_coin"]);
  assert.deepEqual(addItemOrLevel(item("lucky_coin")), { leveled: true, level: 2 });
  applyPassives();
  assert.ok(Math.abs(state.player.critChance - 0.2) < 1e-9, "15% + 5% por nível");
});

// ─── Revisão da fase 4 ───
test("segunda arma pronta no mesmo quadro não ataca inimigo com vida 0", () => {
  const corpse = enemy({ hp: 0 });
  setupRun(["rusted_sword"], [corpse]);
  state.player.harvestReady = true;
  state.player.empowered = 0.5;
  assert.equal(activateItem(item("rusted_sword")), false);
  assert.equal(corpse.hp, 0);
  assert.equal(state.player.empowered, 0.5, "bônus não foi gasto");
});

test("golpe duplo para quando o primeiro golpe mata o alvo", () => {
  const target = enemy({ hp: 5 });
  setupRun(["shadow_dagger"], [target]);
  let hits = 0;
  on("hit", () => hits++);
  activateItem(item("shadow_dagger"));
  assert.equal(hits, 1);
});

test("abate por Relâmpago, Deflexão ou barreira não paga fragmento de crítico", () => {
  const main = enemy();
  const side = enemy({ hp: 1, x: 300, fragments: 1, lastHitCrit: true }); // flag velha
  setupRun(["thunder_staff", "lucky_coin"], [main, side]);
  fixedRandom(0.5);
  state.player.critChance = 1;
  activateItem(item("thunder_staff")); // crítico no alvo; a cadeia mata o outro
  state.fragments = 0;
  updateEnemies(16);
  assert.equal(side.dead, true);
  assert.equal(state.fragments, 1 + 0, "só os fragmentos base do inimigo, sem bônus");
});

test("Relâmpago em cadeia repassa o dano sem o crítico", () => {
  const main = enemy();
  const side = enemy({ x: 300 });
  setupRun(["thunder_staff"], [main, side]);
  fixedRandom(0.5);
  state.player.critChance = 1;
  activateItem(item("thunder_staff"));
  assert.equal(lost(main), 33);
  assert.equal(lost(side), 11, "50% de 22, sem ×1,5");
});

test("ataque extra da Moeda não repete Colheita nem Fuga", () => {
  const target = enemy();
  setupRun(["blood_scythe", "lucky_coin"], [target]);
  setLevel("blood_scythe", 3);
  setLevel("lucky_coin", 3);
  fixedRandom(0);
  state.player.critChance = 1;
  state.player.harvestReady = true;
  activateItem(item("blood_scythe"));
  // golpe: 30 ×2 (colheita) ×1,5 = 90; extra: 30 ×1,5 = 45
  assert.equal(lost(target), 135);
});

test("veneno usa o bônus de dano do Anel", () => {
  const a = enemy();
  setupRun(["poison_blade", "cursed_ring"], [a]);
  activateItem(item("poison_blade"));
  assert.equal(a.dots[0].damage, 1.3);
  assert.equal(a.dots[0].base, 1.3);
});

test("enemyAttack informa o resultado", () => {
  const atk = enemy({ dmg: 5 });
  setupRun(["iron_shield"], [atk]);
  fixedRandom(0.5);
  assert.equal(enemyAttack(atk), "hit");
  state.player.blocksLeft = 1;
  assert.equal(enemyAttack(atk), "blocked");
  state.player.evasion = 1;
  assert.equal(enemyAttack(atk), "dodged");
});

test("Botas: mensagem do Sprint não depende do gênero da arma", () => {
  setupRun(["water_orb", "speed_boots"], [enemy()]);
  setLevel("speed_boots", 3);
  const ev = captureEvents();
  state.player.counters.sprint = 4;
  activateItem(item("water_orb"));
  assert.ok(ev.some((e) => e.type === "log" && e.payload.msg.includes("Recarga de Orbe Aquático zerada")));
});

test("item com maxLevel 1 que o jogador já tem (save sem itemLevels) não é sorteado", () => {
  setupRun(["phoenix_feather"]);
  state.itemLevels = {};
  const feather = item("phoenix_feather");
  feather.maxLevel = 1; // a Pena sobe até o 5; o teste usa um item de nível único
  try {
    for (let i = 0; i < 200; i++) {
      assert.ok(!generateRandomItems(5).some((it) => it.id === "phoenix_feather"));
    }
  } finally {
    delete feather.maxLevel;
  }
});
