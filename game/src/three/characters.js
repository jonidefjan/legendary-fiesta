// ═══════════════════════════════════════════
//  PERSONAGENS 3D (KayKit): herói e esqueletos
// ═══════════════════════════════════════════
// Cada .glb é carregado uma vez; inimigos são clonados com SkeletonUtils e
// ganham um AnimationMixer próprio. Enquanto o modelo carrega, aparece uma
// cápsula simples no lugar. A lógica não muda: só lemos state e os eventos.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { toonMaterial } from "./materials.js";
import { WORLD } from "./world.js";
import { logicToWorldX, arena } from "./view.js";
import { state } from "../state.js";
import { on } from "../events.js";
import { PALETTE } from "../palette.js";

const MODEL_FILES = {
  hero: "Rogue_Hooded.glb",
  minion: "Skeleton_Minion.glb",
  rogue: "Skeleton_Rogue.glb",
  warrior: "Skeleton_Warrior.glb",
  mage: "Skeleton_Mage.glb",
};

const FADE = 0.12; // s, transição entre animações
const ACTION_SPEED = 1.5; // golpes do herói mais rápidos que o clipe original
const ENEMY_ATTACK_SPEED = 1.4;
const ENEMY_DEATH_SPEED = 2.2;
const SPAWN_SPEED = 2.4;
const SINK_TIME = 0.6; // s afundando depois da morte
const YAW_TO_CAMERA = 0.35; // rad: vira um pouco para a câmera (3/4)
const MIN_SEPARATION = 0.95; // distância mínima entre inimigos vivos
const LANE_Z = WORLD.laneHalfDepth * 0.8;
const MAX_PUSH_BACK = 3; // unidades que um inimigo pode ser empurrado para trás

// Tipo de ação (player.anim ou item.anim) -> clipe do Rogue
const HERO_ACTIONS = {
  slash: "1H_Melee_Attack_Slice_Diagonal",
  fire_slash: "1H_Melee_Attack_Slice_Horizontal",
  double_slash: "Dualwield_Melee_Attack_Stab",
  stab: "1H_Melee_Attack_Stab",
  smash: "1H_Melee_Attack_Chop",
  reap: "2H_Melee_Attack_Slice",
  arrow: "1H_Ranged_Shoot",
  lightning: "Spellcast_Shoot",
  water_blast: "Spellcast_Shoot",
  heal: "Use_Item",
  block: "Block",
  berserk: "Cheer",
};

// Arma visível conforme o anim da primeira arma
const WEAPON_NODES = ["Knife", "Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Throwable"];
function weaponNodesFor(anim) {
  if (!anim) return [];
  if (anim === "double_slash") return ["Knife", "Knife_Offhand"];
  if (anim === "arrow") return ["1H_Crossbow"];
  if (anim === "lightning" || anim === "water_blast") return [];
  return ["Knife"];
}

const ENEMY_ATTACK = {
  minion: "Unarmed_Melee_Attack_Punch_A",
  rogue: "1H_Melee_Attack_Chop",
  warrior: "1H_Melee_Attack_Chop",
  mage: "Spellcast_Shoot",
};

// ─── Carregamento ───
const loader = new GLTFLoader();
const templates = new Map(); // nome -> { data, failed }
let warned = false;

function warnOnce(err) {
  if (warned) return;
  warned = true;
  console.warn("[renderer] Falha ao carregar modelos 3D; usando formas simples.", err);
}

// Troca os materiais PBR do KayKit por toon, mantendo a textura e o brilho dos olhos
function toToon(source, cache) {
  if (cache.has(source)) return cache.get(source);
  const glow = source.name === "Glow" || (source.emissive && source.emissive.getHex() !== 0);
  const mat = glow
    ? toonMaterial(source.color ?? 0xffffff, { emissive: source.emissive ?? 0xffffff })
    : toonMaterial(source.color ?? 0xffffff, {
        map: source.map ?? null,
        transparent: source.transparent,
        alphaTest: source.alphaTest,
      });
  mat.name = source.name;
  mat.userData.glow = glow;
  cache.set(source, mat);
  return mat;
}

