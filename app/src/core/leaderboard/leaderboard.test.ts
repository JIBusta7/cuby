import { describe, expect, it } from 'vitest';
import { LocalLeaderboardRepository, type KeyValueStore } from './localRepository';
import type { NewEntry } from './types';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const entry = (over: Partial<NewEntry>): NewEntry => ({
  board: 'precision',
  player: 'Ana',
  score: 9000,
  elapsedMs: 5000,
  accuracy: 90,
  rules: 'r',
  source: 'mock',
  ...over,
});

describe('LocalLeaderboardRepository', () => {
  it('guarda, ordena y devuelve el puesto', async () => {
    const repo = new LocalLeaderboardRepository(memoryStore());
    await repo.add(entry({ player: 'Ana', accuracy: 90 }));
    const r = await repo.add(entry({ player: 'Beto', accuracy: 95 }));
    expect(r.rank).toBe(1);
    expect(r.total).toBe(2);
    const list = await repo.list('precision');
    expect(list.map((e) => e.player)).toEqual(['Beto', 'Ana']);
  });
  it('separa los tableros por modo', async () => {
    const repo = new LocalLeaderboardRepository(memoryStore());
    await repo.add(entry({ board: 'timed', elapsedMs: 3000 }));
    await repo.add(entry({ board: 'timed', elapsedMs: 2000, player: 'Rápida' }));
    expect(await repo.list('precision')).toHaveLength(0);
    expect((await repo.list('timed'))[0]?.player).toBe('Rápida');
  });
  it('sobrevive a datos corruptos', async () => {
    const repo = new LocalLeaderboardRepository(memoryStore({ 'rgbcube.leaderboard.v1': '{no es json' }));
    expect(await repo.list('precision')).toEqual([]);
    const repo2 = new LocalLeaderboardRepository(
      memoryStore({ 'rgbcube.leaderboard.v1': JSON.stringify([{ basura: true }, 3]) }),
    );
    expect(await repo2.list('precision')).toEqual([]);
  });
  it('borra un tablero o todos', async () => {
    const repo = new LocalLeaderboardRepository(memoryStore());
    await repo.add(entry({}));
    await repo.add(entry({ board: 'timed' }));
    await repo.clear('precision');
    expect(await repo.list('precision')).toHaveLength(0);
    expect(await repo.list('timed')).toHaveLength(1);
    await repo.clear();
    expect(await repo.list('timed')).toHaveLength(0);
  });
  it('sin almacenamiento disponible, falla al guardar con un error claro', async () => {
    const repo = new LocalLeaderboardRepository(null);
    expect(await repo.list('precision')).toEqual([]);
    await expect(repo.add(entry({}))).rejects.toThrow(/almacenamiento/);
  });
});
