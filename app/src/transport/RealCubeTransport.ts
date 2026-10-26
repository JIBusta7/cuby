/**
 * Conexión con el cubo real por Web Bluetooth (Chrome / Edge de escritorio).
 *
 * Firmware: BLE, Nordic UART Service (no Bluetooth clásico). El cubo notifica
 * líneas JSON por TX, troceadas según el MTU; se reensamblan con LineAssembler.
 * Los comandos se escriben en RX, de a uno (Web Bluetooth no admite dos
 * operaciones GATT simultáneas), con respuesta, para saber cuándo llegaron.
 *
 * Si la conexión se corta sin que el usuario lo pida, se reintenta con espera
 * creciente; mientras tanto el estado es 'reconnecting'.
 */
import { encodeCommand, type CubeCommand } from '../core/protocol/commands';
import { LineAssembler } from '../core/protocol/lineAssembler';
import { parseMessage } from '../core/protocol/messages';
import { CUBE_DEVICE_NAME, LEGACY_DEVICE_NAMES, NUS_RX_UUID, NUS_SERVICE_UUID, NUS_TX_UUID } from '../core/protocol/uuids';
import { ListenerSet, TransportError, type CubeTransport, type TransportListener } from './types';

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator && !!navigator.bluetooth;
}

export class RealCubeTransport implements CubeTransport {
  readonly kind = 'real' as const;

  private readonly listeners = new ListenerSet();
  private readonly assembler = new LineAssembler();
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();
  private device: BluetoothDevice | null = null;
  private rx: BluetoothRemoteGATTCharacteristic | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private pendingWrites = 0;
  private userDisconnect = false;
  private reconnecting = false;

  get deviceName(): string | null {
    return this.device?.name ?? null;
  }

  subscribe(l: TransportListener): () => void {
    return this.listeners.add(l);
  }

  async connect(): Promise<void> {
    if (!isWebBluetoothAvailable()) {
      throw new TransportError('Este navegador no tiene Web Bluetooth. Usá Chrome o Edge de escritorio.', 'unsupported');
    }
    this.userDisconnect = false;
    this.listeners.status('connecting');
    try {
      // Requiere un gesto del usuario (clic): el navegador muestra su selector.
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: CUBE_DEVICE_NAME },
          ...LEGACY_DEVICE_NAMES.map((namePrefix) => ({ namePrefix })),
          { services: [NUS_SERVICE_UUID] },
        ],
        optionalServices: [NUS_SERVICE_UUID],
      });
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
      await this.openGatt();
      this.listeners.status('connected');
    } catch (e) {
      const err = this.toError(e);
      this.listeners.status(err.code === 'cancelled' ? 'idle' : 'error', err.message);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.userDisconnect = true;
    try {
      await this.tx?.stopNotifications();
    } catch {
      /* ya desconectado */
    }
    this.tx?.removeEventListener('characteristicvaluechanged', this.onNotify);
    this.device?.gatt?.disconnect();
    this.rx = null;
    this.tx = null;
    this.listeners.status('disconnected');
  }

  send(cmd: CubeCommand): Promise<void> {
    const data = this.encoder.encode(encodeCommand(cmd) + '\n');
    const run = async () => {
      const rx = this.rx;
      if (!rx || !this.device?.gatt?.connected) throw new TransportError('El cubo no está conectado', 'not-connected');
      try {
        await rx.writeValueWithResponse(data);
      } catch (e) {
        throw new TransportError(`No se pudo enviar ${cmd.type}: ${(e as Error).message}`, 'write');
      }
    };
    // Una escritura por vez; un error no traba la cola.
    this.pendingWrites++;
    const p = this.writeChain.then(run, run).finally(() => this.pendingWrites--);
    this.writeChain = p.catch(() => undefined);
    return p;
  }

  writeRaw(data: Uint8Array): Promise<void> {
    const run = async () => {
      const rx = this.rx;
      if (!rx || !this.device?.gatt?.connected) throw new TransportError('El cubo no está conectado', 'not-connected');
      await rx.writeValueWithResponse(data as Uint8Array<ArrayBuffer>);
    };
    this.pendingWrites++;
    const p = this.writeChain.then(run, run).finally(() => this.pendingWrites--);
    this.writeChain = p.catch(() => undefined);
    return p;
  }

  sendLatest(cmd: CubeCommand): boolean {
    const rx = this.rx;
    if (!rx || !this.device?.gatt?.connected || this.pendingWrites > 0) return false;
    const data = this.encoder.encode(encodeCommand(cmd) + '\n');
    this.pendingWrites++;
    const p = this.writeChain.then(() => rx.writeValueWithoutResponse(data)).finally(() => this.pendingWrites--);
    this.writeChain = p.catch(() => undefined);
    return true;
  }

  private async openGatt(): Promise<void> {
    const gatt = this.device?.gatt;
    if (!gatt) throw new TransportError('El dispositivo no expone GATT', 'gatt');
    const server = await gatt.connect();
    const service = await server.getPrimaryService(NUS_SERVICE_UUID);
    this.rx = await service.getCharacteristic(NUS_RX_UUID);
    this.tx = await service.getCharacteristic(NUS_TX_UUID);
    this.assembler.reset();
    this.tx.addEventListener('characteristicvaluechanged', this.onNotify);
    await this.tx.startNotifications();
  }

  private readonly onNotify = (ev: Event): void => {
    const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const at = performance.now();
    const text = this.decoder.decode(value, { stream: true });
    for (const line of this.assembler.push(text)) {
      const msg = parseMessage(line);
      if (msg) this.listeners.message(msg, at);
      else this.listeners.invalid(line);
    }
  };

  private readonly onDisconnected = (): void => {
    this.rx = null;
    this.tx = null;
    if (this.userDisconnect) return;
    void this.reconnect();
  };

  private async reconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    this.listeners.status('reconnecting');
    for (const wait of RECONNECT_DELAYS_MS) {
      await new Promise((r) => setTimeout(r, wait));
      if (this.userDisconnect) break;
      try {
        await this.openGatt();
        this.reconnecting = false;
        this.listeners.status('connected');
        return;
      } catch {
        /* siguiente intento */
      }
    }
    this.reconnecting = false;
    if (!this.userDisconnect) this.listeners.status('disconnected', 'Se perdió la conexión con el cubo');
  }

  private toError(e: unknown): TransportError {
    if (e instanceof TransportError) return e;
    const err = e as DOMException;
    if (err?.name === 'NotFoundError') {
      return /cancel/i.test(err.message)
        ? new TransportError('Conexión cancelada', 'cancelled')
        : new TransportError('No se encontró el cubo. ¿Está encendido y cerca?', 'not-found');
    }
    if (err?.name === 'SecurityError') {
      return new TransportError('El navegador bloqueó Bluetooth. Abrí la app desde localhost o https.', 'unsupported');
    }
    return new TransportError(err?.message || 'Error de Bluetooth', 'gatt');
  }
}
