"use client";

/* eslint-disable @next/next/no-img-element -- tray photos are served by the API origin */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload, assetUrl } from "@/lib/apiClient";
import { errorMessage } from "@/components/ui";
import { lineLabel } from "../purchases/bulk-lines";

interface Ref<T> {
  _id: string;
  name?: string;
  colorName?: string;
  images?: string[];
  skuCode?: string;
  power?: number;
  __t?: T;
}
interface ScanRow {
  model: string;
  color: string;
  power: number | null;
  vials: number;
  confidence: "high" | "low";
  note?: string;
  productId?: Ref<"product"> | null;
  variantId?: Ref<"variant"> | null;
  skuId?: Ref<"sku"> | null;
  matchError?: string;
}
interface Scan {
  _id: string;
  imageUrl: string;
  status: "awaiting" | "processing" | "ready" | "failed";
  rows: ScanRow[];
  samples: { model: string; color: string; box: Box; variantId?: Ref<"variant"> | null }[];
  unreadable: number;
  error?: string;
}
type Box = { x: number; y: number; w: number; h: number };

/** What the add-stock form receives: the same shape its other pickers produce, plus why the reader was unsure. */
export interface PhotoLine {
  skuId: string;
  skuCode: string;
  productId: string;
  productName: string;
  detail: string;
  qty: number;
  flag?: string;
}

const fmtPower = (p: number | null | undefined) => (p === null || p === undefined || p === 0 ? "0.00" : p.toFixed(2));

/**
 * Alternative to typing quantities: attach a tray photo, the backend reads every
 * vial cap, and the readable rows are dropped into the form for the user to check.
 * Without an API key the backend leaves the scan 'awaiting': the user reads it in
 * the Claude app with the copied prompt and pastes the JSON reply back here.
 */
