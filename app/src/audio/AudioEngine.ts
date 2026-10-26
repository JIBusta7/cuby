/**
 * Entrada de audio del navegador para el modo LUCES:
 *  - 'mic':  el micrófono de la computadora (getUserMedia). Sin cancelación
 *            de eco ni supresión de ruido: queremos la música tal cual.
 *  - 'tab':  el audio de una pestaña (getDisplayMedia), por ejemplo Spotify
 *            Web Player. Chrome pide elegir la pestaña y tildar "Compartir
 *            audio". En Windows también se puede compartir el audio del sistema.
 * El espectro pasa por AudioAnalyzer (core/audio) ~47 veces por segundo.
 *
 * El análisis lo marca el propio motor de audio (un ScriptProcessor conectado
 * a una salida en silencio), no requestAnimationFrame: así sigue funcionando
 * cuando esta pestaña queda en segundo plano, por ejemplo mientras se usa
 * Spotify en otra pestaña.
 */
import { AudioAnalyzer, type AudioFrame } from '../core/audio/analyzer';

export type AudioSource = 'mic' | 'tab';
export type AudioStatus = 'idle' | 'starting' | 'running' | 'error';

type Listener = (frame: AudioFrame, now: number) => void;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private analyzer: AudioAnalyzer | null = null;
  private processor: ScriptProcessorNode | null = null;
  private readonly listeners = new Set<Listener>();
  private bins: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  status: AudioStatus = 'idle';
  source: AudioSource | null = null;
  error: string | null = null;
  private sensitivity = 1;
  onStatus: ((e: AudioEngine) => void) | null = null;

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  setSensitivity(s: number): void {
    this.sensitivity = s;
    if (this.analyzer) this.analyzer.sensitivity = s;
  }

  async start(source: AudioSource): Promise<void> {
    this.release();
    // El AudioContext se crea YA, dentro del clic del usuario. Si se crea
    // después de esperar el permiso, Chrome lo deja suspendido (política de
    // reproducción automática) y nunca arranca.
    const ctx = new AudioContext();
    void ctx.resume();
    this.ctx = ctx;
    this.setStatus('starting', source, null);
    try {
      const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      if (source === 'mic') {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio });
      } else {
        // Chrome exige pedir video para compartir una pestaña; se descarta enseguida.
        this.stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio,
          // @ts-expect-error opciones de Chrome que todavía no están en los tipos del DOM
          systemAudio: 'include',
          preferCurrentTab: false,
          selfBrowserSurface: 'exclude',
        });
        this.stream.getVideoTracks().forEach((t) => t.stop());
        if (this.stream.getAudioTracks().length === 0) {
          throw new Error('No se compartió audio. Elegí la pestaña de la música y tildá "Compartir audio de la pestaña".');
        }
      }
      this.stream.getAudioTracks()[0]?.addEventListener('ended', () => void this.stop());
      if (this.ctx !== ctx) throw new Error('cancelado'); // otro start()/stop() lo reemplazó
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.45;
      this.analyser.minDecibels = -95;
      this.analyser.maxDecibels = -20;
      src.connect(this.analyser);
      this.bins = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyzer = new AudioAnalyzer({ sampleRate: this.ctx.sampleRate, fftSize: this.analyser.fftSize, sensitivity: this.sensitivity });
      // Reloj del análisis: cada 1024 muestras (~21 ms). La salida va con
      // ganancia 0, así no se escucha nada dos veces.
      this.processor = this.ctx.createScriptProcessor(1024, 1, 1);
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      src.connect(this.processor);
      this.processor.connect(mute);
      mute.connect(this.ctx.destination);
      this.processor.onaudioprocess = this.tick;
      void this.ctx.resume();
      this.setStatus('running', source, null);
    } catch (e) {
      this.release();
      const err = e as DOMException;
      const msg =
        err?.name === 'NotAllowedError'
          ? source === 'mic'
            ? 'Permiso de micrófono denegado. Habilitalo en el candado de la barra de direcciones.'
            : 'Se canceló la captura de la pestaña.'
          : err?.name === 'NotFoundError'
            ? 'No se encontró un micrófono.'
            : (err?.message ?? 'No se pudo abrir el audio');
      this.setStatus('error', source, msg);
    }
  }

  async stop(): Promise<void> {
    this.release();
    if (this.status !== 'error') this.setStatus('idle', null, null);
  }

  /** Libera todo de forma sincrónica (sin esperas que hagan perder el gesto del usuario). */
  private release(): void {
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.processor = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.analyzer = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private tick = (): void => {
    if (!this.analyser || !this.analyzer) return;
    this.analyser.getByteFrequencyData(this.bins);
    const now = performance.now();
    const frame = this.analyzer.process(this.bins, now);
    for (const l of this.listeners) l(frame, now);
  };

  private setStatus(status: AudioStatus, source: AudioSource | null, error: string | null): void {
    this.status = status;
    this.source = source;
    this.error = error;
    this.onStatus?.(this);
  }
}
