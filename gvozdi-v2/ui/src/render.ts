// Рендер вида в HTML-строку. Чистые функции: View + UiState → string.
// Кнопки помечены data-act; обработку делает app.ts.

import type {
  ActionView,
  CharacterView,
  CostLine,
  EffectView,
  Line,
  OfferView,
  VarView,
  View,
  WorkshopView,
} from "./contract.ts";
import {
  actionEnabled,
  activeWorkshop,
  canAssign,
  canEquip,
  canPickWorkshop,
  fmtHour,
  fmtMoney,
  fmtNum,
  fmtSigned,
  groupActions,
  pickedIn,
  type ActionGroup,
  isBlocked,
  isOpen,
  mainButtons,
  KEEP_DEFAULT,
  marketPlan,
  nameOf,
  isHero,
  isWorker,
  workersOf,
  familyOf,
  needsPicker,
  notificationsNewestFirst,
  onceActions,
  overlayOf,
  panels,
  equipOptions,
  replaceOf,
  saleValue,
  shopAvailable,
  summaryTotals,
  type UiState,
} from "./model.ts";
import { packsForView, type PackEntry } from "./packs.ts";
import { S } from "./strings.ts";

export function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Attrs = Record<string, string | number | boolean | null | undefined>;

function attrs(a: Attrs): string {
  let out = "";
  for (const [k, v] of Object.entries(a)) {
    if (v === null || v === undefined || v === false) continue;
    out += v === true ? ` ${k}` : ` ${k}="${esc(v)}"`;
  }
  return out;
}

function button(label: string, a: Attrs, cls = "btn"): string {
  return `<button type="button" class="${cls}"${attrs(a)}>${esc(label)}</button>`;
}

function lineHtml(l: Line): string {
  return `<li class="line k-${esc(l.kind)}">${esc(l.text)}</li>`;
}

function linesHtml(lines: Line[]): string {
  return `<ul class="lines">${lines.map(lineHtml).join("")}</ul>`;
}

function costHtml(cost: CostLine[]): string {
  if (cost.length === 0) return "";
  const rows = cost
    .map(
      (c) =>
        `<li class="${c.have < c.need ? "short" : "ok"}">${esc(c.name)}: ${S.need} ${esc(fmtNum(c.need))}, ${S.have} ${esc(fmtNum(c.have))}</li>`,
    )
    .join("");
  return `<ul class="cost">${rows}</ul>`;
}

function reasonHtml(reason: string | null, show: boolean): string {
  return show && reason ? `<div class="reason">${esc(reason)}</div>` : "";
}

function daysHtml(d: number | null): string {
  return d === null ? S.noDeadline : `${S.daysLeft}: ${esc(d)}`;
}

function panel(cls: string, title: string, body: string): string {
  return `<section class="panel ${cls}"><h2>${esc(title)}</h2>${body}</section>`;
}

function effectHtml(e: EffectView): string {
  const nums = e.numbers !== null ? ` <span class="nums">${esc(e.numbers)}</span>` : "";
  const days = e.days_left !== null ? ` <span class="days">${esc(e.days_left)} ${S.days}</span>` : "";
  return `<li class="effect${e.negative ? " neg" : ""}"><b>${esc(e.name)}</b>${days}<div>${esc(e.text)}${nums}</div></li>`;
}

function effectsHtml(list: EffectView[]): string {
  return list.length ? `<ul class="effects">${list.map(effectHtml).join("")}</ul>` : "";
}

/** Зарезервированная переменная мастерской: число мест под оборудование (core.md 4.3). */
const SLOTS_VAR = "equipment_slots";

/** Места под оборудование: квадратики (занято залито) и подпись «занято N, свободно M». */
function slotsValue(total: number, used: number): string {
  const n = Math.max(0, Math.floor(total));
  const free = Math.max(0, n - used);
  const pips = Array.from({ length: Math.min(n, 12) }, (_, i) => `<i class="pip${i < used ? " on" : ""}"></i>`).join("");
  return `<span class="pips">${pips}</span> ${S.slotsUsed} ${esc(fmtNum(used))}, ${S.slotsFree} ${esc(fmtNum(free))}`;
}