function prepare(gltf) {
  const scene = gltf.scene;
  const cache = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material)
      ? o.material.map((m) => toToon(m, cache))
      : toToon(o.material, cache);
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false; // animação sai da caixa de bind
  });
  // Altura real só das malhas com esqueleto (armas fora)
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  scene.traverse((o) => {
    if (o.isSkinnedMesh) box.expandByObject(o, true);
  });
  const height = box.isEmpty() ? 2 : Math.max(0.5, box.max.y - Math.min(0, box.min.y));
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  return { scene, clips, height };
}

function requestTemplate(name) {
  let entry = templates.get(name);
  if (!entry) {
    entry = { data: null, failed: false };
    templates.set(name, entry);
    const url = new URL(`../../assets/models/${MODEL_FILES[name]}`, import.meta.url);
    loader
      .loadAsync(url.href)
      .then((gltf) => {
        entry.data = prepare(gltf);
      })
      .catch((err) => {
        entry.failed = true;
        warnOnce(err);
      });
  }
  return entry.data;
}

// ─── Rig: modelo clonado + mixer + troca de animação ───
class Rig {
  constructor(template, height, { perInstanceMaterials = false } = {}) {
    this.template = template;
    this.model = SkeletonUtils.clone(template.scene);
    this.model.scale.setScalar(height / template.height);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = new Map();
    this.current = null;
    this.currentName = "";
    this.once = false;
    this.flashMaterials = [];
    if (perInstanceMaterials) {
      // Material próprio para piscar ao levar dano (o brilho dos olhos fica compartilhado)
      const own = new Map();
      this.model.traverse((o) => {
        if (!o.isMesh || o.material.userData.glow) return;
        if (!own.has(o.material)) {
          const m = toonMaterial(0xffffff, { map: o.material.map });
          m.color.copy(o.material.color);
          own.set(o.material, m);
          this.flashMaterials.push(m);
        }
        o.material = own.get(o.material);
      });
    }
  }

  has(name) {
    return this.template.clips.has(name);
  }

  action(name) {
    let a = this.actions.get(name);
    if (!a) {
      a = this.mixer.clipAction(this.template.clips.get(name));
      this.actions.set(name, a);
    }
    return a;
  }

  // once: toca uma vez e congela no último quadro (clampWhenFinished)
  play(name, { once = false, timeScale = 1, restart = false, fade = FADE } = {}) {
    if (!this.has(name)) name = this.has("Idle") ? "Idle" : null;
    if (!name) return;
    const next = this.action(name);
    if (this.current === next && !restart) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = timeScale;
    next.play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false);
    this.current = next;
    this.currentName = name;
    this.once = once;
  }

  // A animação de uma vez chegou ao fim?
  finished() {
    if (!this.current || !this.once) return true;
    return this.current.time >= this.current.getClip().duration - 1e-3 || !this.current.isRunning();
  }

  setFlash(amount) {
    for (const m of this.flashMaterials) m.emissive.setScalar(amount);
  }

  update(dtSec) {
    this.mixer.update(dtSec);
  }
}

