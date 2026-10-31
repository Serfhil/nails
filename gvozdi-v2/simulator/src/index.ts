// Публичный вход симулятора (библиотека; CLI — cli.ts).
import type { Pack } from "../../engine/src/index.ts";
import { formatProblems, hasErrors, loadPack } from "../../validator/src/index.ts";
import { universe } from "./coverage.ts";
import { packFacts, readHints } from "./hints.ts";
import { buildSummary, type StrategyRuns, type Summary } from "./report.ts";
import { runOne, type RunResult } from "./run.ts";
import type { StrategyName } from "./strategies.ts";
import { Worker } from "node:worker_threads";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Done, Task } from "./worker.ts";

export { runOne } from "./run.ts";
export { STRATEGIES } from "./strategies.ts";
export type { StrategyName } from "./strategies.ts";

/** Загрузка пака: с ошибками валидатора (V…) не прогоняем. */
export function load(dir: string): { pack: Pack | null; problems: string | null } {
  const { pack, problems } = loadPack(dir);
  if (hasErrors(problems)) return { pack: null, problems: `Пак не прошёл валидатор, прогон отменён:\n${formatProblems(problems)}` };
  return { pack: pack as unknown as Pack, problems: null };
}

/**
 * Скрипт потока. Под tsx код примерно на треть медленнее (обёртки __name), поэтому поток
 * собирается esbuild в один .mjs во временной папке; не вышло — запускается worker.ts как есть.
 */
async function workerScript(): Promise<URL> {
  const src = new URL("./worker.ts", import.meta.url);
  try {
    const esbuild = await import("esbuild");
    const out = join(tmpdir(), `gvozdi-sim-worker-${process.pid}.mjs`);
    await esbuild.build({ entryPoints: [fileURLToPath(src)], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "silent" });
    return pathToFileURL(out);
  } catch {
    return src;
  }
}

export interface SimOptions { runs: number; cap: number; seedStart: number; jobs: number }

/** Размер пачки зёрен на одно задание потоку. */
const CHUNK = 10;

export async function simulate(
  dir: string, names: StrategyName[], opts: SimOptions,
  progress?: (name: string, done: number) => void,
): Promise<{ summary: Summary | null; problems: string | null; results: StrategyRuns[] }> {
  const { pack, problems } = load(dir);
  if (!pack) return { summary: null, problems, results: [] };
  const hints = readHints(pack);
  const facts = packFacts(pack);
  const byName = new Map<StrategyName, { runs: (RunResult | undefined)[]; error: string | null; done: number }>();
  for (const n of names) byName.set(n, { runs: new Array(opts.runs), error: null, done: 0 });

  if (opts.jobs <= 0) {
    for (const name of names) {
      const st = byName.get(name)!;
      try {
        for (let i = 0; i < opts.runs; i++) {
          st.runs[i] = runOne(pack, hints, facts, name, opts.seedStart + i, opts.cap);
          progress?.(name, i + 1);
        }
      } catch (e) {
        st.error = (e as Error).message;
      }
    }
  } else {
    const tasks: (Task & { offset: number })[] = [];
    for (const name of names)
      for (let i = 0; i < opts.runs; i += CHUNK) {
        const seeds: number[] = [];
        for (let k = i; k < Math.min(opts.runs, i + CHUNK); k++) seeds.push(opts.seedStart + k);
        tasks.push({ id: tasks.length, strategy: name, seeds, cap: opts.cap, offset: i });
      }
    const nWorkers = Math.min(opts.jobs, tasks.length);
    const script = await workerScript();
    let next = 0;
    await new Promise<void>((resolveAll, rejectAll) => {
      let alive = nWorkers;
      for (let w = 0; w < nWorkers; w++) {
        const worker = new Worker(script, { workerData: { dir } });
        const feed = () => {
          // пропускаем задания стратегий, уже упавших
          while (next < tasks.length && byName.get(tasks[next].strategy)!.error) next++;
          if (next >= tasks.length) {
            void worker.terminate();
            if (--alive === 0) resolveAll();
            return;
          }
          const t = tasks[next++];
          worker.postMessage({ id: t.id, strategy: t.strategy, seeds: t.seeds, cap: t.cap } satisfies Task);
        };
        worker.on("message", (d: Done) => {
          const t = tasks[d.id];
          const st = byName.get(t.strategy)!;
          if (d.error) st.error = d.error;
          else
            d.results!.forEach((r, k) => {
              st.runs[t.offset + k] = { ...r, covered: new Set(r.covered) };
            });
          st.done += t.seeds.length;
          progress?.(t.strategy, st.done);
          feed();
        });
        worker.on("error", rejectAll);
        feed();
      }
    });
  }
  const results: StrategyRuns[] = names.map((name) => {
    const st = byName.get(name)!;
    return { name, runs: st.error ? [] : (st.runs as RunResult[]), error: st.error };
  });
  const title = String((pack.pack as unknown as { name?: unknown })?.name ?? dir);
  return { summary: buildSummary(dir, title, hints, universe(pack), results, opts), problems: null, results };
}

export function traceRun(dir: string, name: StrategyName, seed: number, cap: number, out: (line: string) => void): { result: RunResult | null; problems: string | null } {
  const { pack, problems } = load(dir);
  if (!pack) return { result: null, problems };
  const hints = readHints(pack);
  out(`Трасса: стратегия ${name}, зерно ${seed}, потолок ${cap} дн.${hints.none ? ", без подсказок" : ""}.`);
  const r = runOne(pack, hints, packFacts(pack), name, seed, cap, out);
  out(`Исход: ${r.outcome}; день ${r.endDay}; команд ${r.commands}; ошибочных команд ${r.errors}; недееспособность героя: ${r.incapacitated ? "да" : "нет"}; открыто сущностей: ${r.covered.size}.`);
  return { result: r, problems: null };
}
