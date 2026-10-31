// Один прогон: стратегия + зерно → исход и метрики (simulator.md §4).
import { createGame } from "../../engine/src/index.ts";
import type { Command, DebugView, Pack, Result, View } from "../../engine/src/index.ts";
import { finish, sample } from "./coverage.ts";
import type { Hints, PackFacts } from "./hints.ts";
import { makeStrategy, type StrategyName } from "./strategies.ts";

/** Дни, на которые снимаются деньги (simulator.md §5). */
export const MONEY_DAYS = [10, 30, 60, 100, 200];
/** Предохранитель: команд на один день потолка. */
export const MAX_COMMANDS_PER_DAY = 300;

export interface RunResult {
  seed: number;
  outcome: string; // goal:<заголовок> | fail:<заголовок> | cap | end:<заголовок> (концовка без тега)
  endDay: number;
  commands: number;
  errors: number;
  moneyAt: Record<number, number>;
  incapacitated: boolean;
  goalDeclined: boolean;
  covered: Set<string>;
}

export class StuckError extends Error {}

const fmtCmd = (c: Command): string => JSON.stringify(c);

export function runOne(
  pack: Pack, hints: Hints, facts: PackFacts, strategy: StrategyName, seed: number, cap: number,
  trace?: (line: string) => void,
): RunResult {
  const game = createGame(pack, seed);
  // debugView дорогой: снимаем лениво (шаблон предложения) и в контрольных точках дня (вечер, утро, выбор в окне)
  let dbg: DebugView = game.debugView();
  let fresh = true;
  const debug = (): DebugView => {
    if (!fresh) {
      dbg = game.debugView();
      fresh = true;
    }
    return dbg;
  };
  const tplOf = (id: string): string | null => {
    const known = dbg.offers.find((o) => o.id === id);
    return known ? known.template : debug().offers.find((o) => o.id === id)?.template ?? null;
  };
  const strat = makeStrategy(strategy, { hints, facts, offerTemplate: tplOf }, seed);
  const res: RunResult = { seed, outcome: "cap", endDay: 0, commands: 0, errors: 0, moneyAt: {}, incapacitated: false, goalDeclined: false, covered: new Set() };
  let v: View = game.view();
  sample(dbg, res.covered);
  const maxCommands = Math.max(1000, cap * MAX_COMMANDS_PER_DAY);

  const perform = (cmd: Command): Result => {
    const before = v;
    const r = game.perform(cmd);
    if (trace) {
      const t = `д${before.meta.day} ${String(before.meta.hour).padStart(2, "0")}:00 ${before.money.short}=${before.money.value}${before.stress ? ` ${before.stress.name}=${before.stress.value}` : ""}`;
      const tail = r.ok ? `ok${r.stop ? ` | стоп: ${r.stop.reason}` : ""}` : `ошибка ${r.error?.code}: ${r.error?.text}`;
      trace(`#${res.commands + res.errors + 1} ${t} | ${fmtCmd(cmd)} | ${tail}`);
      for (const l of r.events) trace(`    [${l.kind}] ${l.text}`);
    }
    if (!r.ok) {
      res.errors++;
      return r;
    }
    res.commands++;
    if (cmd.type === "choose_option") {
      const tpl = tplOf(cmd.offer);
      const ends = tpl ? facts.optionEnding.get(tpl) : undefined;
      if (ends && [...ends.values()].includes("goal") && ends.get(cmd.option) !== "goal") res.goalDeclined = true;
    }
    strat.after(cmd, true, before, r.view);
    fresh = false;
    if (cmd.type === "sleep" || cmd.type === "choose_option" || r.view.meta.is_night || r.view.ending || r.view.pending_offer || r.view.board.length !== v.board.length)
      sample(debug(), res.covered);
    v = r.view;
    return r;
  };

  while (true) {
    if (v.ending) {
      const tag = v.ending.tag;
      res.outcome = `${tag ?? "end"}:${v.ending.title}`;
      break;
    }
    if (v.meta.day > cap) break;
    for (const d of MONEY_DAYS) if (v.meta.day >= d && res.moneyAt[d] === undefined) res.moneyAt[d] = v.money.value;
    const hero = v.characters.find((c) => c.role === "hero");
    if (hero && hero.status === "incapacitated") res.incapacitated = true;
    if (res.commands > maxCommands) throw new StuckError(`зерно ${seed}: больше ${maxCommands} команд без конца прогона — стратегия зациклилась.`);

    const cmd = strat.next(v);
    let r = perform(cmd);
    if (!r.ok) {
      // запасной ход: окно — первый доступный вариант; иначе работать или спать
      const po = v.pending_offer;
      const opt = po?.options.find((o) => o.enabled);
      const fb: Command = po && opt ? { type: "choose_option", offer: po.id, option: opt.id } : v.meta.is_night ? { type: "sleep" } : { type: "work_until_stop" };
      r = perform(fb);
      if (!r.ok && fb.type !== "sleep") r = perform({ type: "sleep" });
      if (!r.ok) throw new StuckError(`зерно ${seed}, день ${v.meta.day}: стратегия не может сделать ни шага (${r.error?.code}: ${r.error?.text}).`);
    }
  }
  res.endDay = v.meta.day;
  finish(debug(), res.covered);
  return res;
}
