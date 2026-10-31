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
} from "../game/src/combat.js";
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

test("Moeda da Fortuna: +20% de crítico, ataque extra que não encadeia", () => {
  const target = enemy();
  setupRun(["rusted_sword", "lucky_coin"], [target]);
  assert.ok(Math.abs(state.player.critChance - 0.2) < 1e-9);
  let attacks = 0;
  on("attack", () => attacks++);
  fixedRandom(0); // crítico e 25% de ataque extra sempre
  activateItem(item("rusted_sword"));
  assert.equal(attacks, 2, "um ataque + um extra, sem encadear");
  assert.equal(lost(target), 12 * 2);
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
test("Arco Gélido congela: não anda, não ataca e descongela com o tempo", () => {
  const target = enemy({ moving: true, speed: 1, x: 400 });
  setupRun(["frost_bow"], [target]);
  const freezes = [];
  on("freeze", (e) => freezes.push(e));
  fixedRandom(0);
  activateItem(item("frost_bow"));
  assert.equal(target.frozen, 2000);
  assert.equal(freezes.length, 1);

  fixedRandom(0.99);
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
  assert.equal(poison.duration, 4);
});

test("Maça Sagrada cura 5 HP por golpe e +10 nos críticos", () => {
  setupRun(["holy_mace"], [enemy()]);
  fixedRandom(0.5);
  state.player.hp = 50;
  state.player.critChance = 0;
  activateItem(item("holy_mace"));
  assert.equal(state.player.hp, 55);
  state.player.critChance = 1;
  activateItem(item("holy_mace"));
  assert.equal(state.player.hp, 55 + 5 + 10);
});

test("Foice de Sangue rouba 30% do dano causado", () => {
  setupRun(["blood_scythe"], [enemy()]);
  state.player.hp = 50;
  activateItem(item("blood_scythe"));
  assert.equal(state.player.hp, 56); // 20 de dano × 30%
});

test("Foice de Sangue: a cada 3 abates o próximo ataque causa dano ×2", () => {
  const dead = [enemy({ hp: 0 }), enemy({ hp: 0 }), enemy({ hp: 0 })];
  const target = enemy({ x: 500 });
  setupRun(["blood_scythe"], [...dead, target]);
  updateEnemies(16);
  assert.equal(state.kills, 3);
  activateItem(item("blood_scythe"));
  assert.equal(lost(target), 40);
  activateItem(item("blood_scythe"));
  assert.equal(lost(target), 60, "só o primeiro é duplo");
});

test("Orbe Aquático: Maré acumula no mesmo alvo e zera ao trocar", () => {
  const a = enemy({ x: 200 });
  const b = enemy({ x: 300 });
  setupRun(["water_orb"], [a, b]);
  const orb = item("water_orb");
  const hits = [];
  for (let i = 0; i < 7; i++) {
    const before = lost(a);
    activateItem(orb);
    hits.push(lost(a) - before);
  }
  assert.deepEqual(hits, [15, 18, 21, 24, 27, 30, 30], "teto de 5 acúmulos");
  a.x = 400; // agora o alvo mais próximo é b
  activateItem(orb);
  assert.equal(lost(b), 15);
  assert.equal(state.player.tide.target, b);
});

test("Orbe Aquático adianta 0,3s a recarga dos outros itens, com teto na recarga cheia", () => {
  setupRun(["water_orb", "health_crystal", "mana_stone"], [enemy()]);
  state.itemTimers.health_crystal.elapsed = 0;
  state.itemTimers.mana_stone.elapsed = state.itemTimers.mana_stone.cooldown - 100;
  activateItem(item("water_orb"));
  assert.equal(state.itemTimers.health_crystal.elapsed, 300);
  assert.equal(state.itemTimers.mana_stone.elapsed, state.itemTimers.mana_stone.cooldown);
  assert.equal(state.itemTimers.water_orb.elapsed, 0);
});

test("Cajado do Trovão: Tempestade no 4º uso (+50%)", () => {
  const target = enemy();
  setupRun(["thunder_staff"], [target]);
  const dmg = [];
  for (let i = 0; i < 5; i++) {
    const before = lost(target);
    activateItem(item("thunder_staff"));
    dmg.push(lost(target) - before);
  }
  assert.deepEqual(dmg, [22, 22, 22, 33, 22]);
});

// ─── Armaduras ───
test("Cota de Malha: Deflexão devolve metade do dano recebido", () => {
  const attacker = enemy({ dmg: 20 });
  setupRun(["chainmail"], [attacker]);
  fixedRandom(0);
  enemyAttack(attacker);
  // 20 com 18% de redução = 16; devolve 8
  assert.equal(state.player.hp, 100 - 16);
  assert.equal(lost(attacker), 8);

  fixedRandom(0.99);
  enemyAttack(attacker);
  assert.equal(lost(attacker), 8, "sem reflexo quando a chance falha");
});

test("Manto das Sombras: esquiva evita o dano e reforça o próximo ataque", () => {
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
  assert.equal(state.player.empowered, 0.5);

  fixedRandom(0.5);
  activateItem(item("rusted_sword")); // alvo mais próximo: attacker (x=200)
  assert.equal(lost(attacker), 12);
  assert.equal(state.player.empowered, 0);
  activateItem(item("rusted_sword"));
  assert.equal(lost(attacker), 12 + 8, "só o primeiro é reforçado");

  enemyAttack(attacker);
  assert.ok(state.player.hp < 100, "sem esquiva quando a rolagem falha");
});

test("evasão tem teto de 50%", () => {
  setupRun(["shadow_cloak"]);
  state.itemLevels.shadow_cloak = 5;
  applyPassives();
  assert.ok(Math.abs(state.player.evasion - 0.1 * 1.8) < 1e-9);
  state.player.baseArmor = 0;
  state.items[0] = { ...item("shadow_cloak"), effects: [{ trigger: "passive", type: "stats", evasion: 5 }] };
  applyPassives();
  assert.equal(state.player.evasion, 0.5);
});

test("Armadura Cristalina: barreira quebrada explode em gelo e congela", () => {
  const near = enemy({ dmg: 50, x: 200 });
  const far = enemy({ x: 600 });
  setupRun(["crystal_armor"], [near, far]);
  const ev = captureEvents();
  const booms = [];
  on("explode", (e) => booms.push(e));
  activateItem(item("crystal_armor"));
  assert.equal(state.player.barrier, 40);
  assert.equal(state.player.barrierSource, "crystal_armor");

  enemyAttack(near); // 50 de dano: quebra os 40 e 10 passam
  assert.equal(state.player.barrier, 0);
  assert.equal(booms.length, 1);
  assert.equal(lost(near), 15);
  assert.equal(lost(far), 15);
  assert.equal(near.frozen, 1000);
  assert.equal(far.frozen, 1000);
  assert.ok(ev.some((e) => e.type === "sfx" && e.payload.name === "explode"));
});

test("Armadura Cristalina: barreira que não quebra ou de outro item não explode", () => {
  const attacker = enemy({ dmg: 20 });
  setupRun(["crystal_armor", "dragonscale"], [attacker]);
  const booms = [];
  on("explode", () => booms.push(1));

  state.player.barrier = 30;
  state.player.barrierSource = "dragonscale";
  attacker.dmg = 50;
  enemyAttack(attacker);
  assert.equal(booms.length, 0, "a barreira era da Escama");

  state.player.barrier = 40;
  state.player.barrierSource = "crystal_armor";
  attacker.dmg = 20;
  enemyAttack(attacker);
  assert.equal(state.player.barrier, 20);
  assert.equal(booms.length, 0, "ainda não quebrou");
});

test("nova barreira só substitui a atual se for maior", () => {
  setupRun(["crystal_armor", "dragonscale"], [enemy()]);
  activateItem(item("crystal_armor")); // 40
  activateItem(item("dragonscale")); // 30
  assert.equal(state.player.barrier, 40);
  assert.equal(state.player.barrierSource, "crystal_armor");
});

// ─── Relíquias ───
test("Amuleto Vampírico: 8% do dano, 15% abaixo de 50% de vida", () => {
  setupRun(["thunder_staff", "vampiric_amulet"], [enemy()]);
  state.player.hp = 80;
  activateItem(item("thunder_staff")); // 22 × 8% = 1,76 -> 2
  assert.equal(state.player.hp, 82);
  state.player.hp = 40;
  activateItem(item("thunder_staff")); // 22 × 15% = 3,3 -> 3
  assert.equal(state.player.hp, 43);
});

test("Botas da Velocidade: armas recarregam 15% mais rápido", () => {
  setupRun(["rusted_sword", "speed_boots"], [enemy()]);
  assert.ok(Math.abs(state.player.weaponSpeed - 0.15) < 1e-9);
  state.itemTimers.rusted_sword.elapsed = 0;
  updateItemTimers(1000);
  assert.ok(Math.abs(state.itemTimers.rusted_sword.elapsed - 1150) < 1e-6);
});

test("Botas da Velocidade: a cada 5 ataques a arma fica pronta na hora", () => {
  setupRun(["rusted_sword", "speed_boots"], [enemy()]);
  const timer = state.itemTimers.rusted_sword;
  for (let i = 1; i <= 5; i++) {
    activateItem(item("rusted_sword"));
    if (i < 5) assert.equal(timer.elapsed, 0, `ataque ${i}`);
  }
  assert.equal(timer.elapsed, timer.cooldown);
});

test("Anel Amaldiçoado: +50% de dano e -20% de vida máxima, sem acumular", () => {
  const target = enemy();
  setupRun(["rusted_sword", "cursed_ring"], [target]);
  assert.equal(state.player.maxHp, 80);
  applyPassives();
  applyPassives();
  assert.equal(state.player.maxHp, 80, "idempotente");
  assert.equal(state.player.hp, 80, "vida limitada ao novo máximo");

  activateItem(item("rusted_sword"));
  assert.equal(lost(target), 12);

  state.meta.upgrades = { vitality: 2 };
  applyUpgrades(state.player);
  assert.equal(state.player.maxHp, Math.round(120 * 0.8));
  applyUpgrades(state.player);
  applyPassives();
  assert.equal(state.player.maxHp, 96);
  state.meta.upgrades = {};
});

test("Anel Amaldiçoado: Pacto drena 2 HP por abate, soma 1% até 25% e nunca mata", () => {
  const dead = Array.from({ length: 30 }, () => enemy({ hp: 0 }));
  setupRun(["rusted_sword", "cursed_ring"], dead);
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
  const all = generateRandomItems(ITEMS.length);
  assert.equal(all.length, ITEMS.length);
  assert.equal(new Set(all.map((i) => i.id)).size, ITEMS.length);

  setupRun(["lucky_coin"]);
  assert.deepEqual(addItemOrLevel(item("lucky_coin")), { leveled: true, level: 2 });
  applyPassives();
  assert.ok(Math.abs(state.player.critChance - 0.24) < 1e-9, "chance escala com o nível");
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
  fixedRandom(0);
  state.player.critChance = 1;
  state.player.harvestReady = true;
  activateItem(item("blood_scythe"));
  // golpe: 20 ×2 (colheita) ×1,5 = 60; extra: 20 ×1,5 = 30
  assert.equal(lost(target), 90);
});

test("barreira menor que a atual não gera efeito nem mensagem de ativação", () => {
  setupRun(["crystal_armor", "dragonscale"], [enemy()]);
  const ev = captureEvents();
  activateItem(item("crystal_armor"));
  const effects = state.effects.length;
  ev.length = 0;
  activateItem(item("dragonscale"));
  assert.equal(state.effects.length, effects);
  assert.ok(!ev.some((e) => e.type === "log" && e.payload.msg.includes("ativada")));
});

test("veneno e explosão usam o bônus de dano do Anel", () => {
  const a = enemy();
  const b = enemy({ x: 300 });
  setupRun(["poison_blade", "cursed_ring", "crystal_armor"], [a, b]);
  activateItem(item("poison_blade"));
  assert.equal(a.dots[0].damage, 1.5);
  assert.equal(a.dots[0].base, 1.5);

  state.player.barrier = 0;
  state.player.barrierSource = "crystal_armor";
  state.player.barrier = 1;
  const hp = [a.hp, b.hp];
  enemyAttack(enemy({ dmg: 5 }));
  assert.equal(hp[1] - b.hp, Math.round(15 * 1.5));
});

test("explosão ignora inimigo com vida 0 e avisa o congelamento uma vez", () => {
  const live1 = enemy({ x: 200 });
  const live2 = enemy({ x: 300 });
  const corpse = enemy({ hp: 0, x: 400 });
  setupRun(["crystal_armor"], [live1, live2, corpse]);
  const freezes = [];
  on("freeze", (e) => freezes.push(e));
  const ev = captureEvents();
  state.player.barrier = 1;
  state.player.barrierSource = "crystal_armor";
  enemyAttack(enemy({ dmg: 5 }));
  assert.equal(freezes.length, 1);
  assert.equal(ev.filter((e) => e.type === "sfx" && e.payload.name === "freeze").length, 1);
  assert.equal(corpse.hp, 0);
  assert.equal(corpse.frozen, undefined);
  assert.equal(live1.frozen, 1000);
  assert.equal(live2.frozen, 1000);
});

test("enemyAttack informa o resultado", () => {
  const atk = enemy({ dmg: 5 });
  setupRun(["iron_shield"], [atk]);
  fixedRandom(0.5);
  assert.equal(enemyAttack(atk), "hit");
  state.player.barrier = 100;
  assert.equal(enemyAttack(atk), "absorbed");
  state.player.nextBlockActive = true;
  assert.equal(enemyAttack(atk), "blocked");
  state.player.evasion = 1;
  assert.equal(enemyAttack(atk), "dodged");
});

test("Botas: mensagem do Sprint não depende do gênero da arma", () => {
  setupRun(["water_orb", "speed_boots"], [enemy()]);
  const ev = captureEvents();
  state.player.counters.sprint = 4;
  activateItem(item("water_orb"));
  assert.ok(ev.some((e) => e.type === "log" && e.payload.msg.includes("Recarga de Orbe Aquático zerada")));
});

test("item com maxLevel 1 que o jogador já tem (save sem itemLevels) não é sorteado", () => {
  setupRun(["phoenix_feather"]);
  state.itemLevels = {};
  for (let i = 0; i < 200; i++) {
    assert.ok(!generateRandomItems(5).some((it) => it.id === "phoenix_feather"));
  }
});
