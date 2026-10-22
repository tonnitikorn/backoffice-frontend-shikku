"use client";

import { formatMoney } from "@/lib/format";

export interface PromotionOption {
  _id: string;
  name: string;
  type: "percent" | "amount" | "buy_x_get_y" | "spend_x_get_y" | string;
  config: { percentOff?: number; amountOff?: number; buyQty?: number; getQty?: number; spendThreshold?: number; spendDiscountAmount?: number };
  endAt: string;
  saving: number; // what this promotion alone would take off the current cart
}

/** "ลด 10%", "ลด ฿50/ชิ้น", "ซื้อ 2 แถม 1", "ครบ ฿1,000 ลด ฿100". */
function describe(p: PromotionOption) {
  const c = p.config;
  if (p.type === "percent") return `ลด ${c.percentOff ?? 0}%`;
  if (p.type === "amount") return `ลด ฿${formatMoney(c.amountOff ?? 0)}/ชิ้น`;
  if (p.type === "buy_x_get_y") return `ซื้อ ${c.buyQty ?? 0} แถม ${c.getQty ?? 0}`;
  if (p.type === "spend_x_get_y") return `ครบ ฿${formatMoney(c.spendThreshold ?? 0)} ลด ฿${formatMoney(c.spendDiscountAmount ?? 0)}`;
  return "";
}

/**
 * Promotions only apply when picked here. Each chip shows what it would save on this cart;
 * ones that don't fit the items yet can still be picked and kick in once they do.
 */
export function PromotionPicker({ options, selected, onChange }: { options: PromotionOption[] | undefined; selected: string[]; onChange: (ids: string[]) => void }) {
  if (!options) return null;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div>
      <p className="label">โปรโมชัน</p>
      {options.length === 0 ? (
        <p className="text-xs text-zinc-400">ไม่มีโปรโมชันที่ใช้ได้กับช่องทางนี้</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {options.map((p) => {
            const on = selected.includes(p._id);
            return (
              <button
                key={p._id}
                type="button"
                onClick={() => toggle(p._id)}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-sm ${
                  on ? "border-primary-300 bg-primary-50 text-primary-900" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <span className="min-w-0">
                  <span className="mr-1.5">{on ? "✓" : "+"}</span>
                  {p.name}
                  <span className="ml-1.5 text-xs text-zinc-500">{describe(p)}</span>
                </span>
                <span className={`shrink-0 text-xs tabular-nums ${p.saving > 0 ? "text-primary-700" : "text-zinc-400"}`}>
                  {p.saving > 0 ? `-฿${formatMoney(p.saving)}` : "ยังไม่เข้าเงื่อนไข"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {selected.length > 1 && <p className="mt-1 text-xs text-zinc-400">เลือกหลายโปรได้ แต่สินค้าแต่ละชิ้นจะได้โปรที่ลดมากสุดเพียงโปรเดียว</p>}
    </div>
  );
}
