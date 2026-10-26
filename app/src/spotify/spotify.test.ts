import { describe, expect, it } from 'vitest';
import { authorizeUrl, base64url, codeChallenge, parseCurrentlyPlaying, redirectUri } from './spotify';

describe('Spotify', () => {
  it('PKCE: el challenge es SHA-256 en base64url (vector de la RFC 7636)', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(base64url(new Uint8Array([251, 255]))).toBe('-_8');
  });
  it('la dirección de vuelta usa 127.0.0.1 en lugar de localhost', () => {
    expect(redirectUri({ protocol: 'http:', hostname: 'localhost', port: '5173' })).toBe('http://127.0.0.1:5173/');
    expect(redirectUri({ protocol: 'https:', hostname: 'cubo.app', port: '' })).toBe('https://cubo.app/');
  });
  it('arma la URL de autorización con los permisos mínimos', () => {
    const u = new URL(authorizeUrl('abc', 'ch', 'st', 'http://127.0.0.1:5173/'));
    expect(u.searchParams.get('scope')).toBe('user-read-currently-playing user-read-playback-state');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5173/');
  });
  it('lee la canción actual y elige una tapa mediana', () => {
    const t = parseCurrentlyPlaying({
      is_playing: true,
      progress_ms: 42000,
      item: {
        id: 'track1',
        name: 'De música ligera',
        duration_ms: 210000,
        artists: [{ name: 'Soda Stereo' }],
        album: {
          name: 'Canción animal',
          images: [
            { url: 'big', width: 640 },
            { url: 'mid', width: 300 },
            { url: 'small', width: 64 },
          ],
        },
      },
    });
    expect(t).toMatchObject({ id: 'track1', artists: 'Soda Stereo', imageUrl: 'mid', isPlaying: true, durationMs: 210000 });
  });
  it('devuelve null si no suena nada o la respuesta es rara', () => {
    expect(parseCurrentlyPlaying(null)).toBeNull();
    expect(parseCurrentlyPlaying({ is_playing: false, item: null })).toBeNull();
    expect(parseCurrentlyPlaying({ item: { name: 'sin id' } })).toBeNull();
  });
});
