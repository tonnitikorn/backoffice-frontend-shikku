"use client";

/* eslint-disable @next/next/no-img-element -- photos are served by the API origin */
import { useRef, useState } from "react";
import { apiFetch, apiUpload, assetUrl } from "@/lib/apiClient";
import { errorMessage } from "@/components/ui";

interface VariantWithImages {
  _id: string;
  colorName?: string;
  images?: string[];
}

/** Model photo(s) shown on POS tiles, plus one photo per color (e.g. the vial cap) shown in the color picker. */
export function ProductImages({
  productId,
  images,
  variants,
  canEdit,
  onChanged,
}: {
  productId: string;
  images: string[];
  variants: VariantWithImages[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!canEdit && images.length === 0 && variants.every((v) => !v.images?.length)) return null;

  return (
    <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <p className="mb-1.5 text-xs text-zinc-400">รูปรุ่น (แสดงบนหน้า POS)</p>
          <div className="flex flex-wrap gap-2">
            {images.map((url) => (
              <Thumb
                key={url}
                url={url}
                onRemove={canEdit ? () => run(url, () => apiFetch(`/products/${productId}/images`, { method: "DELETE", body: { url } })) : undefined}
                busy={busy === url}
              />
            ))}
            {canEdit && <UploadTile label="+ รูปรุ่น" busy={busy === "product"} onFile={(f) => run("product", () => apiUpload(`/products/${productId}/images`, f))} />}
          </div>
        </div>
        {variants.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-zinc-400">รูปแต่ละสี (เช่น ฝาขวด)</p>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => {
                const url = v.images?.[0];
                return (
                  <div key={v._id} className="flex flex-col items-center gap-1">
                    {url ? (
                      <Thumb
                        url={url}
                        busy={busy === v._id}
                        onRemove={canEdit ? () => run(v._id, () => apiFetch(`/products/variants/${v._id}/images`, { method: "DELETE", body: { url } })) : undefined}
                        onReplace={canEdit ? (f) => run(v._id, () => apiUpload(`/products/variants/${v._id}/images`, f)) : undefined}
                      />
                    ) : canEdit ? (
                      <UploadTile label="+ รูป" busy={busy === v._id} onFile={(f) => run(v._id, () => apiUpload(`/products/variants/${v._id}/images`, f))} />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-zinc-50" />
                    )}
                    <span className="max-w-16 truncate text-[11px] text-zinc-500">{v.colorName || "-"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function Thumb({ url, busy, onRemove, onReplace }: { url: string; busy: boolean; onRemove?: () => void; onReplace?: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={`group relative h-16 w-16 overflow-hidden rounded-lg border border-zinc-200 ${busy ? "opacity-50" : ""}`}>
      <a href={assetUrl(url)} target="_blank" rel="noreferrer">
        <img src={assetUrl(url)} alt="" className="h-full w-full object-cover" />
      </a>
      {(onRemove || onReplace) && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-zinc-900/60 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
          {onReplace && (
            <>
              <button type="button" onClick={() => input.current?.click()}>
                เปลี่ยน
              </button>
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && onReplace(e.target.files[0])} />
            </>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove}>
              ลบ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UploadTile({ label, busy, onFile }: { label: string; busy: boolean; onFile: (f: File) => void }) {
  return (
    <label className={`flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 text-center text-[11px] text-zinc-500 hover:border-primary-400 hover:text-primary-700 ${busy ? "opacity-50" : ""}`}>
      {busy ? "กำลังอัปโหลด..." : label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </label>
  );
}
