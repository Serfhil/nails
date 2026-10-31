// validate <путь к паку> [--json]
// Код выхода: 0 — ошибок нет, 1 — есть ошибки, 2 — неверный вызов.
import { formatProblems, hasErrors, loadPack } from "./index.ts";

const args = process.argv.slice(2);
const json = args.includes("--json");
const dir = args.find((a) => !a.startsWith("--"));

if (!dir) {
  process.stderr.write("Использование: npm run validate -- <путь к паку> [--json]\n");
  process.exit(2);
}

const t0 = performance.now();
const { problems } = loadPack(dir);
const ms = Math.round(performance.now() - t0);

if (json) process.stdout.write(JSON.stringify(problems, null, 2) + "\n");
else process.stdout.write(`${formatProblems(problems)} (${ms} мс)\n`);

process.exitCode = hasErrors(problems) ? 1 : 0;
