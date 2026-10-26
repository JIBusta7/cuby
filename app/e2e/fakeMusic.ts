/**
 * Reemplaza getUserMedia por una "canción" sintética generada con Web Audio:
 * bombo a 120 BPM, hi-hat y un acorde. Permite probar el modo Sonido sin
 * micrófono (y sin permisos del sistema operativo).
 */
export const FAKE_MUSIC_SCRIPT = `
(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    const out = ctx.createMediaStreamDestination();
    const master = ctx.createGain(); master.gain.value = 0.8; master.connect(out);
    // Acorde de fondo
    for (const f of [220, 277, 330]) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(master); o.start();
    }
    // Bombo cada 500 ms y hi-hat a contratiempo
    const noise = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const schedule = (t0) => {
      for (let i = 0; i < 8; i++) {
        const t = t0 + i * 0.5;
        const k = ctx.createOscillator(); k.frequency.setValueAtTime(110, t); k.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        const kg = ctx.createGain(); kg.gain.setValueAtTime(1, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        k.connect(kg); kg.connect(master); k.start(t); k.stop(t + 0.2);
        const h = ctx.createBufferSource(); h.buffer = noise;
        const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 6000;
        const hg = ctx.createGain(); hg.gain.value = 0.3;
        h.connect(hf); hf.connect(hg); hg.connect(master); h.start(t + 0.25);
      }
      setTimeout(() => schedule(t0 + 4), 3500);
    };
    void ctx.resume();
    schedule(ctx.currentTime + 0.05);
    return out.stream;
  };
})();
`;
