// ═══════════════════════════════════════════
//  SOUND EFFECTS (WebAudio)
// ═══════════════════════════════════════════
export const sfx = (() => {
  let actx = null;
  let muted = false;

  function getCtx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }

  function tone(freq, dur, type = "square", vol = 0.04, slideTo = 0, delay = 0) {
    if (muted) return;
    const a = getCtx();
    if (!a) return;
    try {
      const t0 = a.currentTime + delay;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo > 0) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      }
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    } catch (e) {
      /* áudio é opcional — nunca quebra o jogo */
    }
  }

  return {
    toggleMute() {
      muted = !muted;
      return muted;
    },
    hit() {
      tone(220, 0.08, "square", 0.03, 140);
    },
    enemyHit() {
      tone(160, 0.1, "sawtooth", 0.03, 90);
    },
    block() {
      tone(900, 0.07, "triangle", 0.05, 500);
    },
    kill() {
      tone(300, 0.16, "square", 0.04, 620);
    },
    heal() {
      tone(520, 0.12, "sine", 0.04, 780);
    },
    waveClear() {
      tone(392, 0.12, "triangle", 0.05);
      tone(523, 0.2, "triangle", 0.05, 0, 0.12);
    },
    reward() {
      tone(523, 0.1, "sine", 0.05);
      tone(659, 0.1, "sine", 0.05, 0, 0.1);
      tone(784, 0.18, "sine", 0.05, 0, 0.2);
    },
    death() {
      tone(220, 0.6, "sawtooth", 0.05, 55);
    },
  };
})();