/** usedSlots — сколько мест занято оборудованием (только для мастерской). */
function varsHtml(view: View, vars: VarView[], usedSlots?: number): string {
  if (vars.length === 0) return "";
  return `<ul class="vars">${vars
    .map(
      (v) =>
        `<li><span class="vn">${esc(v.name)}</span> <span class="vv">${
          usedSlots !== undefined && v.id === SLOTS_VAR ? slotsValue(v.value, usedSlots) : esc(v.display)
        }</span>${v.step ? ` <span class="step">${esc(v.step)}</span>` : ""}</li>`,
    )
    .join("")}</ul>`;
}

// ——— шапка и главные кнопки ———

function headerHtml(view: View, ui: UiState): string {
  const p = panels(view, ui);
  const st = view.stress;
  const stress =
    p.stress && st
      ? `<span class="stress${st.warning ? " warn" : ""}">${esc(st.name)}: ${esc(fmtNum(st.value))}${
          st.max !== null ? `/${esc(fmtNum(st.max))}` : ""
        }${st.step ? ` · ${esc(st.step)}` : ""}</span>`
      : "";
  return `<header class="top"><div class="top-in">
<div class="row1"><h1>${esc(view.meta.game_title)}</h1>${button(S.settings, {
    "data-act": "settings-open",
    "aria-haspopup": "dialog",
    disabled: overlayOf(view, ui) !== null,
  }, "btn small settings-btn")}</div>
<div class="row2"><span class="when">${S.day} ${esc(view.meta.day)}, ${esc(fmtHour(view.meta.hour))}${
    view.meta.is_night ? ` · ${S.night}` : ""
  }</span><span class="money">${esc(view.money.name)}: <b>${esc(fmtNum(view.money.value))}</b></span>${stress}</div>
</div></header>`;
}

/** Главные кнопки: над блоком «Дела», без заголовка. */
function mainButtonsHtml(view: View, ui: UiState): string {
  const mb = mainButtons(view, ui);
  // ВРЕМЕННОЕ РЕШЕНИЕ: кнопка «Заняться делом» (work_until_stop) скрыта по просьбе владельца.
  // Чтобы вернуть, раскомментируйте строку и добавьте её в разметку ниже.
  // const work = button(S.work, { "data-act": "work", disabled: !mb.work }, "btn big");
  return `<div class="main">${button(
    S.sleep,
    { "data-act": "sleep", disabled: !mb.sleep },
    `btn big${view.meta.is_night ? " glow" : ""}`,
  )}</div>`;
}

/** Свёрнутый блок: кнопка-заголовок со стрелкой; содержимое есть в разметке, только когда открыт. */
function foldHtml(ui: UiState, key: string, title: string, body: string, on: boolean): string {
  if (!body) return "";
  const open = isOpen(ui, key);
  return `<div class="fold${open ? " open" : ""}">${button(title, { "data-act": "fold", "data-key": key, "aria-expanded": String(open), disabled: !on }, "fold-head")}${
    open ? `<div class="fold-body">${body}</div>` : ""
  }</div>`;
}

interface DdOption {
  value: string;
  label: string;
  selected?: boolean;
  disabled?: boolean;
}

/** Список вариантов выпадающего списка. Выбор — нажатие кнопки с act и данными поля, значение в data-value. */
function ddList(ui: UiState, key: string, act: string, data: Attrs, options: DdOption[], on: boolean): string {
  const items = options
    .map(
      (o) =>
        `<li role="option" aria-selected="${o.selected ? "true" : "false"}">${button(
          o.label,
          { "data-act": act, ...data, "data-value": o.value, disabled: !on || o.disabled },
          `dd-opt${o.selected ? " on" : ""}`,
        )}</li>`,
    )
    .join("");
  return `<ul class="dd-list scroll" role="listbox"${ui.dd === key ? "" : " hidden"}>${items}</ul>`;
}

/** Свой выпадающий список вместо select: кнопка со значением и список вариантов. */
function dropdown(ui: UiState, key: string, act: string, data: Attrs, label: string, options: DdOption[], on: boolean): string {
  const open = ui.dd === key;
  return `<div class="dd${open ? " open" : ""}">${button(label, { "data-act": "dd", "data-key": key, "aria-haspopup": "listbox", "aria-expanded": String(open), disabled: !on }, "dd-btn")}${ddList(
    ui,
    key,
    act,
    data,
    options,
    on,
  )}</div>`;
}

