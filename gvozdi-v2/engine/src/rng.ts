// Генератор случайных чисел с зерном (sfc32). Состояние — 4 целых uint32, входит в сохранение.

export type RngState = [number, number, number, number];

export function seedRng(seed: number): RngState {
  // splitmix32 разворачивает зерно в 4 слова
  let s = (Math.floor(seed) >>> 0) ^ 0x9e3779b9;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const st: RngState = [next(), next(), next(), next()];
  // прогрев
  for (let i = 0; i < 12; i++) rngNext(st);
  return st;
}

/** Следующее число в [0, 1). Меняет состояние на месте. */
export function rngNext(st: RngState): number {
  let [a, b, c, d] = st;
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) >>> 0;
  st[0] = a >>> 0; st[1] = b >>> 0; st[2] = c >>> 0; st[3] = d >>> 0;
  return t / 4294967296;
}
