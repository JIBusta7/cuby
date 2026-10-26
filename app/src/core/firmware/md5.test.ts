import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { checkFirmwareImage, md5 } from './md5';

const enc = (s: string) => new TextEncoder().encode(s);

describe('md5', () => {
  it('vectores de la RFC 1321', () => {
    expect(md5(enc(''))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5(enc('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5(enc('message digest'))).toBe('f96b697d7cb7938d525a2f31aaf161d0');
    expect(md5(enc('12345678901234567890123456789012345678901234567890123456789012345678901234567890'))).toBe(
      '57edf4a22be3c955ac49da2e2107b67a',
    );
  });
  it('coincide con el de Node en un binario grande y en los bordes de bloque', () => {
    for (const n of [55, 56, 63, 64, 65, 1_228_256]) {
      const data = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 0xff);
      expect(md5(data), `n=${n}`).toBe(createHash('md5').update(data).digest('hex'));
    }
  });
  it('valida la imagen del ESP32', () => {
    const ok = new Uint8Array(4096);
    ok[0] = 0xe9;
    expect(checkFirmwareImage(ok)).toBeNull();
    expect(checkFirmwareImage(new Uint8Array(4096))).toMatch(/No es un firmware/);
    const big = new Uint8Array(0x1e0001);
    big[0] = 0xe9;
    expect(checkFirmwareImage(big)).toMatch(/no entra/);
  });
});