/** Строка «Подпись: текущее значение» и рядом кнопка; по нажатию на неё выпадает список, выбор записывается сразу. */
function choiceRow(ui: UiState, key: string, act: string, data: Attrs, caption: string, current: string, btn: string, options: DdOption[], on: boolean): string {
  const open = ui.dd === key;
  return `<div class="choice dd${open ? " open" : ""}"><div class="choice-row"><span class="choice-text">${esc(caption)}: <b>${esc(current)}</b></span>${button(
    btn,
    { "data-act": "dd", "data-key": key, "aria-haspopup": "listbox", "aria-expanded": String(open), disabled: !on },
    "btn small choice-btn",
  )}</div>${ddList(ui, key, act, data, options, on)}</div>`;
}

function messageHtml(ui: UiState): string {
  return ui.message ? `<div class="msg k-${esc(ui.message.kind)}" role="alert">${esc(ui.message.text)}</div>` : "";
}

// ——— разовые действия ———

function pickerHtml(view: View, a: ActionView, ui: UiState): string {
  const p = ui.picking!;
  const on = !isBlocked(view, ui);
  const sel = (role: string, label: string, ids: string[] | null, cur: string | null) =>
    ids === null
      ? ""
      : `<div class="pick"><span class="fl">${esc(label)}</span>${dropdown(
          ui,
          `pick:${role}`,
          "pick",
          { "data-role": role },
          cur ? nameOf(view, cur) : S.equipChoose,
          ids.map((id) => ({ value: id, label: nameOf(view, id), selected: id === cur })),
          on,
        )}</div>`;
  return `<div class="picker">${sel(
    "partner",
    S.pickPartner,
    a.roles.partner,
    p.partner,
  )}${sel("candidate", S.pickCandidate, a.roles.candidate, p.candidate)}<div class="pick-btns">${button(S.pickGo, {
    "data-act": "pick-go",
  })}${button(S.pickCancel, { "data-act": "pick-cancel" }, "btn ghost")}</div></div>`;
}

/** Условия действия строками для всплывающей подсказки: причина отказа, затем «нужно / есть» по каждой строке расхода. */
function conditionLines(a: ActionView): string[] {
  const lines: string[] = [];
  if (!a.enabled && a.reason) lines.push(a.reason);
  for (const c of a.cost) lines.push(`${c.name}: ${S.need} ${fmtNum(c.need)}, ${S.have} ${fmtNum(c.have)}`);
  return lines;
}

/** Текстовая копия подсказки `title` для сенсорных экранов (там title не появляется); на устройствах с мышью скрыта в CSS. */
function tipTouch(text: string | null | undefined): string {
  return text ? `<div class="tip-touch">${esc(text)}</div>` : "";
}

/** showReason: false — причина уже выведена рядом (выбранное дело группы select). */
function actionHtml(view: View, ui: UiState, a: ActionView, showReason = true): string {
  const on = actionEnabled(view, ui, a);
  const open = ui.picking?.action === a.id && on;
  const tip = conditionLines(a);
  // слева кнопка с названием, справа цена: время и то, что требуется (красным — чего не хватает)
  const price = `<div class="price-col"><span class="p-time">${esc(fmtNum(a.hours))} ${S.hoursShort}</span>${a.cost
    .map((c) => `<span class="p-cost${c.have < c.need ? " short" : ""}">${esc(c.name)} ${esc(fmtNum(c.need))}</span>`)
    .join("")}</div>`;
  return `<li class="action${a.enabled ? "" : " off"}"${tip.length ? ` title="${esc(tip.join("\n"))}"` : ""}>${button(a.label, {
    "data-act": "action",
    "data-id": a.id,
    disabled: !on,
    "aria-expanded": needsPicker(a) ? String(open) : null,
  })}${price}${a.description === null || a.description === "" ? "" : `<p class="desc">${esc(a.description)}</p>`}${
    showReason && !a.enabled ? tipTouch(a.reason) : ""
  }${open ? pickerHtml(view, a, ui) : ""}</li>`;
}

