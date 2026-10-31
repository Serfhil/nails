// Склад, рынок и торговля (core.md 3.6).

import type { Engine } from "./engine.ts";
import { norm } from "./engine.ts";
import type { Ref } from "./state.ts";
import { WORLD, charRef } from "./state.ts";
import { addExact, finalValue } from "./vars.ts";
import { evalCond } from "./conditions.ts";
import { giveItem } from "./workforce.ts";

export function addGoods(e: Engine, good: string, qty: number): void {
  if (!e.idx.goods.has(good)) { e.error(`нет товара ${good}`); return; }
  if (!qty) return;
  const cur = e.s.stock[good] ?? 0;
  const next = norm(Math.max(0, cur + qty));
  e.s.stock[good] = next;
  if (!(good in e.s.sellFlags)) e.s.sellFlags[good] = !!e.idx.goods.get(good)!.sell_default;
  if (!e.s.seenGoods.includes(good)) e.s.seenGoods.push(good);
  e.touch();
}

const EPS = 1e-9;
const floorM = (x: number) => Math.floor(x + EPS);
const ceilM = (x: number) => Math.ceil(x - EPS);

export function sellUnit(e: Engine, good: string, seller: Ref): number {
  const g = e.idx.goods.get(good);
  if (!g) return 0;
  return norm(g.price * finalValue(e, seller, "sell_price") * finalValue(e, WORLD, "world_sell_price"));
}

export function buyUnitPrice(e: Engine, basePrice: number, buyer: Ref): number {
  return norm(basePrice * finalValue(e, buyer, "buy_price") * finalValue(e, WORLD, "world_buy_price"));
}

/** Выручка за весь товар с галочкой (без изменения состояния). */
export function salePlan(e: Engine, seller: Ref): { good: string; qty: number; money: number }[] {
  const out = [];
  for (const g of e.s.seenGoods) {
    const q = e.s.stock[g] ?? 0;
    if (q <= 0 || !e.s.sellFlags[g]) continue;
    out.push({ good: g, qty: q, money: floorM(q * sellUnit(e, g, seller)) });
  }
  return out;
}

/** Продать всё с галочкой. commission — доля продавца. Возвращает выручку в кошелёк. */
export function sellAll(e: Engine, seller: Ref, commission: number): number {
  let total = 0;
  const who = e.nameOf(seller);
  const id = seller.slice(5);
  for (const p of salePlan(e, seller)) {
    const net = p.money - floorM(p.money * Math.max(0, Math.min(1, commission)));
    addGoods(e, p.good, -p.qty);
    addExact(e, WORLD, "money", net, `sale:${id}`);
    total += net;
    e.pushLine(e.text("log_sold", { who, item: e.idx.goods.get(p.good)!.name, qty: p.qty, money: net }), "good");
  }
  return total;
}

export function rawCost(e: Engine, good: string, qty: number, buyer: Ref): number {
  const g = e.idx.goods.get(good);
  if (!g) return 0;
  return ceilM(qty * buyUnitPrice(e, g.price, buyer));
}

export function buyRaw(e: Engine, good: string, qty: number, buyer: Ref): number {
  if (qty <= 0) return 0;
  const cost = rawCost(e, good, qty, buyer);
  addExact(e, WORLD, "money", -cost, `purchase:${buyer.slice(5)}`);
  addGoods(e, good, qty);
  e.pushLine(e.text("log_bought", { who: e.nameOf(buyer), item: e.idx.goods.get(good)!.name, qty, money: cost }), "info");
  return cost;
}

export function itemPrice(e: Engine, type: string, buyer: Ref): number {
  const d = e.idx.items.get(type);
  return ceilM(buyUnitPrice(e, d?.price ?? 0, buyer));
}

export function buyItem(e: Engine, type: string, buyer: Ref): number {
  const cost = itemPrice(e, type, buyer);
  addExact(e, WORLD, "money", -cost, `purchase:${buyer.slice(5)}`);
  giveItem(e, type, e.heroRef);
  e.pushLine(e.text("log_bought", { who: e.nameOf(buyer), item: e.idx.items.get(type)!.name, qty: 1, money: cost }), "info");
  return cost;
}

/** Предметы лавки, открытые сейчас. */
export function shopOpen(e: Engine): string[] {
  return (e.settings.shop ?? []).filter((id) => {
    const d = e.idx.items.get(id);
    // в лавке — только инструменты (core.md 3.6)
    return d && d.kind === "tool" && evalCond(e, d.open_when ?? null, { self: e.heroRef, actor: e.heroRef });
  });
}

export function goodVisible(e: Engine, good: string): boolean {
  const g = e.idx.goods.get(good);
  if (!g) return false;
  return evalCond(e, g.visible ?? null, { self: e.heroRef });
}

/** Сырьё рынка: товары с buy: true, видимые игроку. */
export function rawGoods(e: Engine): string[] {
  return [...e.idx.goods.values()].filter((g) => g.buy && goodVisible(e, g.id)).map((g) => g.id);
}

/** Сделка торговца: продать всё с галочкой, докупить сырьё до цели. */
export function traderDeal(e: Engine, traderId: string): void {
  const ref = charRef(traderId);
  sellAll(e, ref, finalValue(e, ref, "commission"));
  const target = e.settings.trader_raw_target ?? {};
  for (const [good, want] of Object.entries(target)) {
    if (!e.idx.goods.has(good)) continue;
    const need = Math.max(0, Math.floor(want - (e.s.stock[good] ?? 0)));
    if (!need) continue;
    // покупаем, сколько хватает денег
    const unit = buyUnitPrice(e, e.idx.goods.get(good)!.price, ref);
    const money = finalValue(e, WORLD, "money");
    let q = need;
    if (unit > 0) q = Math.min(need, Math.floor((money + EPS) / unit));
    while (q > 0 && rawCost(e, good, q, ref) > money + EPS) q--;
    if (q > 0) buyRaw(e, good, q, ref);
  }
}
