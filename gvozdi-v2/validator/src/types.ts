// Общие типы валидатора. Валидатор читает пак как данные и не зависит от кода движка.

export type Severity = "error" | "warning";

export interface Problem {
  severity: Severity;
  /** V001…V014 — ошибки, W001…W010 — предупреждения */
  code: string;
  /** имя файла пака, например `actions.json` */
  file: string;
  /** id записи (для pack.json — id пака, для texts.json — ключ, для файла целиком — «-») */
  id: string;
  /** путь к полю внутри записи, например `cost[0].good`; пусто — запись целиком */
  path: string;
  /** понятное сообщение по-русски с подсказкой, что исправить */
  message: string;
}

/**
 * Пак в памяти (CONTRACT_ISSUES CI-001): ключи — имена файлов пака без `.json`,
 * значения — разобранный JSON как есть. Валидатор не доверяет форме значений.
 */
export interface Pack {
  pack?: any;
  variables?: any;
  modifiers?: any;
  goods?: any;
  items?: any;
  workshops?: any;
  characters?: any;
  actions?: any;
  categories?: any;
  events?: any;
  offers?: any;
  texts?: any;
  strategy_hints?: any;
  [key: string]: unknown;
}

/** Файлы пака: имя ключа → обязателен ли файл и какой у него корневой тип. */
export const PACK_FILES: { key: string; required: boolean; root: "object" | "array" }[] = [
  { key: "pack", required: true, root: "object" },
  { key: "variables", required: true, root: "array" },
  { key: "modifiers", required: true, root: "array" },
  { key: "goods", required: true, root: "array" },
  { key: "items", required: true, root: "array" },
  { key: "workshops", required: true, root: "array" },
  { key: "characters", required: true, root: "array" },
  { key: "actions", required: true, root: "array" },
  { key: "categories", required: false, root: "array" },
  { key: "events", required: true, root: "array" },
  { key: "offers", required: true, root: "array" },
  { key: "texts", required: true, root: "object" },
  { key: "strategy_hints", required: false, root: "object" },
];

/** Виды ссылок между сущностями пака (для V003). */
export type RefKind =
  | "variable"
  | "modifier"
  | "modtag"
  | "good"
  | "item"
  | "workshop"
  | "character"
  | "action"
  | "category"
  | "event"
  | "offer"
  | "option"
  | "obligation"
  | "pool"
  | "slot";

export interface Ref {
  kind: RefKind;
  value: string;
  file: string;
  id: string;
  path: string;
  /** для `option` — id предложения; для переменных — требуемый owner */
  extra?: string;
}