function groupHtml(view: View, ui: UiState, g: ActionGroup): string {
  const title = `${g.category.name} (${g.available})`;
  if (g.category.view === "list") {
    const open = ui.catOpen.includes(g.category.id);
    return `<div class="fold cat cat-list${open ? " open" : ""}">${button(title, { "data-act": "cat-fold", "data-id": g.category.id, "aria-expanded": String(open) }, "fold-head")}${
      open ? `<div class="fold-body"><ul class="list">${g.actions.map((a) => actionHtml(view, ui, a)).join("")}</ul></div>` : ""
    }</div>`;
  }
  const cur = pickedIn(ui, g);
  const on = !isBlocked(view, ui);
  const dd = dropdown(
    ui,
    `cat:${g.category.id}`,
    "cat-pick",
    { "data-cat": g.category.id },
    cur ? cur.label : S.catChoose,
    g.actions.map((a) => ({
      value: a.id,
      label: `${a.label}${!a.enabled && a.reason ? ` — ${a.reason}` : ""}`,
      selected: cur?.id === a.id,
      disabled: !a.enabled,
    })),
    on,
  );
  const chosen = cur ? `<ul class="list">${actionHtml(view, ui, cur, false)}</ul>${reasonHtml(cur.reason, !cur.enabled)}` : "";
  return `<div class="cat cat-select"><div class="sub">${esc(title)}</div>${dd}${chosen}</div>`;
}

function actionsHtml(view: View, ui: UiState): string {
  const { ungrouped, groups } = groupActions(view);
  const plain = ungrouped.length ? `<ul class="list">${ungrouped.map((a) => actionHtml(view, ui, a)).join("")}</ul>` : "";
  return panel("actions", S.panelActions, plain + groups.map((g) => groupHtml(view, ui, g)).join(""));
}

// ——— уведомления ———

function nowHtml(ui: UiState): string {
  const stop = ui.lastStop ? `<p class="stop">${esc(ui.lastStop)}</p>` : "";
  return panel("now", S.panelNow, stop + (ui.lastEvents.length ? linesHtml(ui.lastEvents) : ""));
}

function notificationsHtml(view: View): string {
  return panel("notes", S.panelNotifications, linesHtml(notificationsNewestFirst(view)));
}

// ——— предложения ———

function optionsHtml(offer: OfferView, enabledAll: boolean): string {
  return `<div class="options">${offer.options
    .map(
      (o) =>
        `<div class="option${o.enabled ? "" : " off"}">${button(o.label, {
          "data-act": "choose",
          "data-offer": offer.id,
          "data-option": o.id,
          disabled: !(enabledAll && o.enabled),
        })}${reasonHtml(o.reason, !o.enabled)}${costHtml(o.cost)}</div>`,
    )
    .join("")}</div>`;
}

/** Окно замены оборудования перед do_action: предупреждение, варианты, отказ. */
function replaceModal(view: View, ui: UiState): string {
  const r = ui.replacing!;
  const rep = replaceOf(view, r.action)!;
  const label = view.actions.find((a) => a.id === r.action)?.label ?? "";
  return `<div class="overlay" role="dialog" aria-modal="true"><div class="modal replace">
<h2>${esc(label)}</h2><p class="text">${esc(rep.warning)}</p><div class="sub">${S.replaceWhat}</div><div class="options">${rep.options
    .map((o) => button(o.name, { "data-act": "replace-choose", "data-item": o.item }))
    .join("")}${button(S.replaceCancel, { "data-act": "replace-cancel" }, "btn ghost")}</div></div></div>`;
}

function offerModal(offer: OfferView): string {
  return `<div class="overlay" role="dialog" aria-modal="true"><div class="modal offer">
<h2>${esc(offer.title)}</h2><p class="text">${esc(offer.text)}</p>${optionsHtml(offer, true)}</div></div>`;
}

function boardHtml(view: View, ui: UiState): string {
  const on = !isBlocked(view, ui);
  return panel(
    "board",
    S.panelBoard,
    view.board
      .map(
        (o) =>
          `<article class="card"><h3>${esc(o.title)}</h3><div class="days">${daysHtml(o.days_left)}</div><p class="text">${esc(
            o.text,
          )}</p>${optionsHtml(o, on)}</article>`,
      )
      .join(""),
  );
}

// ——— заказы ———

function obligationsHtml(view: View, ui: UiState): string {
  const on = !isBlocked(view, ui);
  return panel(
    "obligations",
    S.panelObligations,
    view.obligations
      .map((ob) => {
        const key = `decline:${ob.id}`;
        const armed = ui.confirm === key;
        return `<article class="card"><h3>${esc(ob.title)}</h3><div class="days">${daysHtml(ob.days_left)}</div>${costHtml(
          ob.requires,
        )}<div class="row-btns">${button(S.deliver, {
          "data-act": "deliver",
          "data-id": ob.id,
          disabled: !(on && ob.can_deliver),
        })}${button(armed ? S.declineConfirm : S.decline, { "data-act": "decline", "data-id": ob.id, disabled: !on }, `btn ghost${armed ? " armed" : ""}`)}</div></article>`;
      })
      .join(""),
  );
}

