"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { WorkBook } from "xlsx";
import { apiFetch, ApiClientError } from "@/lib/apiClient";
import { formatMoney } from "@/lib/format";
import { Modal, errorMessage } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Column definitions                                                   */
/* ------------------------------------------------------------------ */

type FieldKey =
  | "name"
  | "shortCode"
  | "seriesName"
  | "type"
  | "brand"
  | "category"
  | "unit"
  | "price"
  | "powerPrice"
  | "cost"
  | "minStock"
  | "wearDays"
  | "dia"
  | "bc"
  | "color"
  | "colorCode"
  | "powers"
  | "barcode";

// Same order and wording as the "เพิ่มสินค้า" form, so the template reads like the form.
const FIELDS: { key: FieldKey; label: string; aliases: string[]; required?: boolean }[] = [
  { key: "name", label: "ชื่อรุ่น", required: true, aliases: ["ชื่อสินค้า", "ชื่อ", "สินค้า", "ชื่อรุ่น", "รุ่น", "product", "productname", "name", "model"] },
  { key: "shortCode", label: "รหัสย่อ (ใช้ใน SKU)", aliases: ["รหัสย่อ", "รหัสย่อ(ใช้ในsku)", "รหัสรุ่น", "shortcode", "code", "modelcode"] },
  { key: "seriesName", label: "ซีรีส์", aliases: ["ซีรีส์", "ซีรี่ส์", "series"] },
  { key: "type", label: "ประเภท", aliases: ["ประเภท", "ประเภทสินค้า", "type"] },
  { key: "brand", label: "แบรนด์", aliases: ["แบรนด์", "ยี่ห้อ", "brand"] },
  { key: "category", label: "หมวดหมู่", aliases: ["หมวดหมู่", "หมวด", "category"] },
  { key: "unit", label: "หน่วยนับ", aliases: ["หน่วย", "หน่วยนับ", "unit", "uom"] },
  { key: "price", label: "ราคาขาย 0.00 / ไม่มีสายตา (บาท)", aliases: ["ราคา", "ราคาขาย", "ราคาปกติ", "price", "ราคาขาย(บาท)", "ราคาขาย000/ไม่มีสายตา", "ราคาขาย000/ไม่มีสายตา(บาท)"] },
  { key: "powerPrice", label: "ราคาขาย ค่าสายตา (บาท)", aliases: ["ราคาขายค่าสายตา", "ราคาขายค่าสายตา(บาท)", "ราคาค่าสายตา", "ราคาสายตา", "powerprice"] },
  { key: "cost", label: "ต้นทุน (บาท)", aliases: ["ต้นทุน", "ต้นทุน(บาท)", "ราคาทุน", "cost"] },
  { key: "minStock", label: "สต๊อกขั้นต่ำ", aliases: ["สต๊อกขั้นต่ำ", "สต็อกขั้นต่ำ", "minstock"] },
  { key: "wearDays", label: "ระยะใส่ (วัน)", aliases: ["ระยะใส่", "ระยะเวลาใส่", "ระยะใส่(วัน)", "อายุการใช้งาน", "wear", "weardays"] },
  { key: "dia", label: "DIA", aliases: ["dia"] },
  { key: "bc", label: "BC", aliases: ["bc"] },
  { key: "color", label: "สี", aliases: ["สี", "color", "colour"] },
  { key: "colorCode", label: "รหัสสี", aliases: ["รหัสสี", "colorcode"] },
  { key: "powers", label: "ค่าสายตา", aliases: ["ค่าสายตา", "สายตา", "power", "powers", "sph"] },
  { key: "barcode", label: "Barcode", aliases: ["barcode", "บาร์โค้ด"] },
];

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[\s_\-.()]/g, "");

type Mapping = Partial<Record<FieldKey, number>>;

