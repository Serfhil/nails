// Свой генератор стратегий (mulberry32). Генератор движка не трогаем:
// у стратегии отдельное зерно, производное от зерна прогона.
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed * 2654435761 + 0x9e3779b9) >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(list: readonly T[]): T {
    return list[this.int(list.length)];
  }
}