// ——— люди ———

function characterHtml(view: View, ui: UiState, c: CharacterView): string {
  const on = !isBlocked(view, ui);
  const role = c.role_name ?? "";
  const status =
    c.status === "incapacitated"
      ? `<div class="status">${c.incapacitated_permanent ? S.incapacitatedForever : S.incapacitated}</div>`
      : "";
  const blurb = c.blurb ? `<p class="blurb">${esc(c.blurb)}</p>` : "";

  const slots = c.slots.length
    ? `<ul class="slots">${c.slots
        .map((s) =>
          s.item
            ? `<li><span><span class="sn">${esc(s.slot_name)}:</span> ${esc(s.name ?? "")}</span> ${button(S.unequip, { "data-act": "unequip", "data-char": c.id, "data-item": s.item, disabled: !on }, "btn small ghost unequip")}</li>`
            : `<li><span><span class="sn">${esc(s.slot_name)}:</span> <span class="empty">${S.slotEmpty}</span></span></li>`,
        )
        .join("")}</ul>`
    : "";

  // кнопка «Дать вещь» открывает список вещей, которые можно надеть; выбор записывается сразу
  const equipOpen = ui.dd === `equip:${c.id}`;
  const equip = canEquip(view, c)
    ? `<div class="choice dd${equipOpen ? " open" : ""}"><div class="choice-row">${button(
        S.equip,
        { "data-act": "dd", "data-key": `equip:${c.id}`, "aria-haspopup": "listbox", "aria-expanded": String(equipOpen), disabled: !on },
        "btn small choice-btn",
      )}</div>${ddList(
        ui,
        `equip:${c.id}`,
        "equip",
        { "data-char": c.id },
        equipOptions(view, c).map((it) => ({ value: it.item, label: it.name })),
        on,
      )}</div>`
    : "";

  let assign = "";
  if (isWorker(c)) {
    if (canAssign(c)) {
      assign = choiceRow(
        ui,
        `assign:${c.id}`,
        "assign",
        { "data-char": c.id },
        S.occupation,
        c.assignment.label,
        S.occupationNew,
        c.assignable.map((a, i) => ({
          value: String(i),
          label: `${a.label}${!a.enabled && a.reason ? ` — ${a.reason}` : ""}`,
          selected: a.label === c.assignment.label,
          disabled: !a.enabled,
        })),
        on,
      );
    } else {
      assign = `<div class="assign">${S.occupation}: <b>${esc(c.assignment.label)}</b></div>`;
    }
  }

  const ws = canPickWorkshop(view, c)
    ? choiceRow(
        ui,
        `ws:${c.id}`,
        "assign-ws",
        { "data-char": c.id },
        S.workshopOf,
        view.workshops.find((w) => w.id === c.workshop)?.name ?? "—",
        S.workshopChange,
        view.workshops.map((w) => ({ value: w.id, label: w.name, selected: w.id === c.workshop })),
        on,
      )
    : "";

  const params = foldHtml(ui, `p:${c.id}:vars`, S.params, varsHtml(view, c.vars), on);
  const personal = foldHtml(ui, `p:${c.id}:inv`, S.personalInv, slots + equip, on);

  return `<article class="card person${c.status === "incapacitated" ? " down" : ""}"><h3>${esc(c.name)}${
    role ? ` <span class="role">${esc(role)}</span>` : ""
  }${isHero(c) ? ` <span class="you">${S.you}</span>` : ""}</h3>${status}${blurb}${params}${personal}${assign}${ws}${effectsHtml(c.effects)}</article>`;
}

/** «Работники» над мастерской: все с works: true, герой первым (view.md 3.6). Остальным здесь выдаются поручения. */
function workersHtml(view: View, ui: UiState): string {
  return panel("workers", S.panelWorkers, workersOf(view).map((c) => characterHtml(view, ui, c)).join(""));
}

/** «Семья»: все с works: false (view.md 3.6). */
function familyHtml(view: View, ui: UiState): string {
  return panel("family", S.panelFamily, familyOf(view).map((c) => characterHtml(view, ui, c)).join(""));
}