// Cápsula enquanto o modelo não chega (ou se falhar)
function placeholder(height, color) {
  const radius = height * 0.22;
  const geo = new THREE.CapsuleGeometry(radius, height - radius * 2, 3, 8);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, toonMaterial(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ─── Herói ───
function createHero(group) {
  const hero = {
    root: new THREE.Group(),
    rig: null,
    stub: placeholder(WORLD.heroHeight, PALETTE.slate),
    player: null,
    lastAnimTimer: 0,
    lastHp: 0,
    action: null, // null | "action" | "hit" | "death"
    weaponAnim: undefined,
    pendingAnim: null,
    berserk: false,
    flash: 0,
  };
  hero.root.add(hero.stub);
  hero.root.rotation.y = Math.PI / 2 - YAW_TO_CAMERA; // olha para +X
  group.add(hero.root);

  // O evento "attack" traz o item: anim mais específico que player.anim
  on("attack", ({ itemId }) => {
    const item = state.items.find((i) => i.id === itemId);
    if (item?.anim) hero.pendingAnim = item.anim;
  });
  on("playerHurt", () => {
    hero.hurtEvent = true;
  });
  return hero;
}

function attachHeroModel(hero) {
  const tpl = requestTemplate("hero");
  if (!tpl || hero.rig) return;
  hero.rig = new Rig(tpl, WORLD.heroHeight, { perInstanceMaterials: true });
  hero.root.remove(hero.stub);
  hero.root.add(hero.rig.model);
  hero.rig.play("Idle");
  hero.weaponAnim = undefined; // força atualizar as armas
}

function updateHeroWeapons(hero) {
  const weapon = state.items.find((i) => i.type === "weapon");
  const anim = weapon?.anim ?? null;
  if (anim === hero.weaponAnim) return;
  hero.weaponAnim = anim;
  const show = new Set(weaponNodesFor(anim));
  for (const name of WEAPON_NODES) {
    const node = hero.rig.model.getObjectByName(name);
    if (node) node.visible = show.has(name);
  }
}

function updateHero(hero, dtMs) {
  const p = state.player;
  hero.root.position.set(logicToWorldX(p.x), WORLD.groundY, 0);
  attachHeroModel(hero);
  const rig = hero.rig;

  // Run nova: objeto do jogador trocado
  if (p !== hero.player) {
    hero.player = p;
    hero.lastAnimTimer = p.animTimer;
    hero.lastHp = p.hp;
    hero.action = null;
    hero.pendingAnim = null;
    hero.berserk = p.berserking;
    rig?.play("Idle");
  }
  if (!rig) return;
  updateHeroWeapons(hero);

  if (!state.running) {
    if (hero.action !== "death") {
      hero.action = "death";
      rig.play("Death_A", { once: true });
    }
  } else {
    if (hero.action === "death") {
      hero.action = null;
      rig.play("Idle");
    }
    const hurt = hero.hurtEvent || p.hp < hero.lastHp - 1e-6;
    if (p.animTimer > hero.lastAnimTimer + 1) {
      // Nova ação: golpe (anim do item) ou uso de item (player.anim)
      const type = hero.pendingAnim ?? p.anim;
      hero.pendingAnim = null;
      rig.play(HERO_ACTIONS[type] ?? HERO_ACTIONS.slash, {
        once: true,
        restart: true,
        timeScale: ACTION_SPEED,
      });
      hero.action = "action";
    } else if (p.berserking && !hero.berserk && hero.action !== "action") {
      rig.play("Cheer", { once: true, restart: true, timeScale: ACTION_SPEED });
      hero.action = "action";
    } else if (hurt && hero.action !== "action") {
      // Levar dano não interrompe golpe
      rig.play("Hit_A", { once: true, restart: true, timeScale: 1.3 });
      hero.action = "hit";
    }
    if (hurt) hero.flash = 1;
    if (hero.action && rig.finished()) {
      hero.action = null;
      rig.play("Idle");
    }
  }
  hero.hurtEvent = false;
  hero.berserk = p.berserking;
  hero.lastAnimTimer = p.animTimer;
  hero.lastHp = p.hp;
  hero.flash = Math.max(0, hero.flash - dtMs / 200);
  rig.update(dtMs / 1000);
}

// ─── Inimigos ───
function enemyHeight(en) {
  return WORLD.heroHeight * ((en.size || 18) / 18);
}

function laneZ(en) {
  const t = ((en.phase || 0) / (Math.PI * 2)) % 1;
  return (t * 2 - 1) * LANE_Z;
}

function createEnemyRecord(en, group, spawnAllowed) {
  const shape = MODEL_FILES[en.shape] ? en.shape : "minion";
  const rec = {
    shape,
    root: new THREE.Group(),
    rig: null,
    stub: placeholder(enemyHeight(en), PALETTE.bone),
    height: enemyHeight(en),
    baseZ: laneZ(en),
    z: laneZ(en),
    push: 0, // empurrão para trás (+X) para não sobrepor
    x: logicToWorldX(en.x),
    lastAttack: en.attackAnim || 0,
    lastHurt: en.hurtTimer || 0,
    action: null, // null | "attack" | "hit" | "spawn" | "death"
    dead: false,
    sink: 0,
    gone: false,
    // Nasce na tela durante o jogo: sobe do chão
    wantsSpawn: spawnAllowed && en.x < arena.width,
  };
  rec.root.add(rec.stub);
  rec.root.rotation.y = -Math.PI / 2 + YAW_TO_CAMERA; // olha para -X
  group.add(rec.root);
  return rec;
}

function attachEnemyModel(rec) {
  if (rec.rig) return;
  const tpl = requestTemplate(rec.shape);
  if (!tpl) return;
  rec.rig = new Rig(tpl, rec.height, { perInstanceMaterials: true });
  rec.root.remove(rec.stub);
  rec.root.add(rec.rig.model);
  if (rec.dead) {
    rec.rig.play("Death_C_Skeletons", { once: true, timeScale: ENEMY_DEATH_SPEED, fade: 0 });
  } else if (rec.wantsSpawn && rec.rig.has("Spawn_Ground_Skeletons")) {
    rec.rig.play("Spawn_Ground_Skeletons", { once: true, timeScale: SPAWN_SPEED, fade: 0 });
    rec.action = "spawn";
  }
  rec.wantsSpawn = false;
}

function updateEnemyAnim(rec, en) {
  const rig = rec.rig;
  if (en.dead) {
    if (!rec.dead) {
      rec.dead = true;
      rec.action = "death";
      rig?.play("Death_C_Skeletons", { once: true, timeScale: ENEMY_DEATH_SPEED });
    }
    return;
  }
  const attackStart = (en.attackAnim || 0) > rec.lastAttack + 1;
  const hurtStart = en.hurtTimer > 0 && en.hurtTimer > rec.lastHurt;
  rec.lastAttack = en.attackAnim || 0;
  if (!rig) return;
  if (attackStart) {
    rig.play(ENEMY_ATTACK[rec.shape], { once: true, restart: true, timeScale: ENEMY_ATTACK_SPEED });
    rec.action = "attack";
  } else if (hurtStart && rec.action !== "attack" && rec.action !== "spawn") {
    rig.play("Hit_A", { once: true, restart: true, timeScale: 1.3 });
    rec.action = "hit";
  }
  if (rec.action && rig.finished()) rec.action = null;
  if (!rec.action) rig.play(en.moving ? "Walking_D_Skeletons" : "Idle_Combat");
}

// Afasta inimigos vivos que ocupariam o mesmo lugar: primeiro em Z (dentro da
// faixa), depois empurrando para trás em X
function separate(list, dtSec) {
  const ease = Math.min(1, dtSec * 3);
  for (const r of list) {
    r.z += (r.baseZ - r.z) * ease * 0.5;
    r.push = Math.max(0, r.push - dtSec * 0.8);
    r.wx = r.x + r.push;
  }
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.wx - a.wx;
        const dz = b.z - a.z;
        if (Math.abs(dx) >= MIN_SEPARATION || Math.abs(dz) >= MIN_SEPARATION) continue;
        const dir = dz !== 0 ? Math.sign(dz) : i % 2 ? 1 : -1;
        const half = (MIN_SEPARATION - Math.abs(dz)) * 0.5;
        a.z = THREE.MathUtils.clamp(a.z - dir * half, -LANE_Z, LANE_Z);
        b.z = THREE.MathUtils.clamp(b.z + dir * half, -LANE_Z, LANE_Z);
        if (Math.abs(b.z - a.z) < MIN_SEPARATION * 0.9) {
          // Faixa cheia: quem está mais atrás recua
          const back = dx >= 0 ? b : a;
          back.push = Math.min(MAX_PUSH_BACK, back.push + (MIN_SEPARATION - Math.abs(dx)) * 0.5);
          back.wx = back.x + back.push;
        }
      }
    }
  }
}

