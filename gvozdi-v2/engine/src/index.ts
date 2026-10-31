// Точка входа движка. Чистая библиотека: без ввода-вывода и DOM.
export { createGame, loadGame } from "./game.ts";
export type {
  Pack, Game, Command, Assignment, Result, ErrorCode, Line, LineKind, View, ActionView, CategoryView, CategoryDef, CharacterView, EffectView,
  WorkshopView, CandidateView, StockLine, CostLine, OfferView, ObligationView, VarView, SummaryView, MoneyLineView, DebugView,
  DebugEntity, DebugModifier, CondTrace,
  PackMeta, VariableDef, LadderStep, ModifierDef, GoodDef, ItemDef, WorkshopDef, CharacterDef, ActionDef, RoleDef,
  EventDef, OfferDef, OptionDef, ObligationDef, EffectDef, CondNode, CostLineDef, Duration,
} from "./types.ts";