/** Кандидаты пула найма (hire_pool): имя, подпись роли, описание, переменные, эффекты. */
function hireHtml(view: View): string {
  return panel(
    "hire",
    S.panelHire,
    view.hire_pool
      .map(
        (c) =>
          `<article class="card person"><h3>${esc(c.name)}${c.role_name ? ` <span class="role">${esc(c.role_name)}</span>` : ""}</h3>${c.blurb ? `<p class="blurb">${esc(c.blurb)}</p>` : ""}${varsHtml(view, c.vars)}${effectsHtml(c.effects)}</article>`,
      )
      .join(""),
  );
}

// ——— мастерская ———

function workshopBody(view: View, w: WorkshopView): string {
  const eq = w.equipment.length
    ? `<div class="sub">${S.equipment}</div><ul class="plain">${w.equipment.map((e) => `<li>${esc(e.name)}</li>`).join("")}</ul>`
    : "";
  const wk = w.workers.length
    ? `<div class="sub">${S.workers}</div><ul class="plain">${w.workers.map((id) => `<li>${esc(nameOf(view, id))}</li>`).join("")}</ul>`
    : "";
  return `<h3>${esc(w.name)}</h3>${varsHtml(view, w.vars, w.equipment.length)}${eq}${wk}${effectsHtml(w.effects)}`;
}

function workshopHtml(view: View, ui: UiState): string {
  const p = panels(view, ui);
  const cur = activeWorkshop(view, ui);
  const tabs = p.workshopTabs
    ? `<div class="tabs" role="tablist">${view.workshops
        .map((w) =>
          button(w.name, { "data-act": "ws-tab", "data-id": w.id, role: "tab", "aria-selected": String(w.id === cur) }, `tab${w.id === cur ? " on" : ""}`),
        )
        .join("")}</div>`
    : "";
  const w = view.workshops.find((x) => x.id === cur)!;
  return panel("wshop", S.panelWorkshop, tabs + workshopBody(view, w));
}

// ——— склад, вещи, рынок ———

/** Сколько строк склада видно без прокрутки. */
const STOCK_VISIBLE = 6;

function storageHtml(view: View, ui: UiState): string {
  const on = !isBlocked(view, ui);
  const rows = view.storage.goods
    .map(
      (g) =>
        `<li><span>${esc(g.name)}: <b>${esc(fmtNum(g.qty))}</b>${g.unit ? ` ${esc(g.unit)}` : ""}</span><label class="flag"><input type="checkbox" data-act="sell-flag" data-id="${esc(
          g.id,
        )}"${g.sell_flag ? " checked" : ""}${on ? "" : " disabled"} aria-label="${esc(S.sellFlag)}"></label></li>`,
    )
    .join("");
  const many = view.storage.goods.length > STOCK_VISIBLE;
  return panel(
    "storage",
    S.panelStorage,
    `<div class="stock-head">${S.sellFlag}</div><ul class="stock${many ? " scroll" : ""}" data-scroll="stock">${rows}</ul><div class="total">${S.total} ${esc(
      fmtMoney(view, saleValue(view)),
    )}</div>`,
  );
}

function inventoryHtml(view: View): string {
  return panel(
    "inventory",
    S.panelInventory,
    `<ul class="plain">${view.inventory.map((it) => `<li><b>${esc(it.name)}</b>${effectsHtml(it.effects)}</li>`).join("")}</ul>`,
  );
}

