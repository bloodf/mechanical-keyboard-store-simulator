/** Suppliers: browse parts by category, fill a cart, pick shipping, place the order. */
import { play } from "../../audio/engine";
import { LUBE_JAR, SKU_LUBE, SWITCH_PACKS, packPrice, skuCase, skuFoam, skuKeycaps, skuPcb, skuPlate, skuStab, skuSwitch, unitPrice, type Footprint, type Shipping, type SkuKind } from "../../build/stock";
import { cartTotal, formatClock, placeSupplierOrder, type CartLine } from "../../build/workshop";
import { nowAbs, type GameState } from "../../core/state";
import type { Catalog } from "../../data/catalog";
import { LAYOUT_IDS, type LayoutId } from "../../data/layouts";
import { CASE_MATERIALS, DAMPENING, PCBS, PLATES, STABS, isUnlocked } from "../../data/parts";
import { PROFILE_GEO } from "../../data/profiles";
import { formatMoney, t, type MessageKey } from "../../i18n";
import { openSheet, scrollList } from "../../gui/sheet";
import { C, R, S, T } from "../../gui/theme";
import type { Ui } from "../../gui/ui";
import { button, drawBox, group, H_CENTER, H_RIGHT, label, panel, stack, swatch, V_BOTTOM, V_CENTER } from "../../gui/widgets";
import type { SupplierPreset } from "../bench/types";
import { caseIcon } from "../bench/icons";
import { colorName, skuView } from "../skuText";

const TABS: SkuKind[] = ["case", "pcb", "plate", "stab", "sw", "kc", "foam", "lube"];

/** The cart survives closing the panel (not saved). */
const cart: CartLine[] = [];
let shipping: Shipping = "standard";

export interface SuppliersOpts {
  state: GameState;
  catalog: Catalog;
  builds: number;
  preset?: SupplierPreset;
  persist: () => void;
  onOrdered: () => void;
  onWait: () => void;
}