export function PhotoFill({ branchId, onFill }: { branchId: string; onFill: (lines: PhotoLine[]) => void }) {
  const [scanId, setScanId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vialsPerUnit, setVialsPerUnit] = useState(2);
  const [usePhotos, setUsePhotos] = useState(true);
  const [filled, setFilled] = useState<string | null>(null);
  const qc = useQueryClient();

  const config = useQuery({ queryKey: ["photo-scan-config"], queryFn: () => apiFetch<{ configured: boolean }>("/stock/photo-scans/config") });
  const scanQuery = useQuery({
    queryKey: ["photo-scan", scanId],
    queryFn: () => apiFetch<{ item: Scan }>(`/stock/photo-scans/${scanId}`),
    enabled: Boolean(scanId),
    refetchInterval: (q) => (q.state.data?.item.status === "processing" ? 3000 : false),
  });
  const scan = scanQuery.data?.item;

  async function onFile(file: File) {
    setUploading(true);
    setError(null);
    setFilled(null);
    try {
      // Keep more pixels than product photos: the cap text is small.
      const res = await apiUpload<{ item: Scan }>("/stock/photo-scans", file, { fields: { branchId }, maxSide: 2800 });
      setScanId(res.item._id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  const matched = scan?.rows.filter((r) => r.skuId) ?? [];
  const unmatched = scan?.rows.filter((r) => !r.skuId) ?? [];
  const leftovers = matched.filter((r) => r.vials % vialsPerUnit !== 0);
  const newPhotos = (scan?.samples ?? []).filter((s) => s.variantId && !s.variantId.images?.length);

  async function fill() {
    if (!scan) return;
    const lines: PhotoLine[] = matched
      .map((r) => {
        const flags = [
          r.confidence === "low" ? `ระบบไม่แน่ใจ${r.note ? `: ${r.note}` : ""}` : null,
          r.vials % vialsPerUnit !== 0 ? `อ่านได้ ${r.vials} ขวด (มีเศษ)` : null,
        ].filter(Boolean);
        return {
          skuId: r.skuId!._id,
          skuCode: r.skuId!.skuCode ?? "",
          productId: r.productId!._id,
          productName: r.productId!.name ?? r.model,
          detail: lineLabel("", r.variantId?.colorName, r.skuId!.power ?? undefined),
          qty: Math.floor(r.vials / vialsPerUnit),
          flag: flags.length ? flags.join(" · ") : undefined,
        };
      })
      .filter((l) => l.qty > 0);
    onFill(lines);

    let uploaded = 0;
    if (usePhotos) {
      for (const s of newPhotos) {
        const blob = await cropSample(assetUrl(scan.imageUrl)!, s.box).catch(() => null);
        if (blob) {
          await apiUpload(`/products/variants/${s.variantId!._id}/images`, blob).catch(() => undefined);
          uploaded += 1;
        }
      }
    }
    setFilled(`ใส่ ${lines.length} รายการลงตารางด้านล่างแล้ว — ตรวจจำนวนก่อนกดเติม${uploaded ? ` · ตั้งรูปสีจากฝา ${uploaded} รูป` : ""}`);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-zinc-200 p-4">
      {!scan && (
        <div className="flex flex-wrap items-center gap-3">
          <label className={`btn-secondary cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            {uploading ? "กำลังอัปโหลด..." : "ถ่าย / เลือกรูปถาด"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onFile(f);
              }}
            />
          </label>
          <p className="text-xs text-zinc-500">
            ถ่ายตรงจากด้านบนให้อ่านฝาขวดได้{" "}
            {config.data?.configured === false
              ? "แล้วให้ Claude ในแอปอ่านรุ่น / สี / ค่าสายตา และวางผลกลับมา แทนการกรอกเอง"
              : "ระบบจะอ่านรุ่น / สี / ค่าสายตา แล้วใส่จำนวนให้แทนการกรอก"}
          </p>
        </div>
      )}

      {scan?.status === "awaiting" && (
        <ManualRead
          scan={scan}
          onDone={(item) => qc.setQueryData(["photo-scan", item._id], { item })}
          onCancel={() => setScanId(null)}
        />
      )}

      {scan?.status === "processing" && (
        <div className="flex items-center gap-3">
          <img src={assetUrl(scan.imageUrl)} alt="" className="h-16 w-16 rounded-lg object-cover" />
          <p className="text-sm text-zinc-600">กำลังอ่านฝาขวดทีละขวด... (ประมาณ 1–3 นาที)</p>
        </div>
      )}

      {scan?.status === "failed" && (
        <p className="error-text">
          อ่านรูปไม่สำเร็จ: {scan.error}{" "}
          <button className="link" onClick={() => setScanId(null)}>
            ลองรูปใหม่
          </button>
        </p>
      )}

      {scan?.status === "ready" && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href={assetUrl(scan.imageUrl)} target="_blank" rel="noreferrer" className="shrink-0">
            <img src={assetUrl(scan.imageUrl)} alt="รูปถาด" className="h-32 w-32 rounded-lg object-cover" />
          </a>
          <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
            <p className="text-zinc-700">
              อ่านได้ {matched.reduce((s, r) => s + r.vials, 0)} ขวด · {matched.length} รายการตรงกับสินค้าในระบบ
              {scan.unreadable > 0 && <span className="text-amber-600"> · อ่านไม่ออก {scan.unreadable} ขวด</span>}
            </p>
            {unmatched.length > 0 && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="mb-1 font-medium">ไม่ได้ใส่ให้ {unmatched.length} รายการ (เพิ่มเองด้วยแท็บอื่นได้):</p>
                {unmatched.map((r, i) => (
                  <p key={i}>
                    {r.model} / {r.color} / {fmtPower(r.power)} × {r.vials} ขวด — {r.matchError}
                  </p>
                ))}
              </div>
            )}
            {leftovers.length > 0 && <p className="text-xs text-amber-600">{leftovers.length} รายการจำนวนขวดไม่ลงตัว — ปัดลงแล้ว ตรวจในตาราง</p>}
            <div className="flex flex-wrap items-center gap-3">
              <div className="tabs">
                {[2, 1].map((n) => (
                  <button key={n} type="button" className={`tab ${vialsPerUnit === n ? "tab-active" : ""}`} onClick={() => setVialsPerUnit(n)}>
                    {n === 2 ? "2 ขวด = 1 คู่" : "1 ขวด = 1 ชิ้น"}
                  </button>
                ))}
              </div>
              {newPhotos.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <input type="checkbox" checked={usePhotos} onChange={(e) => setUsePhotos(e.target.checked)} />
                  ใช้ฝาจากรูปนี้เป็นรูปสีที่ยังไม่มีรูป ({newPhotos.length})
                </label>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary btn-sm" disabled={matched.length === 0 || Boolean(filled)} onClick={fill}>
                ใส่รายการลงตาราง
              </button>
              <button className="btn-ghost btn-sm" onClick={() => (setScanId(null), setFilled(null))}>
                ใช้รูปอื่น
              </button>
            </div>
            {filled && <p className="text-xs text-primary-700">✓ {filled}</p>}
          </div>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

/** No API key: copy the prompt, read the photo in the Claude app, paste the JSON reply back. */
function ManualRead({ scan, onDone, onCancel }: { scan: Scan; onDone: (scan: Scan) => void; onCancel: () => void }) {
  const [copied, setCopied] = useState(false);
  // Shown for manual copying when the clipboard API is unavailable (e.g. the backoffice opened over plain http on a LAN IP).
  const [promptText, setPromptText] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyPrompt() {
    setError(null);
    try {
      const { prompt } = await apiFetch<{ prompt: string }>("/stock/photo-scans/prompt");
      try {
        await navigator.clipboard.writeText(prompt);
        setCopied(true);
      } catch {
        setPromptText(prompt);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ item: Scan }>(`/stock/photo-scans/${scan._id}/result`, { method: "POST", body: { text: reply } });
      onDone(res.item);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <a href={assetUrl(scan.imageUrl)} target="_blank" rel="noreferrer" className="shrink-0">
        <img src={assetUrl(scan.imageUrl)} alt="รูปถาด" className="h-32 w-32 rounded-lg object-cover" />
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-zinc-700">
          <li>
            <button type="button" className="link" onClick={copyPrompt}>
              คัดลอกคำสั่ง
            </button>
            {copied && <span className="text-xs text-primary-700"> ✓ คัดลอกแล้ว</span>}
          </li>
          <li>
            เปิด{" "}
            <a href="https://claude.ai/new" target="_blank" rel="noreferrer" className="link">
              Claude
            </a>{" "}
            (เว็บหรือแอป) แนบรูปถาดรูปเดียวกันนี้ แล้ววางคำสั่งส่งไป
          </li>
          <li>คัดลอกคำตอบ (JSON) ทั้งก้อนมาวางด้านล่าง</li>
        </ol>
        {promptText && (
          <textarea
            className="input h-24 font-mono text-xs"
            readOnly
            value={promptText}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="คำสั่งสำหรับ Claude (คัดลอกเอง)"
          />
        )}
        <textarea
          className="input h-28 font-mono text-xs"
          placeholder='{"rows": [...], "samples": [...], "unreadable": 0}'
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary btn-sm" disabled={busy || !reply.trim()} onClick={submit}>
            {busy ? "กำลังตรวจ..." : "ใช้ผลนี้"}
          </button>
          <button className="btn-ghost btn-sm" onClick={onCancel}>
            ใช้รูปอื่น
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

/** Square crop around the AI's sample box, padded so the whole cap rim shows. */
async function cropSample(src: string, box: Box, size = 600): Promise<Blob | null> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
  const cx = (box.x + box.w / 2) * img.naturalWidth;
  const cy = (box.y + box.h / 2) * img.naturalHeight;
  const side = Math.max(box.w * img.naturalWidth, box.h * img.naturalHeight) * 1.25;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}