function marketHtml(view: View, ui: UiState): string {
  const m = view.market;
  const on = !isBlocked(view, ui) && m.enabled;
  const plan = marketPlan(view, ui);
  const raw = m.raw.length
    ? `<div class="sub">${S.marketRaw}</div><ul class="raw">${m.raw
        .map((r) => {
          const q = ui.market.raw[r.id];
          const k = ui.market.keep[r.id];
          const keepVal = k === undefined ? KEEP_DEFAULT : k === null ? "" : k;
          const id = esc(r.id);
          return `<li><div class="raw-head">${esc(r.name)} <span class="price">${esc(fmtMoney(view, r.unit_price))} ${S.priceEach}</span></div><div class="raw-in"><label><span class="fl">${S.marketBuy}</span><input type="text" inputmode="numeric" autocomplete="off" data-act="market-raw" data-id="${id}" value="${
            q ? esc(q) : ""
          }" placeholder="${esc(plan.buy_raw[r.id] ?? 0)}"${on ? "" : " disabled"}></label><label><span class="fl">${S.marketKeep}</span><input type="text" inputmode="numeric" autocomplete="off" data-act="market-keep" data-id="${id}" value="${esc(
            keepVal,
          )}" placeholder="${KEEP_DEFAULT}"${on ? "" : " disabled"}></label></div></li>`;
        })
        .join("")}</ul>`
    : "";
  const shopList = m.shop.length
    ? `<ul class="shop">${m.shop
        .map((s) => {
          const checked = ui.market.items.includes(s.item_type);
          // причина отказа — всплывающей подсказкой, не текстом
          const ok = shopAvailable(view, s);
          const tip = !ok && s.disabled_reason ? ` title="${esc(s.disabled_reason)}"` : "";
          return `<li class="${ok ? "" : "off"}"${tip}><label><input type="checkbox" data-act="market-item" data-id="${esc(s.item_type)}"${
            checked && ok ? " checked" : ""
          }${on && ok ? "" : " disabled"}> ${esc(s.name)} <span class="price">${esc(fmtMoney(view, s.price))}</span></label>${
            ok ? "" : tipTouch(s.disabled_reason)
          }</li>`;
        })
        .join("")}</ul>`
    : "";
  const shop = foldHtml(ui, "market:shop", S.marketShop, shopList, !isBlocked(view, ui));
  const short = plan.itemsShort;
  const goOn = on && short <= 0;
  const goTip = on && short > 0 ? ` title="${esc(`${S.shortBy}: ${fmtMoney(view, short)}`)}"` : "";
  const warn = on && plan.trimmed ? `<div class="reason warn">${S.marketTrimmed}</div>` : "";
  const go = `<div class="go-wrap"${goTip}>${button(`${S.marketGo} · ${fmtNum(m.hours)} ${S.hoursShort}`, {
    "data-act": "market-go",
    disabled: !goOn,
  })}</div>${on && short > 0 ? tipTouch(`${S.shortBy}: ${fmtMoney(view, short)}`) : ""}${reasonHtml(m.disabled_reason, !m.enabled)}${warn}`;
  return panel("market", S.panelMarket, go + raw + shop);
}

function effectsPanel(view: View): string {
  return panel("world", S.panelEffects, effectsHtml(view.effects));
}

// ——— окна ———

function summaryModal(view: View, ui: UiState): string {
  const s = view.summary!;
  const t = summaryTotals(view, ui);
  const rows = (list: { label: string; amount: number }[]) =>
    `<ul class="money-rows">${list.map((r) => `<li><span>${esc(r.label)}</span><b>${esc(fmtNum(r.amount))}</b></li>`).join("")}</ul>`;
  const details = ui.showSummaryDetails
    ? `${s.income.length ? `<div class="sub">${S.income}</div>${rows(s.income)}` : ""}${
        s.expense.length ? `<div class="sub">${S.expense}</div>${rows(s.expense)}` : ""
      }`
    : "";
  const hasDetails = s.income.length > 0 || s.expense.length > 0;
  const sumRow = (label: string, day: number, all: number) =>
    `<li><span>${label}</span><span><b>${esc(fmtNum(day))}</b> ${S.perDay}, ${S.allTime} <b>${esc(fmtNum(all))}</b></span></li>`;
  return `<div class="overlay" role="dialog" aria-modal="true"><div class="modal summary">
<h2 class="sum-title">${esc(s.title)}</h2>
<div class="sum-money"><span>${S.summaryMorning}</span><b>${esc(fmtMoney(view, s.money_morning))}</b><div class="delta ${
    s.delta < 0 ? "minus" : s.delta > 0 ? "plus" : "zero"
  }">${esc(fmtSigned(s.delta))}</div></div>