export function openSuppliers(ui: Ui, o: SuppliersOpts) {
  const s = o.state;
  let tab: SkuKind = o.preset?.tab ?? "case";
  let layout: LayoutId = o.preset?.layout ?? "65";
  let fp: Footprint = o.preset?.fp ?? "mx";
  const caseColor: Record<string, string> = {};
  const addToCart = (sku: string, qty: number) => {
    const l = cart.find((x) => x.sku === sku);
    if (l) l.qty += qty;
    else cart.push({ sku, qty });
    play("ui.toggle");
  };
  return openSheet(ui, { name: "suppliers", title: () => `🛒 ${t("sup.title")}` }, (body, area, rerender) => {
    const cartW = ui.portrait ? 0 : 320;
    const leftW = area.w - cartW - (cartW ? S.lg : 0);
    // --- category tabs
    const tabs = stack({ horizontal: true, h: 38, spacing: 5 });
    const tw = Math.min(128, (leftW - 7 * 5) / TABS.length);
    for (const k of TABS) tabs.addControl(button(t(`stock.cat.${k}` as MessageKey), { w: tw, h: 38, size: "sm", variant: tab === k ? "dark" : "secondary", testId: `suptab-${k}`, onClick: () => ((tab = k), rerender()) }));
    body.addControl(tabs);
    // --- filters
    let y = 46;
    const filters = stack({ horizontal: true, h: 34, spacing: 5, y });
    if (tab === "case" || tab === "pcb" || tab === "plate") {
      filters.addControl(label(t("sup.layout"), { size: T.small, weight: 700, color: C.inkSoft, w: 64, h: 34 }));
      for (const l of LAYOUT_IDS) filters.addControl(button(t(`layout.name.${l}` as MessageKey), { w: 74, h: 34, size: "sm", variant: layout === l ? "dark" : "secondary", testId: `suplayout-${l}`, onClick: () => ((layout = l), rerender()) }));
    }
    if (tab === "pcb" || tab === "plate" || tab === "stab") {
      filters.addControl(label(t("sup.footprint"), { size: T.small, weight: 700, color: C.inkSoft, w: 90, h: 34 }));
      for (const f of ["mx", "choc"] as Footprint[]) filters.addControl(button(t(`sup.fp.${f}` as MessageKey), { w: f === "mx" ? 96 : 160, h: 34, size: "sm", variant: fp === f ? "dark" : "secondary", testId: `supfp-${f}`, onClick: () => ((fp = f), rerender()) }));
    }
    if (filters.children.length) {
      body.addControl(filters);
      y += 42;
    } else y += 4;
    const { viewer, content } = scrollList(leftW, area.h - y, "sup-list");
    viewer.top = `${y}px`;
    body.addControl(viewer);
    const rw = leftW - 24;
    const row = (id: string, icon: Parameters<typeof drawBox>[0], title: string, sub: string, locked: number | null, right: (r: ReturnType<typeof panel>) => void) => {
      const r = panel({ w: rw, h: 70, radius: R.sm, bg: C.white, shadow: false, border: C.line, thickness: 1, name: `sup-${id}` });
      if (locked) r.alpha = 0.6;
      r.addControl(drawBox(icon, { w: 76, h: 56, x: 8, y: 7 }));
      r.addControl(label(title, { size: T.body, weight: 700, x: 94, y: 8, h: 24, w: rw - 420 }));
      r.addControl(label(sub, { size: T.tiny + 1, color: C.inkSoft, x: 94, y: 34, h: 30, w: rw - 420, ellipsis: true, valign: 0 }));
      if (locked) r.addControl(label(t("bench.locked", { count: locked }), { size: T.small, weight: 700, color: C.inkSoft, x: -S.md, w: 200, h: 70, align: 1, ha: H_RIGHT }));
      else right(r);
      content.addControl(r);
    };
    const lockOf = (req: { builds?: number } | undefined) => (isUnlocked(req, o.builds) ? null : (req?.builds ?? null));
    const priceAdd = (r: ReturnType<typeof panel>, sku: string, qty = 1, testId = `add-${sku.replace(/\//g, "_")}`) => {
      const u = unitPrice(sku, o.catalog)!;
      const have = s.inventory[sku] ?? 0;
      const box = stack({ horizontal: true, h: 44, spacing: S.sm, x: -S.md, ha: H_RIGHT, va: V_CENTER });
      box.addControl(label(t("sup.inStock", { count: have }), { size: T.tiny + 1, weight: 600, color: C.inkSoft, w: 90, h: 44, align: 1 }));
      box.addControl(label(formatMoney(u * qty), { size: T.body, weight: 700, color: C.good, w: 80, h: 44, align: 1 }));
      box.addControl(button(t("sup.add"), { w: 74, h: 40, size: "sm", variant: "primary", testId, onClick: () => (addToCart(sku, qty), rerender()) }));
      r.addControl(box);
    };
    if (tab === "case") {
      for (const m of CASE_MATERIALS) {
        const colors = o.catalog.caseColors[m.id];
        const cid = caseColor[m.id] ?? colors[0].id;
        const c = colors.find((x) => x.id === cid) ?? colors[0];
        const sku = skuCase(m.id, layout, c.id);
        row(`case-${m.id}`, caseIcon(c.hex, m.id), `${t(`layout.name.${layout}` as MessageKey)} ${t(`part.case.${m.id}` as MessageKey)} · ${colorName(c)}`, "", lockOf(m.requires), (r) => {
          const sw = stack({ horizontal: true, h: 24, spacing: 4, x: 94, y: 38 });
          for (const col of colors.slice(0, 12)) sw.addControl(swatch(col.hex, col.id === c.id, { size: 22, testId: `swatch-${m.id}-${col.id}`, onClick: () => ((caseColor[m.id] = col.id), rerender()) }));
          r.addControl(sw);
          priceAdd(r, sku);
        });
      }
    } else if (tab === "pcb") {
      for (const p of PCBS) row(`pcb-${p.id}`, skuView(skuPcb(p.id, layout, fp), o.catalog).icon, skuView(skuPcb(p.id, layout, fp), o.catalog).title, skuView(skuPcb(p.id, layout, fp), o.catalog).sub, lockOf(p.requires), (r) => priceAdd(r, skuPcb(p.id, layout, fp)));
    } else if (tab === "plate") {
      for (const p of PLATES.filter((x) => x.id !== "none")) {
        const sku = skuPlate(p.id, layout, fp);
        const v = skuView(sku, o.catalog);
        row(`plate-${p.id}`, v.icon, v.title, v.sub, lockOf(p.requires), (r) => priceAdd(r, sku));
      }
    } else if (tab === "stab") {
      for (const st of STABS) {
        const sku = skuStab(st.id, fp);
        const v = skuView(sku, o.catalog);
        row(`stab-${st.id}`, v.icon, v.title, v.sub, lockOf(st.requires), (r) => priceAdd(r, sku));
      }
    } else if (tab === "sw") {
      for (const sw of o.catalog.switches) {
        const sku = skuSwitch(sw.id);
        const v = skuView(sku, o.catalog);
        row(`sw-${sw.id}`, v.icon, v.title, `${v.sub} · ${t("sup.inStock", { count: s.inventory[sku] ?? 0 })}`, lockOf(sw.requires), (r) => {
          const box = stack({ horizontal: true, h: 52, spacing: 4, x: -S.md, ha: H_RIGHT, va: V_CENTER });
          for (const pk of SWITCH_PACKS)
            box.addControl(button(`${pk.n}`, { w: 70, h: 50, size: "sm", variant: "secondary", sub: formatMoney(packPrice(sw.pricePerSwitch, pk.n)), testId: `pack-${sw.id}-${pk.n}`, onClick: () => (addToCart(sku, pk.n), rerender()) }));
          r.addControl(box);
        });
      }
    } else if (tab === "kc") {
      for (const k of o.catalog.keycaps) {
        const sku = skuKeycaps(k.id);
        const v = skuView(sku, o.catalog);
        row(`kc-${k.id}`, v.icon, v.title, `${v.sub}${PROFILE_GEO[k.profile].mount === "choc" ? " · Choc" : ""}`, lockOf(k.requires), (r) => priceAdd(r, sku));
      }
    } else if (tab === "foam") {
      for (const d of DAMPENING) {
        const sku = skuFoam(d.id);
        const v = skuView(sku, o.catalog);
        row(`foam-${d.id}`, v.icon, v.title, v.sub, lockOf(d.requires), (r) => priceAdd(r, sku));
      }
    } else {
      const v = skuView(SKU_LUBE, o.catalog);
      row("lube", v.icon, t("sup.jar"), v.title, null, (r) => priceAdd(r, SKU_LUBE, LUBE_JAR, "add-lube"));
    }
    if (cartW) body.addControl(cartPanel(cartW, area.h, leftW + S.lg));
    else body.addControl(button(`🛒 ${t("sup.cart")} (${cart.length})`, { w: 180, h: 44, ha: H_RIGHT, va: V_BOTTOM, variant: "primary", testId: "sup-cart", onClick: () => ui.modal({ w: 360, h: 600, name: "cart", dismissable: true }, (p, close) => p.addControl(cartPanel(340, 580, 10, close))) }));

    function cartPanel(w: number, h: number, x: number, closeModal?: () => void) {
      const p = panel({ w, h, x, radius: R.md, bg: C.paper2, shadow: false, name: "sup-cart" });
      const col = stack({ w: w - 2 * S.md, x: S.md, y: S.md, spacing: 4 });
      col.addControl(label(`🛒 ${t("sup.cart")}`, { size: T.h3, weight: 700 }));
      if (!cart.length) col.addControl(label(t("sup.cartEmpty"), { size: T.small, color: C.inkSoft, h: 30 }));
      cart.forEach((l, i) => {
        const g = group({ w: w - 2 * S.md, h: 34 });
        g.addControl(label(`${l.qty}× ${skuView(l.sku, o.catalog).title}`, { size: T.tiny + 1, weight: 600, w: w - 140, h: 34, ellipsis: true }));
        g.addControl(button("✕", { w: 30, h: 28, size: "sm", variant: "ghost", ha: H_RIGHT, testId: `cart-rm-${i}`, onClick: () => (cart.splice(i, 1), rerender()) }));
        col.addControl(g);
      });
      p.addControl(col);
      // shipping + totals at the bottom
      const foot = stack({ w: w - 2 * S.md, x: S.md, y: -S.md, va: V_BOTTOM, spacing: 6 });
      foot.addControl(label(t("sup.shipping"), { size: T.small, weight: 700, color: C.inkSoft, h: 20 }));
      const tot = cartTotal(cart, o.catalog, shipping);
      for (const sh of ["standard", "express"] as Shipping[]) {
        const ct = cartTotal(cart, o.catalog, sh);
        foot.addControl(button(t(`sup.ship.${sh}`), { w: "100%", h: 44, size: "sm", variant: shipping === sh ? "dark" : "secondary", sub: ct && ct.fee ? `+${formatMoney(ct.fee)}` : t("sup.free"), testId: `ship-${sh}`, onClick: () => ((shipping = sh), rerender()) }));
      }
      const line = (k: string, v: string, bold = false) => {
        const g = group({ w: w - 2 * S.md, h: 22 });
        g.addControl(label(k, { size: T.small, weight: bold ? 700 : 500, color: C.inkSoft }));
        g.addControl(label(v, { size: bold ? T.body : T.small, weight: 700, align: 1 }));
        return g;
      };
      if (tot) {
        foot.addControl(line(t("sup.items"), formatMoney(tot.items)));
        foot.addControl(line(t("sup.fee"), tot.fee ? formatMoney(tot.fee) : t("sup.free")));
        foot.addControl(line(t("sup.total"), formatMoney(tot.total), true));
      }
      const poor = !!tot && tot.total > s.money;
      if (poor) foot.addControl(label(t("sup.tooPoor"), { size: T.small, weight: 700, color: C.bad, h: 20 }));
      foot.addControl(
        button(t("sup.order"), {
          w: "100%",
          variant: "primary",
          disabled: !cart.length || poor,
          testId: "sup-order",
          onClick: () => {
            const sh = placeSupplierOrder(s, cart, shipping, o.catalog);
            if (!sh) return ui.toast(t("sup.tooPoor"), "error");
            cart.length = 0;
            play("money.spend");
            const when = sh.express ? t("sup.whenAt", { time: formatClock(sh.arrives % 1440) }) : t("sup.whenTomorrow");
            ui.toast(t("sup.ordered", { when }), "good");
            o.persist();
            o.onOrdered();
            closeModal?.();
            rerender();
          },
        }),
      );
      // express parcels on the way: skip ahead
      const pending = s.shipments.filter((x) => x.express && x.arrives > nowAbs(s));
      if (pending.length) {
        const next = Math.min(...pending.map((x) => x.arrives));
        foot.addControl(button(`⏳ ${t("sup.wait")} (${formatClock(next % 1440)})`, { w: "100%", h: 40, size: "sm", testId: "sup-wait", onClick: () => (o.onWait(), rerender()) }));
      }
      p.addControl(foot);
      return p;
    }
    void H_CENTER;
  });
}