function detectHeader(grid: string[][]): { headerRow: number; mapping: Mapping } {
  let best = { headerRow: 0, mapping: {} as Mapping, score: 0 };
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const mapping: Mapping = {};
    grid[r].forEach((cell, c) => {
      const n = norm(cell);
      if (!n) return;
      const field = FIELDS.find((f) => mapping[f.key] === undefined && [f.label, ...f.aliases].some((a) => norm(a) === n));
      if (field) mapping[field.key] = c;
    });
    const score = Object.keys(mapping).length + (mapping.name !== undefined ? 5 : 0);
    if (score > best.score) best = { headerRow: r, mapping, score };
  }
  return { headerRow: best.headerRow, mapping: best.mapping };
}

function columnLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

async function loadXlsx() {
  return import("xlsx"); // loaded on demand — only admins importing need it
}

async function downloadTemplate() {
  const XLSX = await loadXlsx();
  const header = FIELDS.map((f) => f.label);
  const row = (v: Partial<Record<FieldKey, string>>) => FIELDS.map((f) => v[f.key] ?? "");
  const lens = { type: "คอนแทคเลนส์", brand: "Olivia", category: "Mini", unit: "คู่", price: "109", powerPrice: "129", cost: "55", minStock: "2", wearDays: "365", dia: "14.2", bc: "8.6" };
  const powers = "0, -0.50 ถึง -6.00 ขั้นละ 0.25";
  const rows = [
    header,
    // Model 1: shared details on the first row, then one row per color (blank name = same model as above).
    row({ name: "Mini Olivia 850", shortCode: "MO850", ...lens, color: "Brown", powers }),
    row({ color: "Light Brown", powers }),
    row({ color: "Gray", powers }),
    // Model 2: fashion lens without power.
    row({ name: "Mini Olivia 800", shortCode: "MO800", ...lens, powerPrice: "", color: "Choco" }),
    row({ color: "Hazel" }),
    // General product: no color, no power.
    row({ name: "น้ำยาล้างคอนแทคเลนส์ 360ml", type: "สินค้าทั่วไป", unit: "ขวด", price: "159", cost: "90", minStock: "5", barcode: "8850000000001" }),
  ];
  const help = [
    ["วิธีกรอก (คอลัมน์เรียงเหมือนหน้าเพิ่มสินค้าในระบบ)"],
    [""],
    ["1. รุ่นสินค้า"],
    ["• ชื่อรุ่น: จำเป็น · เว้นว่างหรือใส่ - = รุ่นเดียวกับแถวบน"],
    ["• รหัสย่อ (ใช้ใน SKU) / ซีรีส์: เว้นว่างได้ ระบบสร้างรหัสย่อให้อัตโนมัติ"],
    [""],
    ["2. ข้อมูลร่วม (กรอกเฉพาะแถวแรกของแต่ละรุ่น)"],
    ["• ประเภท: คอนแทคเลนส์ (ค่าเริ่มต้น) หรือ สินค้าทั่วไป"],
    ["• แบรนด์/หมวดหมู่: ที่ยังไม่มีในระบบจะถูกสร้างให้"],
    ["• หน่วยนับ: คู่ ชิ้น กล่อง ขวด ชุด (ค่าเริ่มต้น: คอนแทคเลนส์ = คู่, สินค้าทั่วไป = ชิ้น)"],
    ["• ราคาขาย 0.00 / ไม่มีสายตา: ราคาของค่าสายตา 0.00 และสินค้าที่ไม่มีค่าสายตา"],
    ["• ราคาขาย ค่าสายตา: ราคาของค่าสายตาอื่นที่ไม่ใช่ 0.00 · เว้นว่าง = ราคาเดียวกัน"],
    ["• ต้นทุน / สต๊อกขั้นต่ำ / ระยะใส่ (วัน) / DIA / BC: ตัวเลข เว้นว่างได้"],
    [""],
    ["3. สี"],
    ["• 1 แถว = 1 สี · ไม่ใส่สี = ไม่แยกสี · รหัสสีเว้นว่างได้ ระบบสร้างให้"],
    [""],
    ["4. ค่าสายตา"],
    ["• ค่าเดียว -1.25 | หลายค่า 0, -0.50, -1.00 | ช่วง -0.50 ถึง -6.00 ขั้นละ 0.25 | ผสมกันได้ เช่น 0, -0.50 ถึง -6.00 ขั้นละ 0.25"],
    ["• เว้นว่าง = ไม่มีค่าสายตา (เลนส์แฟชั่น)"],
    [""],
    ["อื่นๆ"],
    ["• Barcode: ใส่ได้เฉพาะแถวที่มีค่าสายตาเดียวหรือไม่มีค่าสายตา · เว้นว่าง = ใช้รหัส SKU"],
    ["• นำเข้าซ้ำได้: รุ่นที่มีชื่อเดิมจะถูกเพิ่มเฉพาะสี/ค่าสายตาใหม่"],
    ["• สต๊อกตั้งต้นให้บันทึกที่หน้ารับสินค้าหลังนำเข้า"],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = FIELDS.map((f) => ({ wch: f.key === "powers" ? 32 : f.key === "name" ? 28 : Math.max(10, f.label.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "สินค้า");
  const helpWs = XLSX.utils.aoa_to_sheet(help);
  helpWs["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, helpWs, "วิธีใช้");
  XLSX.writeFile(wb, "shikkulens-product-template.xlsx");
}

/* ------------------------------------------------------------------ */
/* Modal                                                                */
/* ------------------------------------------------------------------ */

interface ImportPreview {
  errors: { row: number; message: string }[];
  newBrands: string[];
  newCategories: string[];
  newSkuCount: number;
  skippedCount: number;
  newProductCount: number;
  updatedProductCount: number;
  products: {
    row: number;
    name: string;
    shortCode: string;
    isNew: boolean;
    colors: { name: string; code: string; isNew: boolean }[];
    newSkuCount: number;
    skipped: number;
    sampleSku?: string;
    price: number;
  }[];
}

type RowPayload = { row: number } & Partial<Record<FieldKey, string>>;

export function ImportProductsModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [grid, setGrid] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ createdProducts: number; skuCount: number; skippedCount: number } | null>(null);

  const loadSheet = async (wb: WorkBook, name: string) => {
    const XLSX = await loadXlsx();
    const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "", blankrows: true });
    const g = data.map((r) => r.map((c) => String(c ?? "").trim()));
    const detected = detectHeader(g);
    setSheetName(name);
    setGrid(g);
    setHeaderRow(detected.headerRow);
    setMapping(detected.mapping);
    setPreview(null);
  };

  const onFile = async (file: File) => {
    setError(null);
    setPreview(null);
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      setFileName(file.name);
      setWorkbook(wb);
      await loadSheet(wb, wb.SheetNames[0]);
    } catch {
      setError("อ่านไฟล์ไม่ได้ — รองรับ .xlsx .xls .csv");
    }
  };

  const headers = grid[headerRow] ?? [];
  const dataRows: RowPayload[] = grid
    .slice(headerRow + 1)
    .map((cells, i) => {
      const payload: RowPayload = { row: headerRow + i + 2 }; // 1-based spreadsheet row number
      for (const f of FIELDS) {
        const col = mapping[f.key];
        if (col !== undefined && cells[col] !== undefined && cells[col] !== "") payload[f.key] = cells[col];
      }
      return payload;
    })
    .filter((r) => Object.keys(r).length > 1);

  const previewMutation = useMutation({
    mutationFn: () => apiFetch<ImportPreview>("/products/import/preview", { method: "POST", body: { rows: dataRows } }),
    onSuccess: (data) => {
      setError(null);
      setPreview(data);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const importMutation = useMutation({
    mutationFn: () => apiFetch<{ createdProducts: number; skuCount: number; skippedCount: number }>("/products/import", { method: "POST", body: { rows: dataRows } }),
    onSuccess: (data) => {
      setDone(data);
      onImported();
    },
    onError: (err) => {
      const details = err instanceof ApiClientError ? (err.details as { errors?: ImportPreview["errors"] } | undefined) : undefined;
      if (details?.errors && preview) setPreview({ ...preview, errors: details.errors });
      setError(errorMessage(err));
    },
  });

  const setMap = (key: FieldKey, col: string) => {
    setPreview(null);
    setMapping((m) => {
      const next = { ...m };
      if (col === "") delete next[key];
      else next[key] = Number(col);
      return next;
    });
  };

  if (done) {
    return (
      <Modal title="นำเข้าสินค้าสำเร็จ" onClose={onClose} size="sm" footer={<button className="btn-primary" onClick={onClose}>เสร็จสิ้น</button>}>
        <p className="text-sm text-zinc-600">
          สร้างสินค้าใหม่ {done.createdProducts} รายการ · เพิ่ม SKU {done.skuCount} รายการ
          {done.skippedCount > 0 && ` · ข้าม ${done.skippedCount} รายการที่มีอยู่แล้ว`}
        </p>
      </Modal>
    );
  }

  const canImport = preview && preview.errors.length === 0 && preview.newSkuCount > 0;

  return (
    <Modal
      title="นำเข้าสินค้าจาก Excel"
      onClose={onClose}
      size="2xl"
      footer={
        <>
          <button className="btn-ghost mr-auto" onClick={downloadTemplate}>
            ดาวน์โหลดไฟล์ตัวอย่าง
          </button>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          {canImport ? (
            <button className="btn-primary" disabled={importMutation.isPending} onClick={() => importMutation.mutate()}>
              {importMutation.isPending ? "กำลังนำเข้า..." : `นำเข้า ${preview.newSkuCount} SKU`}
            </button>
          ) : (
            <button
              className="btn-primary"
              disabled={dataRows.length === 0 || mapping.name === undefined || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? "กำลังตรวจสอบ..." : "ตรวจสอบข้อมูล"}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {/* File picker */}
        <div
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center transition-colors hover:border-primary-400 hover:bg-primary-50/40"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          {fileName ? (
            <>
              <p className="text-sm font-medium text-zinc-800">{fileName}</p>
              <p className="mt-0.5 text-xs text-zinc-400">พบข้อมูล {dataRows.length} แถว · คลิกเพื่อเปลี่ยนไฟล์</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-700">เลือกไฟล์ หรือลากไฟล์มาวางที่นี่</p>
              <p className="mt-0.5 text-xs text-zinc-400">.xlsx .xls .csv · 1 แถว = 1 สีของ 1 รุ่น · ชื่อว่างหรือ “-” = รุ่นเดียวกับแถวบน</p>
            </>
          )}
        </div>

        {workbook && (
          <>
            {/* Sheet + header row */}
            <div className="flex flex-wrap items-end gap-4">
              {workbook.SheetNames.length > 1 && (
                <div>
                  <label className="label">ชีต</label>
                  <select className="input w-auto" value={sheetName} onChange={(e) => loadSheet(workbook, e.target.value)}>
                    {workbook.SheetNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">แถวหัวตาราง</label>
                <select
                  className="input w-auto"
                  value={headerRow}
                  onChange={(e) => {
                    const r = Number(e.target.value);
                    setHeaderRow(r);
                    setMapping(detectHeader([grid[r] ?? []]).mapping);
                    setPreview(null);
                  }}
                >
                  {grid.slice(0, 10).map((row, i) => (
                    <option key={i} value={i}>
                      แถว {i + 1}: {row.filter(Boolean).slice(0, 3).join(" | ") || "(ว่าง)"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Column mapping */}
            <div>
              <p className="label">จับคู่คอลัมน์ (ระบบเดาให้แล้ว แก้ได้)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className={`w-24 shrink-0 text-xs ${mapping[f.key] !== undefined ? "text-zinc-700" : "text-zinc-400"}`}>
                      {f.label}
                      {f.required && <span className="text-red-500"> *</span>}
                    </span>
                    <select className="input input-sm min-w-0" value={mapping[f.key] ?? ""} onChange={(e) => setMap(f.key, e.target.value)}>
                      <option value="">— ไม่ใช้ —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {columnLetter(i)}: {h || "(ไม่มีหัว)"}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Raw preview of first rows */}
            {!preview && dataRows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-zinc-100">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>แถว</th>
                      {FIELDS.filter((f) => mapping[f.key] !== undefined).map((f) => (
                        <th key={f.key}>{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.slice(0, 8).map((r) => (
                      <tr key={r.row}>
                        <td className="text-xs text-zinc-400">{r.row}</td>
                        {FIELDS.filter((f) => mapping[f.key] !== undefined).map((f) => (
                          <td key={f.key} className="whitespace-nowrap text-xs">
                            {r[f.key] ?? <span className="text-zinc-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dataRows.length > 8 && <p className="px-4 py-2 text-xs text-zinc-400">…และอีก {dataRows.length - 8} แถว</p>}
              </div>
            )}
          </>
        )}

        {/* Validation result */}
        {preview && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="สินค้าใหม่" value={preview.newProductCount} />
              <Stat label="เพิ่มเข้าสินค้าเดิม" value={preview.updatedProductCount} />
              <Stat label="SKU ใหม่" value={preview.newSkuCount} highlight />
              <Stat label="ข้าม (มีอยู่แล้ว)" value={preview.skippedCount} />
            </div>
            {(preview.newBrands.length > 0 || preview.newCategories.length > 0) && (
              <p className="text-xs text-zinc-500">
                จะสร้างใหม่: {[...preview.newBrands.map((b) => `แบรนด์ ${b}`), ...preview.newCategories.map((c) => `หมวดหมู่ ${c}`)].join(", ")}
              </p>
            )}

            {preview.errors.length > 0 && (
              <div className="rounded-xl bg-red-50 p-4">
                <p className="mb-2 text-sm font-medium text-red-700">พบข้อผิดพลาด {preview.errors.length} รายการ — แก้ในไฟล์แล้วเลือกไฟล์ใหม่</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-600">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      {e.row > 0 && <span className="font-medium">แถว {e.row}: </span>}
                      {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-zinc-100">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>สินค้า</th>
                    <th>รหัสย่อ</th>
                    <th>สี</th>
                    <th className="text-right">ราคา</th>
                    <th className="text-right">SKU ใหม่</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.products.map((p) => (
                    <tr key={p.row}>
                      <td>
                        <span className="font-medium text-zinc-800">{p.name}</span>
                        <span className={`ml-2 ${p.isNew ? "badge-primary" : "badge-muted"}`}>{p.isNew ? "ใหม่" : "มีอยู่แล้ว"}</span>
                      </td>
                      <td className="font-mono text-xs">{p.shortCode}</td>
                      <td className="max-w-64 text-xs text-zinc-500">{p.colors.map((c) => c.name).join(", ") || "-"}</td>
                      <td className="text-right tabular-nums">฿{formatMoney(p.price)}</td>
                      <td className="text-right tabular-nums">
                        {p.newSkuCount}
                        {p.skipped > 0 && <span className="text-xs text-zinc-400"> (+{p.skipped} เดิม)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>
    </Modal>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-primary-50" : "bg-zinc-50"}`}>
      <p className={`text-xs ${highlight ? "text-primary-700" : "text-zinc-400"}`}>{label}</p>
      <p className={`text-lg font-semibold ${highlight ? "text-primary-900" : "text-zinc-800"}`}>{value}</p>
    </div>
  );
}
