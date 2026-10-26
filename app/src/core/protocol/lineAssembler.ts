/**
 * Reensambla líneas a partir de los paquetes BLE. Con un MTU chico el firmware
 * parte cada línea JSON en varias notificaciones; acá se acumulan y se cortan
 * por '\n'. Si se acumula basura sin salto de línea, se descarta para no crecer
 * sin límite.
 */
export class LineAssembler {
  private buffer = '';

  constructor(private readonly maxLength = 1024) {}

  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    let nl = this.buffer.indexOf('\n');
    while (nl !== -1) {
      const line = this.buffer.slice(0, nl).replace(/\r$/, '');
      if (line.length > 0) lines.push(line);
      this.buffer = this.buffer.slice(nl + 1);
      nl = this.buffer.indexOf('\n');
    }
    if (this.buffer.length > this.maxLength) this.buffer = '';
    return lines;
  }

  reset(): void {
    this.buffer = '';
  }
}
