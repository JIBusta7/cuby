/**
 * MD5 (RFC 1321). WebCrypto no lo trae y el ESP32 (Update.setMD5) lo usa para
 * verificar que el firmware llegó entero por Bluetooth antes de instalarlo.
 */
const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(data: Uint8Array): string {
  const bitLen = data.length * 8;
  const padLen = ((data.length + 8) >> 6) * 64 + 64;
  const buf = new Uint8Array(padLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 8, bitLen >>> 0, true);
  view.setUint32(padLen - 4, Math.floor(bitLen / 2 ** 32), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i]! + M[g]!) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]!) | (F >>> (32 - S[i]!)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((v, i) => out.setUint32(i * 4, v, true));
  return Array.from(new Uint8Array(out.buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Tamaño de cada espacio de programa (partición min_spiffs: 0x1E0000). */
export const OTA_SLOT_BYTES = 0x1e0000;

/** Chequeos antes de mandar: que sea una imagen de ESP32 y que entre. */
export function checkFirmwareImage(bin: Uint8Array): string | null {
  if (bin.length < 1024) return 'El archivo es demasiado chico para ser un firmware';
  if (bin[0] !== 0xe9) return 'No es un firmware de ESP32 (.bin de PlatformIO: .pio/build/esp32dev/firmware.bin)';
  if (bin.length > OTA_SLOT_BYTES) return `El firmware (${Math.round(bin.length / 1024)} KB) no entra en el espacio de 1,9 MB`;
  return null;
}
