"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PHOTO_TYPES } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Avatar, Badge, Button, Card, Input, Notice, PageHeader, Select } from "@/components/ui";
import { ThemePicker } from "@/components/theme-toggle";

type Msg = { tone: "ok" | "error"; text: string } | undefined;
interface Profile {
  name: string;
  email: string;
  phone: string | null;
  gender: string;
  photoUrl: string | null;
  department: string | null;
  roles: string[];
  reliabilityScore: number;
  rating: { average: number | null; count: number; recentComments: { stars: number; comment: string }[] };
  ridesCompleted: { asDriver: number; asRider: number };
  driver: { status: string } | null;
}
interface EmailState {
  email: string;
  verified: boolean;
  verifiedAt: string | null;
}

export default function AccountPage() {
  const { me, org, reload } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("UNDISCLOSED");
  const [pMsg, setPMsg] = useState<Msg>();
  const [pFields, setPFields] = useState<Record<string, string>>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState(false);

  const [emailState, setEmailState] = useState<EmailState | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [eMsg, setEMsg] = useState<Msg>();
  const [eBusy, setEBusy] = useState(false);

  const fetchProfile = useCallback(() => api<Profile>("GET", "/me/profile"), []);
  const apply = useCallback((p: Profile) => {
    setProfile(p);
    setName(p.name);
    setPhone(p.phone ?? "");
    setGender(p.gender);
  }, []);
  const load = useCallback(() => fetchProfile().then(apply), [fetchProfile, apply]);
  useEffect(() => {
    if (org) fetchProfile().then(apply, () => undefined);
  }, [org, fetchProfile, apply]);
  useEffect(() => {
    api<EmailState>("GET", "/me/email").then(setEmailState, () => undefined);
  }, []);

  async function sendCode() {
    setEBusy(true);
    setEMsg(undefined);
    try {
      await api("POST", "/me/email/verify/send");
      setCodeSent(true);
      setCode("");
      setEMsg({ tone: "ok", text: `We emailed a 6-digit code to ${emailState?.email}. It expires in a few minutes.` });
    } catch (err) {
      setEMsg({ tone: "error", text: err instanceof RequestError ? err.message : "The code could not be sent. Try again." });
    } finally {
      setEBusy(false);
    }
  }

  async function verifyEmail(e: React.FormEvent) {
    e.preventDefault();
    setEBusy(true);
    setEMsg(undefined);
    try {
      setEmailState(await api<EmailState>("POST", "/me/email/verify", { code }));
      setCodeSent(false);
      setCode("");
      await reload();
    } catch (err) {
      setEMsg({ tone: "error", text: err instanceof RequestError ? err.message : "That code did not work. Try again." });
    } finally {
      setEBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setPFields({});
    setPMsg(undefined);
    try {
      await api("PATCH", "/me", { name, gender, phone: phone.trim() ? phone : null });
      await Promise.all([load(), reload()]);
      setPMsg({ tone: "ok", text: "Profile saved." });
    } catch (err) {
      if (err instanceof RequestError) {
        setPFields(err.fields ?? {});
        setPMsg({ tone: "error", text: err.message });
      }
    }
  }

  async function upload(f: File) {
    setPMsg(undefined);
    if (!(PHOTO_TYPES as readonly string[]).includes(f.type)) return setPMsg({ tone: "error", text: "Choose a JPG, PNG or WebP photo." });
    if (f.size > 5 * 1024 * 1024) return setPMsg({ tone: "error", text: "The photo must be under 5 MB." });
    setPhotoBusy(true);
    try {
      const slot = await api<{ key: string; uploadUrl: string; headers: Record<string, string> }>("POST", "/me/photo/upload-url", { contentType: f.type });
      const put = await fetch(slot.uploadUrl, { method: "PUT", headers: slot.headers, body: f });
      if (!put.ok) throw new Error("upload");
      await api("PUT", "/me/photo", { key: slot.key });
      await load();
    } catch (err) {
      setPMsg({ tone: "error", text: err instanceof RequestError ? err.message : "The photo could not be uploaded. Try again." });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    setMsg(undefined);
    try {
      await api("POST", "/me/password", { currentPassword: current || undefined, newPassword: next });
      setCurrent("");
      setNext("");
      setMsg({ tone: "ok", text: "Password updated." });
    } catch (err) {
      if (err instanceof RequestError) {
        setFields(err.fields ?? {});
        setMsg({ tone: "error", text: err.message });
      }
    } finally {
      setBusy(false);
    }
  }

  const trips = profile ? profile.ridesCompleted.asRider + profile.ridesCompleted.asDriver : 0;

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="My account" sub="Your profile, email and how RYDO looks for you" />

      {profile && (
        <div className="overflow-hidden rounded-3xl bg-ink text-white shadow-lift">
          <div className="h-20 bg-gradient-to-r from-lime/90 via-lime/50 to-transparent" />
          <div className="-mt-10 flex flex-col gap-5 px-5 pb-5 sm:px-7 sm:pb-7">
            <div className="flex flex-wrap items-end gap-4">
              <div className="rounded-full border-4 border-ink bg-ink">
                {profile.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.photoUrl} alt="Your profile photo" className="h-20 w-20 rounded-full object-cover" />
                ) : (
                  <Avatar name={profile.name} size={80} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-2xl font-extrabold">{profile.name}</h2>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-[#B8C2D6]">
                  <span className="truncate">{profile.email}</span>
                  {emailState && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${emailState.verified ? "bg-lime text-ink" : "bg-[#3b2a0c] text-[#fcd34d]"}`}>{emailState.verified ? "✓ Verified" : "Not verified"}</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose a profile photo" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <button type="button" disabled={photoBusy} onClick={() => file.current?.click()} className="h-9 rounded-full bg-white/10 px-4 text-sm font-extrabold hover:bg-white/20 disabled:opacity-60">{photoBusy ? "Uploading…" : profile.photoUrl ? "Change photo" : "Add photo"}</button>
                {profile.photoUrl && <button type="button" onClick={async () => { await api("DELETE", "/me/photo"); load(); }} className="h-9 rounded-full px-3 text-sm font-bold text-[#B8C2D6] hover:text-white">Remove</button>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {org && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold">{org.organization.name}</span>}
              {profile.department && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold">{profile.department}</span>}
              {profile.roles.map((r) => <span key={r} className="rounded-full bg-lime px-3 py-1 text-xs font-extrabold capitalize text-ink">{r.replace("_", " ").toLowerCase()}</span>)}
              {profile.driver && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-extrabold">driver {profile.driver.status.toLowerCase()}</span>}
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-extrabold">{profile.rating.average ? `${profile.rating.average} ★` : "–"}</p><p className="text-xs text-[#B8C2D6]">{profile.rating.count} {profile.rating.count === 1 ? "rating" : "ratings"}</p></div>
              <div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-extrabold">{profile.reliabilityScore}</p><p className="text-xs text-[#B8C2D6]">reliability</p></div>
              <div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-extrabold">{trips}</p><p className="text-xs text-[#B8C2D6]">rides done</p></div>
            </div>
            {profile.rating.recentComments.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-bold">What people said</p>
                {profile.rating.recentComments.map((c, i) => <p key={i} className="rounded-xl bg-white/10 px-3 py-2 text-sm"><span className="text-lime">{"★".repeat(c.stars)}</span> {c.comment}</p>)}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="flex flex-col gap-4 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold">Email</h2>
              <p className="text-sm text-muted">{emailState?.email ?? me?.user.email}</p>
            </div>
            {emailState && <Badge tone={emailState.verified ? "success" : "warning"}>{emailState.verified ? "Verified" : "Not verified"}</Badge>}
          </div>
          {emailState?.verified ? (
            <Notice tone="ok">Your email is verified{emailState.verifiedAt ? ` (${new Date(emailState.verifiedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })})` : ""}. Your company can trust it is really yours.</Notice>
          ) : emailState ? (
            <>
              <p className="text-sm text-muted">Verify your email so your company knows this account is really yours. We email you a 6-digit code.</p>
              {codeSent ? (
                <form onSubmit={verifyEmail} className="flex flex-wrap items-end gap-3">
                  <div className="w-44">
                    <Input id="email-code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" />
                  </div>
                  <Button type="submit" loading={eBusy} disabled={code.length !== 6}>Verify email</Button>
                  <Button type="button" variant="ghost" disabled={eBusy} onClick={sendCode}>Send a new code</Button>
                </form>
              ) : (
                <Button className="self-start" loading={eBusy} onClick={sendCode}>Send verification code</Button>
              )}
            </>
          ) : null}
          {eMsg && <Notice tone={eMsg.tone}>{eMsg.text}</Notice>}
        </Card>

        {profile && (
          <Card className="md:col-span-2">
            <form onSubmit={saveProfile} className="flex flex-col gap-4">
              <h2 className="text-lg font-extrabold">Profile</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input id="p-name" label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={pFields.name} />
                <Input id="p-phone" label="Phone (private, never shown to others)" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" error={pFields.phone} />
              </div>
              <Select id="p-gender" label="Gender (only used for women-only rides)" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="UNDISCLOSED">Prefer not to say</option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </Select>
              {pMsg && <Notice tone={pMsg.tone}>{pMsg.text}</Notice>}
              <Button type="submit" className="self-start">Save profile</Button>
            </form>
          </Card>
        )}

        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-extrabold">Appearance</h2>
          <p className="-mt-2 text-sm text-muted">Choose how RYDO looks on this device.</p>
          <ThemePicker />
        </Card>

        <Card>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <h2 className="text-lg font-extrabold">Change password</h2>
            <Input id="current" label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={fields.currentPassword} />
            <Input id="next" label="New password" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} error={fields.newPassword} />
            <p className="-mt-2 text-xs text-muted">At least 8 characters with a letter and a number.</p>
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <Button type="submit" disabled={busy} className="self-start">Save password</Button>
          </form>
        </Card>
      </div>
    </section>
  );
}
