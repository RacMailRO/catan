/**
 * Deterministic Seeded PRNG (Mulberry32 + FNV-1a string hashing)
 * Guarantees 100% reproducible dice rolls, card draws, steals, and map generation across platforms.
 */

export function hashSeedToUint32(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h === 0 ? 0x9e3779b9 : h >>> 0;
}

export function nextPrngFloat(state: number): { value: number; nextState: number } {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
}

export function nextPrngInt(
  state: number,
  minInclusive: number,
  maxInclusive: number
): { value: number; nextState: number } {
  const { value, nextState } = nextPrngFloat(state);
  const span = maxInclusive - minInclusive + 1;
  const intVal = minInclusive + Math.floor(value * span);
  return {
    value: Math.min(maxInclusive, intVal),
    nextState
  };
}

export function shuffleWithPrng<T>(
  items: readonly T[],
  state: number
): { items: T[]; nextState: number } {
  const copy = [...items];
  let currentState = state;
  for (let i = copy.length - 1; i > 0; i--) {
    const res = nextPrngInt(currentState, 0, i);
    currentState = res.nextState;
    const j = res.value;
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return { items: copy, nextState: currentState };
}

export function computeStateHash(state: unknown): string {
  const str = JSON.stringify(state);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
