"use client";

import { useEffect, useMemo, useRef } from "react";
import { Icon } from "@/components/icons";

/**
 * "Take photo" opens the camera on a phone; "Choose photo" opens the gallery or a file on a computer. Shows what was picked.
 * `selfie` uses the front camera, everything else the back camera.
 */
export function PhotoPicker({
  label,
  hint,
  file,
  onFile,
  selfie = false,
  allowPdf = false,
  optional = false,
}: {
  label: string;
  hint?: string;
  file: File | null;
  onFile: (f: File | null) => void;
  selfie?: boolean;
  allowPdf?: boolean;
  optional?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  // A preview of the picked image, released when it changes or the picker goes away.
  const preview = useMemo(() => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFile(e.target.files?.[0] ?? null);
    e.target.value = ""; // so the same file can be picked again
  };
  const accept = allowPdf ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold">{label}{optional && <span className="ml-1 font-semibold text-muted">(optional)</span>}</p>
      {file && (
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-2.5 pr-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white"><Icon name="clipboard" size={22} /></span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold">{file.name}</span>
            <span className="text-xs text-muted">{(file.size / 1024).toFixed(0)} KB</span>
          </span>
          <button type="button" onClick={() => onFile(null)} className="rounded-full bg-white px-3 py-1.5 text-xs font-extrabold shadow-soft hover:bg-surface-2">Remove</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => camera.current?.click()} className="flex h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-line-strong bg-white text-sm font-extrabold hover:border-ink">Take photo</button>
        <button type="button" onClick={() => gallery.current?.click()} className="flex h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-line-strong bg-white text-sm font-extrabold hover:border-ink">Choose {allowPdf ? "file" : "photo"}</button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture={selfie ? "user" : "environment"} onChange={pick} className="sr-only" aria-label={`${label}: take a photo`} />
      <input ref={gallery} type="file" accept={accept} onChange={pick} className="sr-only" aria-label={`${label}: choose a file`} />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
