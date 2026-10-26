/** Lectura/escritura segura de localStorage: puede no existir o fallar (modo privado). */
export function loadJson<T>(key: string, fallback: T, validate: (v: unknown) => v is T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return fallback;
    const v: unknown = JSON.parse(raw);
    return validate(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: la app sigue funcionando sin recordar preferencias */
  }
}
