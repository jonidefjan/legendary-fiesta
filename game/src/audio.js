// ═══════════════════════════════════════════
//  SOUND EFFECTS (WebAudio, tudo sintetizado)
// ═══════════════════════════════════════════
const MASTER_VOL = 0.6;
const MIN_GAP_MS = 45; // mesmo som repetido antes disso é ignorado
const WINDOW_MS = 100;
const SOFT_CAP = 12; // acima disso, descarta sons de baixa prioridade
const HARD_CAP = 20; // acima disso, descarta tudo menos prioridade alta

export const sfx = (() => {
  let actx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  const lastPlayed = new Map();
  let recent = [];

  function getCtx() {
    if (!actx) {
      if (typeof window === "undefined") return null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOL;
      master.connect(actx.destination);
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }

  // Ruído branco em cache (1 s), criado uma vez
  function getNoise(a) {
    if (!noiseBuf) {
      const len = a.sampleRate || 44100;
      noiseBuf = a.createBuffer(1, len, len);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // Oscilador com envelope; attack > 0 suaviza o início
  function tone(a, freq, dur, type = "square", vol = 0.04, slideTo = 0, delay = 0, attack = 0, detune = 0) {
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (detune) osc.detune.setValueAtTime(detune, t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    if (attack > 0) {
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    } else {
      gain.gain.setValueAtTime(vol, t0);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Rajada de ruído filtrada, com varredura de frequência opcional
  function noise(a, dur, vol, ftype, f0, f1 = 0, q = 1, delay = 0) {
    const t0 = a.currentTime + delay;
    const src = a.createBufferSource();
    src.buffer = getNoise(a);
    const filt = a.createBiquadFilter();
    const gain = a.createGain();
    filt.type = ftype;
    filt.Q.setValueAtTime(q, t0);
    filt.frequency.setValueAtTime(f0, t0);
    if (f1 > 0) filt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // Limitador: intervalo mínimo por chave + teto de vozes simultâneas
  // priority: 0 = baixa (dot), 1 = normal, 2 = alta (kill, death...)
  function play(key, priority, fn) {
    if (muted) return;
    try {
      const now = Date.now();
      const last = lastPlayed.get(key);
      if (last !== undefined && now - last < MIN_GAP_MS) return;
      recent = recent.filter((t) => now - t < WINDOW_MS);
      if (priority === 0 && recent.length > SOFT_CAP) return;
      if (priority < 2 && recent.length > HARD_CAP) return;
      const a = getCtx();
      if (!a) return;
      lastPlayed.set(key, now);
      recent.push(now);
      fn(a);
    } catch (e) {
      /* áudio é opcional — nunca quebra o jogo */
    }
  }

  const HITS = {
    physical: (a) => {
      noise(a, 0.06, 0.05, "lowpass", 1800, 400, 0.7);
      tone(a, 150, 0.06, "square", 0.035, 80);
    },
    fire: (a) => {
      noise(a, 0.16, 0.06, "bandpass", 2400, 500, 1.5);
      noise(a, 0.05, 0.03, "highpass", 5000, 0, 0.7, 0.04);
    },
    ice: (a) => {
      tone(a, 1500, 0.12, "triangle", 0.04, 2600);
      noise(a, 0.025, 0.02, "highpass", 7000);
    },
    lightning: (a) => {
      tone(a, 1200, 0.09, "sawtooth", 0.03, 150);
      tone(a, 700, 0.03, "square", 0.025);
      tone(a, 1400, 0.03, "square", 0.02, 500, 0.03);
      tone(a, 400, 0.04, "square", 0.02, 150, 0.06);
    },
    shadow: (a) => {
      tone(a, 220, 0.22, "sawtooth", 0.03, 70, 0, 0.04, -12);
      tone(a, 220, 0.22, "sawtooth", 0.03, 70, 0, 0.04, 12);
    },
    water: (a) => {
      tone(a, 700, 0.1, "sine", 0.05, 220);
    },
    poison: (a) => {
      tone(a, 260, 0.06, "sine", 0.045, 420);
      tone(a, 200, 0.07, "sine", 0.045, 360, 0.07);
    },
    holy: (a) => {
      tone(a, 880, 0.18, "sine", 0.04);
      tone(a, 880, 0.18, "triangle", 0.015);
      tone(a, 1175, 0.26, "sine", 0.04, 0, 0.09);
      tone(a, 1175, 0.26, "triangle", 0.015, 0, 0.09);
    },
  };

  const USES = {
    blockNext: (a) => {
      tone(a, 1100, 0.14, "triangle", 0.05, 900);
      tone(a, 3300, 0.05, "sine", 0.02);
    },
    coldAura: (a) => {
      [392, 494, 587, 784].forEach((f, i) => {
        tone(a, f, 0.35, "sine", 0.03, 0, i * 0.05);
        tone(a, f * 1.005, 0.35, "triangle", 0.012, 0, i * 0.05);
      });
    },
    heal: (a) => {
      tone(a, 520, 0.12, "sine", 0.04, 780);
      tone(a, 660, 0.12, "sine", 0.035, 990, 0.08);
      tone(a, 880, 0.18, "sine", 0.03, 0, 0.16);
    },
    echo: (a) => {
      tone(a, 1568, 0.09, "sine", 0.025);
      tone(a, 2093, 0.09, "sine", 0.02, 0, 0.05);
      tone(a, 2637, 0.12, "sine", 0.015, 0, 0.1);
    },
    emberSkin: (a) => noise(a, 0.12, 0.02, "bandpass", 2500, 1200, 1.2),
    frenzy: (a) => {
      tone(a, 110, 0.28, "sawtooth", 0.045, 330, 0, 0.02);
      tone(a, 112, 0.28, "sawtooth", 0.03, 340);
      noise(a, 0.2, 0.025, "bandpass", 400, 1500, 2);
    },
  };

  const DOTS = {
    burning: (a) => noise(a, 0.04, 0.02, "bandpass", 3000, 1500, 1.2),
    poison: (a) => tone(a, 240, 0.04, "sine", 0.018, 380),
    bleeding: (a) => tone(a, 170, 0.05, "sine", 0.02, 90),
  };

  const api = {
    toggleMute() {
      muted = !muted;
      try {
        if (master) master.gain.value = muted ? 0 : MASTER_VOL;
      } catch (e) {
        /* ignorado */
      }
      return muted;
    },
    hit(element = "physical") {
      const key = HITS[element] ? element : "physical";
      play("hit:" + key, 1, HITS[key]);
    },
    use(effectType) {
      const fn =
        USES[effectType] ||
        ((a) => tone(a, 600, 0.06, "sine", 0.03, 700));
      play("use:" + (USES[effectType] ? effectType : "default"), 1, fn);
    },
    dot(type) {
      const fn = DOTS[type] || DOTS.bleeding;
      play("dot:" + (DOTS[type] ? type : "bleeding"), 0, fn);
    },
    revive() {
      play("revive", 2, (a) => {
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
          tone(a, f, 0.2, "triangle", 0.045, 0, i * 0.07);
          tone(a, f * 2, 0.12, "sine", 0.015, 0, i * 0.07);
        });
      });
    },
    // ─── Chefes ───
    // Lich invoca: sussurro grave subindo + sinos frios
    summon() {
      play("summon", 2, (a) => {
        tone(a, 110, 0.6, "sawtooth", 0.03, 220, 0, 0.15, 7);
        noise(a, 0.5, 0.02, "bandpass", 400, 1600, 3);
        [880, 740, 988].forEach((f, i) => tone(a, f, 0.25, "sine", 0.02, 0, 0.25 + i * 0.09));
      });
    },
    // Senhor Demônio: explosão de fogo (ruído grave descendo + estalo)
    nova() {
      play("nova", 2, (a) => {
        noise(a, 0.7, 0.06, "lowpass", 2400, 120, 1);
        tone(a, 140, 0.5, "sawtooth", 0.04, 45);
        noise(a, 0.12, 0.04, "highpass", 3000, 0, 1, 0.05);
      });
    },
    // Fúria: rugido rouco subindo
    enrage() {
      play("enrage", 2, (a) => {
        tone(a, 70, 0.8, "sawtooth", 0.05, 160, 0, 0.1, 12);
        tone(a, 72, 0.8, "square", 0.025, 150, 0, 0.1, -12);
        noise(a, 0.6, 0.025, "bandpass", 300, 900, 2);
      });
    },
    // ─── Fase 4 ───
    // Crítico: estalo agudo e seco
    crit() {
      play("crit", 2, (a) => {
        tone(a, 1800, 0.07, "square", 0.04, 700);
        noise(a, 0.05, 0.04, "highpass", 4500, 0, 0.8);
        tone(a, 220, 0.08, "square", 0.035, 110);
      });
    },
    // Esquiva: sopro rápido
    dodge() {
      play("dodge", 1, (a) => {
        noise(a, 0.14, 0.04, "bandpass", 500, 2800, 1.4);
      });
    },
    // Congelar: sino gelado + estalinhos de cristal
    freeze() {
      play("freeze", 1, (a) => {
        tone(a, 2093, 0.3, "sine", 0.03, 0, 0, 0.005);
        tone(a, 3136, 0.22, "triangle", 0.02, 0, 0.04);
        noise(a, 0.03, 0.025, "highpass", 8000);
        noise(a, 0.03, 0.02, "highpass", 7000, 0, 1, 0.07);
      });
    },
    // Cristal estilhaça: caco agudo + estrondo grave
    explode() {
      play("explode", 2, (a) => {
        noise(a, 0.18, 0.05, "highpass", 6000, 3000, 0.8);
        [2637, 3322, 3951].forEach((f, i) => tone(a, f, 0.16, "triangle", 0.02, f * 0.7, i * 0.02));
        tone(a, 120, 0.4, "sawtooth", 0.05, 40);
        noise(a, 0.35, 0.05, "lowpass", 1400, 100, 1);
      });
    },
    // Contágio: o fogo salta para outro inimigo (chiado curto subindo)
    spread() {
      play("spread", 1, (a) => {
        noise(a, 0.2, 0.05, "bandpass", 1200, 3200, 1.4);
        tone(a, 330, 0.16, "triangle", 0.03, 660);
      });
    },
    enemyHit() {
      play("enemyHit", 1, (a) => {
        tone(a, 160, 0.1, "sawtooth", 0.035, 90);
        noise(a, 0.05, 0.025, "lowpass", 1200, 300);
      });
    },
    block() {
      play("block", 1, (a) => tone(a, 900, 0.07, "triangle", 0.05, 500));
    },
    kill() {
      play("kill", 2, (a) => tone(a, 300, 0.16, "square", 0.04, 620));
    },
    heal() {
      api.use("heal");
    },
    waveClear() {
      play("waveClear", 2, (a) => {
        tone(a, 392, 0.12, "triangle", 0.05);
        tone(a, 523, 0.2, "triangle", 0.05, 0, 0.12);
      });
    },
    reward() {
      play("reward", 2, (a) => {
        tone(a, 523, 0.1, "sine", 0.05);
        tone(a, 659, 0.1, "sine", 0.05, 0, 0.1);
        tone(a, 784, 0.18, "sine", 0.05, 0, 0.2);
      });
    },
    death() {
      play("death", 2, (a) => tone(a, 220, 0.6, "sawtooth", 0.05, 55));
    },
  };
  return api;
})();
