/* ============================================================
 * audio.js — procedural SFX via Web Audio. No asset files.
 * Every sound is synthesised, so there is nothing to download
 * and nothing to load. Degrades to silence if unsupported.
 * ============================================================ */

const SFX = (() => {
  let ac = null;
  let master = null;
  let comp = null;
  let enabled = true;
  let ready = false;
  let voices = 0;
  const MAX_VOICES = 28;          // stop a full screen of towers melting the CPU
  const lastPlay = Object.create(null);

  function init() {
    if (ready || typeof window === 'undefined') return ready;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { enabled = false; return false; }
    try {
      ac = new Ctor();
      comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 22;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.22;

      master = ac.createGain();
      master.gain.value = 0.55;

      // gentle high-shelf so a hundred gunfire hits are not piercing
      const shelf = ac.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 6200;
      shelf.gain.value = -3.5;

      master.connect(shelf);
      shelf.connect(comp);
      comp.connect(ac.destination);
      ready = true;
    } catch (e) {
      enabled = false;
      ready = false;
    }
    return ready;
  }

  /* Browsers block audio until a user gesture. Called on first input. */
  function unlock() {
    if (!init()) return;
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  }

  function canPlay(name, minGap) {
    if (!enabled || !ready) return false;
    if (ac.state !== 'running') return false;
    if (voices >= MAX_VOICES) return false;
    const now = ac.currentTime;
    if (minGap && lastPlay[name] && now - lastPlay[name] < minGap) return false;
    lastPlay[name] = now;
    return true;
  }

  /* ---- primitives ---------------------------------------------------- */

  function tone({ freq = 440, to = null, dur = 0.12, type = 'sine',
                  gain = 0.3, attack = 0.004, dest = null }) {
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g);
    g.connect(dest || master);
    voices++;
    osc.onended = () => { voices--; };
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /* Filtered noise burst — the backbone of every impact and gunshot. */
  function noise({ dur = 0.12, gain = 0.3, f0 = 1800, f1 = null,
                   q = 1, type = 'lowpass', dest = null }) {
    const t = ac.currentTime;
    const n = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buf;

    const flt = ac.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f0, t);
    if (f1 != null) flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    flt.Q.value = q;

    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(flt);
    flt.connect(g);
    g.connect(dest || master);
    voices++;
    src.onended = () => { voices--; };
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---- named sounds -------------------------------------------------- */

  const api = {
    unlock,

    get enabled() { return enabled; },

    toggle() {
      enabled = !enabled;
      if (enabled) unlock();
      if (master) master.gain.setTargetAtTime(enabled ? 0.55 : 0, ac.currentTime, 0.02);
      return enabled;
    },

    click() {
      if (!canPlay('click', 0.03)) return;
      tone({ freq: 660, to: 900, dur: 0.05, type: 'triangle', gain: 0.1 });
    },

    deny() {
      if (!canPlay('deny', 0.18)) return;
      tone({ freq: 190, to: 120, dur: 0.16, type: 'square', gain: 0.12 });
    },

    /* --- building --- */
    place() {
      if (!canPlay('place', 0.04)) return;
      noise({ dur: 0.16, gain: 0.24, f0: 900, f1: 180, q: 1.4 });
      tone({ freq: 150, to: 92, dur: 0.2, type: 'sine', gain: 0.3 });
      tone({ freq: 420, to: 300, dur: 0.09, type: 'triangle', gain: 0.08 });
    },

    upgrade() {
      if (!canPlay('upgrade', 0.05)) return;
      [523, 659, 784, 1046].forEach((f, i) =>
        setTimeout(() => tone({ freq: f, dur: 0.14, type: 'triangle', gain: 0.16 }), i * 55));
      noise({ dur: 0.3, gain: 0.05, f0: 3000, f1: 8000, type: 'highpass' });
    },

    sell() {
      if (!canPlay('sell', 0.05)) return;
      [880, 1175].forEach((f, i) =>
        setTimeout(() => tone({ freq: f, dur: 0.12, type: 'square', gain: 0.09 }), i * 70));
      noise({ dur: 0.14, gain: 0.1, f0: 5200, type: 'highpass' });
    },

    /* --- gunfire, one voice per tower type --- */
    shoot(type) {
      switch (type) {
        case 'gunner':
          if (!canPlay('gunner', 0.026)) return;
          noise({ dur: 0.07, gain: 0.2, f0: rnd(2400, 3200), f1: 700, q: 1.1 });
          tone({ freq: rnd(150, 190), to: 80, dur: 0.06, type: 'square', gain: 0.11 });
          break;
        case 'cannon':
          if (!canPlay('cannon', 0.05)) return;
          noise({ dur: 0.3, gain: 0.34, f0: 700, f1: 90, q: 0.9 });
          tone({ freq: rnd(78, 96), to: 34, dur: 0.34, type: 'sine', gain: 0.42 });
          tone({ freq: 160, to: 60, dur: 0.12, type: 'triangle', gain: 0.14 });
          break;
        case 'frost':
          if (!canPlay('frost', 0.05)) return;
          noise({ dur: 0.22, gain: 0.13, f0: 2600, f1: 7000, q: 3.5, type: 'bandpass' });
          tone({ freq: rnd(1500, 1750), to: 2400, dur: 0.16, type: 'sine', gain: 0.09 });
          break;
        case 'tesla':
          if (!canPlay('tesla', 0.04)) return;
          noise({ dur: 0.16, gain: 0.2, f0: 3400, f1: 900, q: 6, type: 'bandpass' });
          tone({ freq: rnd(90, 140), to: 420, dur: 0.13, type: 'sawtooth', gain: 0.1 });
          break;
        case 'sniper':
          if (!canPlay('sniper', 0.05)) return;
          noise({ dur: 0.4, gain: 0.3, f0: 4200, f1: 260, q: 0.8 });
          tone({ freq: rnd(210, 250), to: 48, dur: 0.3, type: 'sine', gain: 0.34 });
          tone({ freq: 3200, to: 900, dur: 0.05, type: 'square', gain: 0.07 });
          break;
        default:
          api.click();
      }
    },

    /* --- combat feedback --- */
    hit() {
      if (!canPlay('hit', 0.035)) return;
      noise({ dur: 0.05, gain: 0.09, f0: rnd(1200, 2000), f1: 500 });
    },

    kill() {
      if (!canPlay('kill', 0.03)) return;
      noise({ dur: 0.16, gain: 0.17, f0: rnd(900, 1500), f1: 160, q: 1.2 });
      tone({ freq: rnd(300, 380), to: 110, dur: 0.14, type: 'triangle', gain: 0.13 });
    },

    bossDie() {
      if (!canPlay('bossDie', 0.3)) return;
      noise({ dur: 1.1, gain: 0.4, f0: 1400, f1: 60, q: 0.7 });
      tone({ freq: 130, to: 28, dur: 1.3, type: 'sine', gain: 0.46 });
      tone({ freq: 72, to: 24, dur: 1.5, type: 'triangle', gain: 0.3 });
      setTimeout(() => noise({ dur: 0.5, gain: 0.18, f0: 600, f1: 120 }), 120);
    },

    leak() {
      if (!canPlay('leak', 0.12)) return;
      tone({ freq: 440, to: 300, dur: 0.28, type: 'square', gain: 0.2 });
      setTimeout(() => tone({ freq: 330, to: 220, dur: 0.32, type: 'square', gain: 0.18 }), 90);
      noise({ dur: 0.4, gain: 0.1, f0: 800, f1: 300 });
    },

    /* --- flow --- */
    waveStart() {
      if (!canPlay('waveStart', 0.2)) return;
      // rising war horn
      tone({ freq: 196, to: 294, dur: 0.5, type: 'sawtooth', gain: 0.2, attack: 0.06 });
      tone({ freq: 294, to: 392, dur: 0.5, type: 'sawtooth', gain: 0.13, attack: 0.08 });
      noise({ dur: 0.6, gain: 0.07, f0: 400, f1: 1600, type: 'bandpass', q: 2 });
    },

    waveClear() {
      if (!canPlay('waveClear', 0.2)) return;
      [523, 659, 784, 1046, 1318].forEach((f, i) =>
        setTimeout(() => tone({ freq: f, dur: 0.24, type: 'triangle', gain: 0.15 }), i * 70));
    },

    gameOver() {
      if (!canPlay('gameOver', 0.5)) return;
      [392, 330, 262, 196].forEach((f, i) =>
        setTimeout(() => tone({ freq: f, dur: 0.55, type: 'sawtooth', gain: 0.2 }), i * 190));
      noise({ dur: 1.6, gain: 0.14, f0: 700, f1: 60 });
    },

    victory() {
      if (!canPlay('victory', 0.5)) return;
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
        setTimeout(() => {
          tone({ freq: f, dur: 0.34, type: 'triangle', gain: 0.19 });
          tone({ freq: f / 2, dur: 0.34, type: 'sine', gain: 0.12 });
        }, i * 130));
    },
  };

  return api;
})();
