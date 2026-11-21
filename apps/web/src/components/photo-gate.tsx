"use client";

import { useState } from "react";
import { PHOTO_TYPES } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { Avatar, Button, Notice } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PhotoPicker } from "@/components/photo-picker";

/** What makes a photo useful: the driver and the rider both use it to check who they are meeting. */
export const GOOD_PHOTO = [
  "Your face and the top of your shoulders, facing the camera",
  "Good light, not blurry, only you in the picture",
  "No sunglasses or hats (glasses and religious wear are fine)",
  "Not a photo of your ID card",
];

/**
 * Every account needs a profile photo before anything else: a driver checks the rider against it, and the rider checks the driver,
 * so everyone gets into the right car. Shown instead of the page until a photo is added.
 */
export function PhotoGate({ name, onDone, onSignOut }: { name: string; onDone: () => void; onSignOut: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    if (!file) return;
    setError(undefined);
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return setError("Choose a JPG, PNG or WebP photo.");
    if (file.size > 5 * 1024 * 1024) return setError("The photo must be under 5 MB.");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api("POST", "/me/photo/file", form);
      onDone();
    } catch (e) {
      setError(e instanceof RequestError ? e.message : "The photo could not be uploaded. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex flex-col items-center gap-3 rounded-[28px] bg-white p-7 text-center shadow-soft">
        <Avatar name={name || "R"} size={96} />
        <h1 className="text-2xl font-extrabold">Add your profile photo</h1>
        <p className="text-muted">Everyone on RYDO has a photo. Drivers check riders against it, and riders check drivers, so everyone gets into the right car. You cannot ride or drive without one.</p>
      </div>

      <div className="flex flex-col gap-4 rounded-[28px] bg-white p-6 shadow-soft">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[2px] text-muted">A good photo</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {GOOD_PHOTO.map((t) => (
              <li key={t} className="flex items-start gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-bg text-success"><Icon name="check" size={11} /></span>{t}</li>
            ))}
          </ul>
        </div>
        <PhotoPicker label="Your photo" file={file} onFile={setFile} selfie />
        {error && <Notice tone="error">{error}</Notice>}
        <Button loading={busy} disabled={!file} onClick={save} className="h-12">Save my photo</Button>
        <button type="button" onClick={onSignOut} className="self-center text-sm font-bold text-muted underline">Sign out</button>
      </div>
    </div>
  );
}