<ul class="sum-rows">${sumRow(S.income, t.dayIncome, t.allIncome)}${sumRow(S.expense, t.dayExpense, t.allExpense)}</ul>
${hasDetails ? button(ui.showSummaryDetails ? S.hideDetails : S.details, { "data-act": "summary-details" }, "btn ghost small") : ""}${details}
${button(S.close, { "data-act": "summary-close" }, "btn big")}</div></div>`;
}

function endingHtml(view: View, ui: UiState): string {
  const e = view.ending!;
  const armed = ui.confirm === "restart";
  const tag = e.tag === "goal" ? S.endingGoal : e.tag === "fail" ? S.endingFail : "";
  return `<main class="ending${e.tag ? ` t-${e.tag}` : ""}"><div class="seal-mark">${esc(tag)}</div><h1>${esc(e.title)}</h1><p class="text">${esc(
    e.text,
  )}</p>${messageHtml(ui)}${button(armed ? S.restartConfirm : S.restart, { "data-act": "restart" }, `btn big${armed ? " armed" : ""}`)}</main>`;
}

/** Окно «Настройки» (view.md 3.14): сведения о паке из вида, «Начать заново», выбор пака из списка сборки. */
function settingsModal(view: View, ui: UiState, packs: PackEntry[]): string {
  const m = view.meta;
  const armed = ui.confirm === "restart";
  const items = packsForView(view, packs)
    .map((p) => {
      const ver = p.version ? `<span class="pack-ver">${S.packVersion} ${esc(p.version)}</span>` : "";
      const desc = p.description ? `<span class="pack-desc">${esc(p.description)}</span>` : "";
      const inner = `<span class="pack-name">${esc(p.name)}</span>${ver}${desc}`;
      return p.id === m.pack_id || !p.url
        ? `<li class="pack current" aria-current="page"><span class="pack-mark">${S.packCurrent}</span>${inner}</li>`
        : `<li class="pack"><a class="pack-link" href="${esc(p.url)}">${inner}</a></li>`;
    })
    .join("");
  return `<div class="overlay" data-backdrop="settings-close" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="modal settings">
<div class="modal-head"><h2 id="settings-title">${S.settings}</h2>${button("×", { "data-act": "settings-close", "aria-label": S.settingsClose, title: S.settingsClose }, "btn ghost close-x")}</div>
<div class="about"><div class="about-title">${esc(m.game_title)}</div><div class="pack-ver">${S.packVersion} ${esc(m.pack_version)}</div>${
    m.pack_description !== null ? `<p class="text">${esc(m.pack_description)}</p>` : ""
  }</div>
${button(armed ? S.restartConfirm : S.restart, { "data-act": "restart" }, `btn${armed ? " armed" : ""}`)}
<div class="sub">${S.packChoose}</div><ul class="pack-list">${items}</ul></div></div>`;
}

// ——— весь экран ———

export function renderApp(view: View, ui: UiState, packs: PackEntry[] = []): string {
  const ov = overlayOf(view, ui);
  if (ov === "ending") return endingHtml(view, ui);

  const p = panels(view, ui);
  // Шапка (только сведения) на всю ширину. Под ней три колонки: слева «Только что», «Сегодня», мастерская, люди, найм;
  // в центре главные кнопки, дела и остальное; справа заказы, доска объявлений, склад, рынок, общий инвентарь. На узком экране колонки встают в одну (styles.css).
  const left: string[] = [];
  const center: string[] = [];
  const right: string[] = [];
  if (p.now) left.push(nowHtml(ui));
  if (p.notifications) left.push(notificationsHtml(view));
  if (p.workers) left.push(workersHtml(view, ui));
  if (p.workshop) left.push(workshopHtml(view, ui));
  if (p.family) left.push(familyHtml(view, ui));
  if (p.hire) left.push(hireHtml(view));
  center.push(mainButtonsHtml(view, ui));
  if (p.actions) center.push(actionsHtml(view, ui));
  if (p.effects) center.push(effectsPanel(view));
  if (p.obligations) right.push(obligationsHtml(view, ui));
  if (p.board) right.push(boardHtml(view, ui));
  if (p.storage) right.push(storageHtml(view, ui));
  if (p.market) right.push(marketHtml(view, ui));
  if (p.inventory) right.push(inventoryHtml(view));

  const col = (cls: string, parts: string[]) => (parts.length ? `<div class="col ${cls}">${parts.join("\n")}</div>` : "");
  const body = `<main class="game"${ov ? ' aria-hidden="true" inert' : ""}>${headerHtml(view, ui)}${messageHtml(ui)}<div class="cols">${col(
    "col-left",
    left,
  )}${col("col-center", center)}${col("col-right", right)}</div></main>`;
  const overlay =
    ov === "offer"
      ? offerModal(view.pending_offer!)
      : ov === "replace"
        ? replaceModal(view, ui)
        : ov === "summary"
          ? summaryModal(view, ui)
          : ov === "settings"
            ? settingsModal(view, ui, packs)
            : "";
  return body + overlay;
}
