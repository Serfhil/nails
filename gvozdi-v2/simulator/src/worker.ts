// Поток-исполнитель: получает пачки зёрен, возвращает итоги прогонов.
import { parentPort, workerData } from "node:worker_threads";
import type { Pack } from "../../engine/src/index.ts";
import { loadPack } from "../../validator/src/index.ts";
import { packFacts, readHints } from "./hints.ts";
import { runOne } from "./run.ts";
import type { StrategyName } from "./strategies.ts";

export interface Task { id: number; strategy: StrategyName; seeds: number[]; cap: number }
export interface Done { id: number; results?: SerialRun[]; error?: string }
export type SerialRun = Omit<ReturnType<typeof runOne>, "covered"> & { covered: string[] };

const { dir } = workerData as { dir: string };
const pack = loadPack(dir).pack as unknown as Pack;
const hints = readHints(pack);
const facts = packFacts(pack);

parentPort!.on("message", (t: Task) => {
  try {
    const results = t.seeds.map((s) => {
      const r = runOne(pack, hints, facts, t.strategy, s, t.cap);
      return { ...r, covered: [...r.covered] };
    });
    parentPort!.postMessage({ id: t.id, results } satisfies Done);
  } catch (e) {
    parentPort!.postMessage({ id: t.id, error: (e as Error).message } satisfies Done);
  }
});
