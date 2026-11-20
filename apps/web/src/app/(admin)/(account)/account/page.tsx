"use client";

import { useState } from "react";
import Link from "next/link";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Button, Input, Notice, Ring, Select } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { Section, useAccount, type Msg } from "@/components/account-hub";

/** Profile tab: who you are, how others see you, and what is left to complete. Fields adapt to your profile. */
export default function ProfilePage() {
  const { me, org, reload } = useSession();
  const { profile, emailState, setEmailState, reloadProfile, removePhoto } = useAccount();

  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [pMsg, setPMsg] = useState<Msg>();
  const [pFields, setPFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [eMsg, setEMsg] = useState<Msg>();
  const [eBusy, setEBusy] = useState(false);

  // The form starts from the saved profile and only keeps what the person has changed.
  const nameVal = name ?? profile?.name ?? me?.user.name ?? "";
  const phoneVal = phone ?? profile?.phone ?? "";
  const genderVal = gender ?? profile?.gender ?? "UNDISCLOSED";

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setPFields({});
    setPMsg(undefined);
    setSaving(true);
    try {
      await api("PATCH", "/me", { name: nameVal, ...(org ? { gender: genderVal, phone: phoneVal.trim() ? phoneVal : null } : {}) });
      await Promise.all([reloadProfile(), reload()]);
      setName(null);
      setPhone(null);
      setGender(null);
      setPMsg({ tone: "ok", text: "Profile saved." });
    } catch (err) {
      if (err instanceof RequestError) {
        setPFields(err.fields ?? {});
        setPMsg({ tone: "error", text: err.message });
      }
    } finally {
      setSaving(false);
    }
  }

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
      setEmailState(await api("POST", "/me/email/verify", { code }));
      setCodeSent(false);
      setCode("");
      await reload();
    } catch (err) {
      setEMsg({ tone: "error", text: err instanceof RequestError ? err.message : "That code did not work. Try again." });
    } finally {
      setEBusy(false);
    }
  }

  const steps: { done: boolean; label: string; hint: string; icon: IconName; href: string }[] = [
    { done: !!profile?.photoUrl, label: "Add a profile photo", hint: "Colleagues trust a face", icon: "user", href: "#photo" },
    { done: !!profile?.phone, label: "Add your phone number", hint: "Private, never shown to others", icon: "phone", href: "#profile" },
    { done: !!emailState?.verified, label: "Verify your email", hint: "Proves the account is yours", icon: "shield", href: "#email" },
    { done: (profile?.emergencyContacts ?? 0) > 0, label: "Add an emergency contact", hint: "Someone to tell if you share a trip", icon: "alert", href: "/settings/safety" },
  ];
  const left = steps.filter((s) => !s.done).length;
  const pct = Math.round(((steps.length - left + 1) / (steps.length + 1)) * 100);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="flex flex-col gap-5 lg:col-span-2">
        <Section id="profile" icon="user" title="Profile" sub={org ? "This is how colleagues see you. Your phone number stays private." : "Your name as RYDO staff and colleagues see it."}>
          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input id="p-name" label="Name" required value={nameVal} onChange={(e) => setName(e.target.value)} error={pFields.name} />
              {org && <Input id="p-phone" label="Phone (private)" value={phoneVal} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" error={pFields.phone} />}
            </div>
            {org && (
              <Select id="p-gender" label="Gender (only used for women-only rides)" value={genderVal} onChange={(e) => setGender(e.target.value)}>
                <option value="UNDISCLOSED">Prefer not to say</option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </Select>
            )}
            {pMsg && <Notice tone={pMsg.tone}>{pMsg.text}</Notice>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" loading={saving}>Save profile</Button>
              {profile?.photoUrl && <Button type="button" variant="ghost" onClick={removePhoto}>Remove photo</Button>}
            </div>
          </form>
        </Section>

        <Section id="email" icon="shield" title="Email" sub={emailState?.email ?? me?.user.email} aside={emailState && <Badge tone={emailState.verified ? "success" : "warning"}>{emailState.verified ? "Verified" : "Not verified"}</Badge>}>
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
        </Section>
      </div>

      <div className="flex flex-col gap-5">
        {org && profile && (
          <Section id="photo" icon="sparkle" title="Profile strength" aside={<Ring value={pct} size={48} stroke={5} tone="lime"><span className="text-[11px] font-extrabold">{pct}%</span></Ring>}>
            <p className="-mt-2 text-sm text-muted">{left === 0 ? "All done. Nice work." : `${left} ${left === 1 ? "step" : "steps"} to go.`}</p>
            <ul className="flex flex-col gap-2">
              {steps.map((s) => {
                const body = (
                  <>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-success-bg text-success" : "bg-white text-muted"}`}><Icon name={s.done ? "check" : s.icon} size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-extrabold ${s.done ? "text-muted line-through" : ""}`}>{s.label}</span>
                      {!s.done && <span className="text-xs text-muted">{s.hint}</span>}
                    </span>
                    {!s.done && <Icon name="arrowRight" size={14} className="text-muted" />}
                  </>
                );
                return <li key={s.label}>{s.done ? <div className="flex items-center gap-3 rounded-2xl bg-surface p-3">{body}</div> : <Link href={s.href} className="flex items-center gap-3 rounded-2xl bg-surface p-3 transition-colors hover:bg-surface-2">{body}</Link>}</li>;
              })}
            </ul>
          </Section>
        )}

        {profile && profile.rating.recentComments.length > 0 && (
          <Section icon="star" title="What people said">
            {profile.rating.recentComments.map((c, i) => (
              <p key={i} className="rounded-2xl bg-surface p-3 text-sm"><span className="text-[#B45309]">{"★".repeat(c.stars)}</span> {c.comment}</p>
            ))}
          </Section>
        )}

        {!org && (
          <Section icon="shield" title="Your access">
            <p className="text-sm text-muted">You are signed in as RYDO staff. Owner tools are under the <b className="text-ink">RYDO owner</b> tab, and your devices and password are under <b className="text-ink">Security</b>.</p>
          </Section>
        )}
      </div>
    </div>
  );
}
