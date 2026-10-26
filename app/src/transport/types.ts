/**
 * Interfaz de transporte con el cubo. El juego y la UI solo hablan con esto;
 * no saben si del otro lado hay un ESP32 por Bluetooth o el simulador.
 */
import type { CubeCommand } from '../core/protocol/commands';
import type { CubeMessage } from '../core/protocol/messages';

export type TransportKind = 'mock' | 'real';
export type LinkStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface TransportListener {
  /** Mensaje ya validado y la hora local (performance.now) en que llegó. */
  message?(msg: CubeMessage, at: number): void;
  status?(status: LinkStatus, detail?: string): void;
  /** Una línea llegó pero no se pudo interpretar (diagnóstico). */
  invalid?(line: string): void;
}

export interface CubeTransport {
  readonly kind: TransportKind;
  /** Nombre del dispositivo conectado, si hay. */
  readonly deviceName: string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Resuelve cuando el comando llegó al cubo (escritura con respuesta en BLE). */
  send(cmd: CubeCommand): Promise<void>;
  /**
   * Envío rápido sin confirmación, para datos en tiempo real (cuadros de
   * audio). Si el enlace está ocupado se descarta y devuelve false: siempre
   * importa el cuadro más nuevo, no los viejos.
   */
  sendLatest(cmd: CubeCommand): boolean;
  /** Bytes en crudo por la característica de comandos (actualización de firmware), con confirmación. */
  writeRaw(data: Uint8Array): Promise<void>;
  subscribe(listener: TransportListener): () => void;
}

export class TransportError extends Error {
  constructor(
    message: string,
    readonly code: 'unsupported' | 'cancelled' | 'not-found' | 'gatt' | 'not-connected' | 'write' | 'ota',
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

/** Fan-out de eventos compartido por las implementaciones. */
export class ListenerSet {
  private readonly set = new Set<TransportListener>();

  add(l: TransportListener): () => void {
    this.set.add(l);
    return () => this.set.delete(l);
  }

  message(msg: CubeMessage, at: number): void {
    for (const l of this.set) l.message?.(msg, at);
  }

  status(s: LinkStatus, detail?: string): void {
    for (const l of this.set) l.status?.(s, detail);
  }

  invalid(line: string): void {
    for (const l of this.set) l.invalid?.(line);
  }
}
