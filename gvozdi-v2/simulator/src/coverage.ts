// Метрика закрытого (simulator.md §5). Ключ сущности — "<вид>:<id>".
// Перечень сущностей берётся из полей контракта пака, факт открытия — из debugView.
import type { DebugView, Pack } from "../../engine/src/index.ts";
import { findEndings } from "./hints.ts";

export interface EntityInfo { key: string; kind: string; id: string }

type Obj = Record<string, unknown>;
const isCond = (x: unknown): boolean => !!x && typeof x === "object";
const list = (x: unknown): Obj[] => (Array.isArray(x) ? (x as Obj[]) : []);

/** Все сущности пака с условием видимости или запуска. */
export function universe(pack: Pack): Map<string, EntityInfo> {
  const m = new Map<string, EntityInfo>();
  const add = (kind: string, id: string) => m.set(`${kind}:${id}`, { key: `${kind}:${id}`, kind, id });
  const p = pack as unknown as Obj;
  for (const a of list(p.actions)) if (isCond(a.open_when)) add("action", String(a.id));
  for (const x of list(p.variables)) if (isCond(x.visible)) add("variable", String(x.id));
  for (const x of list(p.characters)) if (isCond(x.visible)) add("character", String(x.id));
  for (const x of list(p.goods)) if (isCond(x.visible)) add("good", String(x.id));
  for (const x of list(p.modifiers)) add("modifier", String(x.id));
  for (const x of list(p.events)) add("event", String(x.id));
  for (const o of list(p.offers)) {
    add("offer", String(o.id));
    for (const opt of list(o.options)) if (isCond(opt.open_when)) add("option", `${o.id}.${opt.id}`);
  }
  for (const e of findEndings(pack)) add("ending", e.title);
  return m;
}

const OPENED_KIND: Record<string, string> = { action: "action", var: "variable", char: "character", good: "good", item: "item" };

/** Ключ из реестра opened: "var:char:baker:stress" → "variable:stress", "char:cat" → "character:cat". */
export function openedKey(k: string): string {
  const parts = k.split(":");
  const kind = OPENED_KIND[parts[0]] ?? parts[0];
  return `${kind}:${parts[parts.length - 1]}`;
}

/** Снимок: модификаторы и предложения видны только пока живут, поэтому собираются после каждой команды. */
export function sample(d: DebugView, into: Set<string>): void {
  for (const e of d.entities) for (const mod of e.modifiers) into.add(`modifier:${mod.template}`);
  for (const o of d.offers) {
    if (o.template) into.add(`offer:${o.template}`);
    for (const opt of o.options) if (opt.open) into.add(`option:${o.template}.${opt.id}`);
  }
}

/** Итог прогона: реестры opened / fired / endings_fired. */
export function finish(d: DebugView, into: Set<string>): void {
  for (const k of Object.keys(d.opened)) into.add(openedKey(k));
  for (const k of Object.keys(d.fired)) into.add(`event:${k}`);
  for (const e of d.endings_fired) into.add(`ending:${e.title}`);
}
