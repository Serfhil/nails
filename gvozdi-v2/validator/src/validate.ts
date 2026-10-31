// Проверка уже загруженного объекта пака. Не зависит от fs — можно звать из браузера и тестов.
import type { Pack, Problem } from "./types.ts";
import { PACK_FILES } from "./types.ts";
import { Problems, isObj } from "./util.ts";
import { Walker, checkFileSchema } from "./schema.ts";
import { PackIndex } from "./index-pack.ts";
import { Reach } from "./reach.ts";
import {
  checkActionWarnings, checkCycles, checkDataUse, checkDuplicates, checkEndGameTags, checkEventWarnings,
  checkGoalExists, checkLadders, checkModifiers, checkNumbers, checkOffers, checkPermanentNegative, checkRefs,
  checkReserved, checkServiceTexts, checkSlotsAndEquipment, checkStart, checkUnused,
} from "./checks.ts";
import { checkFloor, checkForeshadow, checkReachability } from "./reach-checks.ts";
import type { Ref } from "./types.ts";

export interface ValidateOptions {
  /** файлы, о которых уже сообщено при загрузке (не найден / битый JSON) — не повторять V001 */
  skipMissing?: Set<string>;
}

const FILE_ORDER = new Map(PACK_FILES.map((f, i) => [`${f.key}.json`, i]));

export function sortProblems(list: Problem[]): Problem[] {
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      if (a.p.severity !== b.p.severity) return a.p.severity === "error" ? -1 : 1;
      const fa = FILE_ORDER.get(a.p.file) ?? -1;
      const fb = FILE_ORDER.get(b.p.file) ?? -1;
      if (fa !== fb) return fa - fb;
      return a.i - b.i;
    })
    .map((x) => x.p);
}

export function validatePack(pack: unknown, opts: ValidateOptions = {}): Problem[] {
  const p = new Problems();
  if (!isObj(pack)) {
    p.err("V001", "-", "-", "", "пак должен быть объектом { pack, variables, modifiers, … } (CI-001).");
    return p.list;
  }
  let incomplete = false;
  for (const f of PACK_FILES) {
    const v = (pack as Pack)[f.key];
    if (v === undefined) {
      if (f.required) {
        incomplete = true;
        if (!opts.skipMissing?.has(f.key))
          p.err("V001", `${f.key}.json`, "-", "", `нет файла ${f.key}.json — он обязателен (core.md 4.1).`);
      }
      continue;
    }
    const okRoot = f.root === "array" ? Array.isArray(v) : isObj(v);
    if (!okRoot) {
      incomplete = true;
      p.err("V001", `${f.key}.json`, "-", "", `${f.key}.json должен быть ${f.root === "array" ? "массивом записей" : "объектом"}.`);
    }
  }

  const refs: Ref[] = [];
  const w = new Walker(p, refs);
  for (const f of PACK_FILES) {
    const v = (pack as Pack)[f.key];
    if (v === undefined) continue;
    if ((f.root === "array" ? Array.isArray(v) : isObj(v)) || f.key === "texts") checkFileSchema(w, f.key, v);
  }

  const ix = new PackIndex(pack as Pack);
  checkDuplicates(p, pack as Record<string, any>);
  checkRefs(p, ix, refs);
  if (Array.isArray(pack.variables)) checkReserved(p, ix);
  checkModifiers(p, ix);
  checkSlotsAndEquipment(p, ix);
  checkServiceTexts(p, pack.texts);
  checkDataUse(p, ix);
  checkLadders(p, ix);
  checkCycles(p, ix);
  checkPermanentNegative(p, ix);
  checkOffers(p, ix);
  checkEndGameTags(p, ix);
  checkNumbers(p, ix);
  if (Array.isArray(pack.events)) checkStart(p, ix);
  checkEventWarnings(p, ix);
  checkActionWarnings(p, ix);

  // Проверки «по всему паку» имеют смысл только на полном паке: иначе это шум.
  if (!incomplete) {
    checkGoalExists(p, ix);
    checkUnused(p, ix);
    const r = new Reach(ix);
    checkReachability(p, ix, r);
    checkFloor(p, ix, r);
    checkForeshadow(p, ix, r);
  }
  return sortProblems(p.list);
}