// ─── API do módulo ───
export function createCharacters(scene) {
  const group = new THREE.Group();
  group.name = "characters";
  scene.add(group);
  const hero = createHero(group);
  const enemies = new Map(); // inimigo (objeto da lógica) -> registro
  // Começa a baixar já: herói e o esqueleto mais comum
  requestTemplate("hero");
  requestTemplate("minion");

  // dtMs: tempo de jogo (já com velocidade) | running: quadro de jogo normal
  // tickHurt: decrementa hurtTimer como o render 2D fazia (1 por quadro desenhado)
  function update(dtMs, { tickHurt = true, allowSpawn = false } = {}) {
    const dtSec = dtMs / 1000;
    updateHero(hero, dtMs);

    const alive = new Set(state.enemies);
    for (const [en, rec] of enemies) {
      if (!alive.has(en)) {
        group.remove(rec.root);
        enemies.delete(en);
      }
    }
    const live = [];
    for (const en of state.enemies) {
      let rec = enemies.get(en);
      if (!rec) {
        rec = createEnemyRecord(en, group, allowSpawn && dtMs > 0);
        enemies.set(en, rec);
      }
      if (rec.gone) continue;
      attachEnemyModel(rec);
      updateEnemyAnim(rec, en);
      // Durante o surgimento o corpo fica parado; depois alcança a posição lógica
      const targetX = logicToWorldX(en.x);
      if (rec.action === "spawn") {
        // segura
      } else if (Math.abs(targetX - rec.x) > 0.02) {
        rec.x += (targetX - rec.x) * Math.min(1, dtSec * 6);
      } else {
        rec.x = targetX;
      }
      if (!en.dead) live.push(rec);
      if (en.dead && rec.action === "death") {
        // Corpo fica até a queda acabar e o tempo lógico zerar, depois afunda
        if ((en.deathAnim || 0) <= 0 && (!rec.rig || rec.rig.finished())) {
          rec.sink += dtSec;
          if (rec.sink >= SINK_TIME) {
            rec.gone = true;
            rec.root.visible = false;
          }
        }
      }
      if (rec.rig) {
        const flash = !en.dead && en.hurtTimer > 0 ? 0.55 * Math.min(1, en.hurtTimer / 12) : 0;
        rec.rig.setFlash(flash);
        rec.rig.update(dtSec);
      }
      if (tickHurt && !en.dead && en.hurtTimer > 0) en.hurtTimer -= 1;
      rec.lastHurt = en.hurtTimer;
    }
    separate(live, dtSec);
    for (const en of state.enemies) {
      const rec = enemies.get(en);
      if (!rec || rec.gone) continue;
      const sinkY = -(rec.sink / SINK_TIME) * rec.height * 0.6;
      rec.root.position.set(en.dead ? rec.x + rec.push : rec.wx, WORLD.groundY + sinkY, rec.z);
    }
    if (hero.rig) hero.rig.setFlash(hero.flash * 0.5);
  }

  // Ponto acima da cabeça (barra de vida e nome)
  function enemyAnchor(en, out) {
    const rec = enemies.get(en);
    if (!rec || rec.gone) return null;
    return out.set(rec.root.position.x, rec.root.position.y + rec.height + 0.3, rec.root.position.z);
  }

  function heroAnchor(out) {
    const p = hero.root.position;
    return out.set(p.x, p.y + WORLD.heroHeight + 0.3, p.z);
  }

  // Profundidade Z para efeitos 2D presos a um x lógico: média dos personagens
  // próximos (peso gaussiano), assim faíscas saem do inimigo certo
  function zAtLogicX(x) {
    const sigma = 28;
    let wSum = 0;
    let zSum = 0;
    const wHero = Math.exp(-(((x - state.player.x) / sigma) ** 2));
    wSum += wHero;
    for (const [en, rec] of enemies) {
      if (rec.gone) continue;
      const w = Math.exp(-(((x - en.x) / sigma) ** 2));
      wSum += w;
      zSum += w * rec.z;
    }
    return wSum > 1e-4 ? zSum / wSum : 0;
  }

  return { update, enemyAnchor, heroAnchor, zAtLogicX, group };
}
