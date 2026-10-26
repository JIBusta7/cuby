/**
 * Spotify: qué canción está sonando en tu cuenta (Web API), con login PKCE
 * desde el navegador (sin servidor ni secreto de cliente).
 *
 * Lo que la API da hoy a una app nueva: la canción actual, artista, tapa del
 * disco, progreso y si está sonando. Lo que NO da desde fines de 2024: el
 * análisis de audio (beats, tempo, energía). Por eso el beat sale del audio
 * real (micrófono o captura de pestaña) y los colores de la tapa del disco.
 *
 * Requisitos: crear una app gratuita en developer.spotify.com, copiar su
 * Client ID, y registrar como Redirect URI exactamente la dirección de esta
 * app con 127.0.0.1 (Spotify no acepta "localhost"), por ejemplo
 * http://127.0.0.1:5173/
 */
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-currently-playing user-read-playback-state';
const KEY = 'rgbcube.spotify.v1';
const PKCE_KEY = 'rgbcube.spotify.pkce';

export interface SpotifyTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number; // Date.now() ms
}

export interface SpotifySaved {
  clientId: string;
  tokens: SpotifyTokens | null;
}

export interface Track {
  readonly id: string;
  readonly name: string;
  readonly artists: string;
  readonly album: string;
  readonly imageUrl: string | null;
  readonly isPlaying: boolean;
  readonly progressMs: number;
  readonly durationMs: number;
}

export class SpotifyError extends Error {
  constructor(
    message: string,
    readonly code: 'auth' | 'expired' | 'rate' | 'network' | 'config',
  ) {
    super(message);
  }
}

// ---------- Utilidades puras (con tests) ----------

export function base64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(len = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const rnd = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(rnd, (b) => chars[b % chars.length]).join('');
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** Dirección de vuelta: la de la app, con 127.0.0.1 en lugar de localhost. */
export function redirectUri(loc: { protocol: string; hostname: string; port: string } = location): string {
  const host = loc.hostname === 'localhost' ? '127.0.0.1' : loc.hostname;
  return `${loc.protocol}//${host}${loc.port ? `:${loc.port}` : ''}/`;
}

export function authorizeUrl(clientId: string, challenge: string, state: string, redirect: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirect,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  return `${AUTH_URL}?${q}`;
}

/** Interpreta la respuesta de /me/player/currently-playing (null si no suena nada). */
export function parseCurrentlyPlaying(json: unknown): Track | null {
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  const item = o.item as Record<string, unknown> | null | undefined;
  if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') return null;
  const album = (item.album ?? item.show) as Record<string, unknown> | undefined;
  const images = (album?.images ?? item.images) as { url: string; width?: number }[] | undefined;
  // La imagen más chica de al menos 200 px alcanza para sacar la paleta.
  const img =
    images && images.length > 0
      ? ([...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0)).find((i) => (i.width ?? 0) >= 200) ?? images[0]!)
      : null;
  const artists = Array.isArray(item.artists)
    ? (item.artists as { name?: string }[]).map((a) => a.name).filter(Boolean).join(', ')
    : typeof (item.show as { publisher?: string } | undefined)?.publisher === 'string'
      ? (item.show as { publisher: string }).publisher
      : '';
  return {
    id: item.id,
    name: item.name,
    artists,
    album: typeof album?.name === 'string' ? album.name : '',
    imageUrl: img?.url ?? null,
    isPlaying: o.is_playing === true,
    progressMs: typeof o.progress_ms === 'number' ? o.progress_ms : 0,
    durationMs: typeof item.duration_ms === 'number' ? item.duration_ms : 0,
  };
}

// ---------- Persistencia ----------

export function loadSaved(): SpotifySaved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<SpotifySaved>;
      return { clientId: typeof v.clientId === 'string' ? v.clientId : '', tokens: v.tokens ?? null };
    }
  } catch {
    /* sin almacenamiento */
  }
  return { clientId: '', tokens: null };
}

export function save(s: SpotifySaved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento */
  }
}

// ---------- Flujo de login ----------

export async function beginLogin(clientId: string): Promise<void> {
  if (!/^[0-9a-f]{32}$/i.test(clientId.trim())) throw new SpotifyError('El Client ID tiene 32 caracteres hexadecimales', 'config');
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, clientId: clientId.trim() }));
  location.assign(authorizeUrl(clientId.trim(), await codeChallenge(verifier), state, redirectUri()));
}

/** Si la página volvió de Spotify (?code=…), cambia el código por tokens. */
export async function completeLogin(): Promise<SpotifyTokens | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return null;
  history.replaceState(null, '', location.pathname);
  const pending = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  if (error) throw new SpotifyError(error === 'access_denied' ? 'Cancelaste el acceso a Spotify' : `Spotify: ${error}`, 'auth');
  if (!pending) throw new SpotifyError('Se perdió el estado del login; probá de nuevo', 'auth');
  const { verifier, state, clientId } = JSON.parse(pending) as { verifier: string; state: string; clientId: string };
  if (params.get('state') !== state) throw new SpotifyError('La respuesta de Spotify no coincide con el pedido', 'auth');
  const tokens = await tokenRequest({
    grant_type: 'authorization_code',
    code: code!,
    redirect_uri: redirectUri(),
    client_id: clientId,
    code_verifier: verifier,
  });
  save({ clientId, tokens });
  return tokens;
}

async function tokenRequest(body: Record<string, string>, prevRefresh?: string): Promise<SpotifyTokens> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
  } catch {
    throw new SpotifyError('Sin conexión con Spotify', 'network');
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== 'string') {
    const desc = typeof json.error_description === 'string' ? json.error_description : `HTTP ${res.status}`;
    throw new SpotifyError(`No se pudo iniciar sesión en Spotify: ${desc}`, 'auth');
  }
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : (prevRefresh ?? ''),
    expiresAt: Date.now() + (typeof json.expires_in === 'number' ? json.expires_in : 3600) * 1000 - 30_000,
  };
}

export async function refreshTokens(clientId: string, t: SpotifyTokens): Promise<SpotifyTokens> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: clientId }, t.refreshToken);
}

export async function fetchCurrentlyPlaying(accessToken: string): Promise<Track | null> {
  let res: Response;
  try {
    res = await fetch(`${API}/me/player/currently-playing?additional_types=episode`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new SpotifyError('Sin conexión con Spotify', 'network');
  }
  if (res.status === 204) return null;
  if (res.status === 401) throw new SpotifyError('La sesión de Spotify venció', 'expired');
  if (res.status === 429) throw new SpotifyError('Spotify pidió esperar un poco', 'rate');
  if (!res.ok) throw new SpotifyError(`Spotify respondió ${res.status}`, 'network');
  return parseCurrentlyPlaying(await res.json());
}

/** Paleta desde la tapa (si el navegador permite leer la imagen). */
export async function loadImagePixels(url: string, size = 48): Promise<Uint8ClampedArray | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const g = c.getContext('2d');
        if (!g) return resolve(null);
        g.drawImage(img, 0, 0, size, size);
        resolve(g.getImageData(0, 0, size, size).data);
      } catch {
        resolve(null); // imagen sin CORS: no se puede leer
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
