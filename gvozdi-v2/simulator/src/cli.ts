// npm run sim -- --pack <путь> --strategy <имя|all> --runs 1000 --cap 200 --seed-start 1 --out <папка>
// npm run sim -- --pack <путь> --strategy <имя> --trace <seed> [--cap 200]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cpus } from "node:os";
import { simulate, traceRun } from "./index.ts";
import { STRATEGIES, type StrategyName } from "./strategies.ts";

const USAGE = `Использование:
  npm run sim -- --pack <путь> [--strategy <${STRATEGIES.join("|")}|all>] [--runs 1000] [--cap 200] [--seed-start 1] [--out <папка>] [--jobs N]
  npm run sim -- --pack <путь> --strategy <имя> --trace <seed> [--cap 200]`;

function parse(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`непонятный аргумент «${a}».`);
    const eq = a.indexOf("=");
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) throw new Error(`у ${a} нет значения.`);
      out[a.slice(2)] = val;
      i++;
    }
  }
  return out;
}

function int(x: string | undefined, def: number, name: string): number {
  if (x === undefined) return def;
  const n = Number(x);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} должно быть целым неотрицательным числом, а не «${x}».`);
  return n;
}

async function main(): Promise<number> {
  let args: Record<string, string>;
  try {
    args = parse(process.argv.slice(2));
    if (!args.pack) throw new Error("не указан --pack.");
  } catch (e) {
    console.error(`Ошибка: ${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  try {
    const cap = int(args.cap, 200, "cap");
    const strategyArg = args.strategy ?? "all";
    const names: StrategyName[] = strategyArg === "all" ? [...STRATEGIES] : strategyArg.split(",").map((s) => {
      if (!(STRATEGIES as readonly string[]).includes(s)) throw new Error(`неизвестная стратегия «${s}». Есть: ${STRATEGIES.join(", ")}, all.`);
      return s as StrategyName;
    });
    if (args.trace !== undefined) {
      if (names.length !== 1) throw new Error("для --trace укажите одну стратегию: --strategy <имя>.");
      const r = traceRun(args.pack, names[0], int(args.trace, 1, "trace"), cap, (l) => console.log(l));
      if (r.problems) {
        console.error(r.problems);
        return 1;
      }
      return 0;
    }
    const runs = int(args.runs, 1000, "runs");
    const seedStart = int(args["seed-start"], 1, "seed-start");
    const out = resolve(args.out ?? "sim-out");
    const t0 = Date.now();
    const jobs = int(args.jobs, Math.max(1, cpus().length - 1), "jobs");
    const r = await simulate(args.pack, names, { runs, cap, seedStart, jobs }, (name, i) => {
      if (i === runs) process.stderr.write(`  ${name}: ${runs} прогонов\n`);
    });
    if (r.problems) {
      console.error(r.problems);
      return 1;
    }
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "summary.md"), r.summary!.md, "utf8");
    for (const [f, text] of Object.entries(r.summary!.files)) writeFileSync(join(out, f), text, "utf8");
    console.log(`Готово за ${((Date.now() - t0) / 1000).toFixed(1)} с. Сводка: ${join(out, "summary.md")} (+ strategies.csv, outcomes.csv, coverage.csv).`);
    return 0;
  } catch (e) {
    console.error(`Ошибка: ${(e as Error).message}`);
    return 1;
  }
}

process.exitCode = await main();
