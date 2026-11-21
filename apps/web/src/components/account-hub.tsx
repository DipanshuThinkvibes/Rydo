"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PHOTO_TYPES, type OrgRoleName } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Avatar } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

export type Msg = { tone: "ok" | "error"; text: string } | undefined;

export interface Profile {
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
  driver: { status: string; preferences?: Record<string, boolean> } | null;
  emergencyContacts: number;
}
export interface Highlight {
  key: string;
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
}
const TILE_ICON: Record<string, IconName> = {
  clients: "globe", licences: "badge", reports: "flag", blocked: "ban", employees: "users", waiting: "clock", offices: "building", trips: "ticket",
  drivers: "badge", paused: "ban", today: "route", issues: "flag", sos: "alert", noshows: "clock", rides: "car", riders: "users", rating: "star", reliability: "shield", co2: "sparkle",
};

export interface EmailState {
  email: string;
  verified: boolean;
  verifiedAt: string | null;
}

/** The people RYDO knows: each has its own colour, name and tools. Order is who "wins" the headline. */
export type PersonaKey = "OWNER" | "SUPPORT" | OrgRoleName;
export const PERSONA: Record<PersonaKey, { label: string; icon: IconName; band: string; chip: string; blurb: string; accent: string }> = {
  OWNER: { label: "RYDO owner", icon: "shield", band: "from-lime/60 via-lime/20 to-transparent", chip: "bg-ink text-lime", blurb: "You run RYDO for every client company.", accent: "bg-ink text-lime" },
  SUPPORT: { label: "RYDO support", icon: "chat", band: "from-sky/40 via-lime/20 to-transparent", chip: "bg-ink text-lime", blurb: "You help client companies. Access to a company is read-only and always logged.", accent: "bg-ink text-lime" },
  ORG_ADMIN: { label: "Org admin", icon: "building", band: "from-sky/35 via-sky/10 to-transparent", chip: "bg-[#dbeafe] text-sky", blurb: "You set up and run your company on RYDO.", accent: "bg-[#dbeafe] text-sky" },
  HR_ADMIN: { label: "HR admin", icon: "users", band: "from-orange/30 via-orange/10 to-transparent", chip: "bg-[#ffedd5] text-orange", blurb: "You approve people and keep your team in order.", accent: "bg-[#ffedd5] text-orange" },
  OPS_ADMIN: { label: "Ops admin", icon: "route", band: "from-sky/30 via-lime/15 to-transparent", chip: "bg-[#dbeafe] text-sky", blurb: "You keep daily rides and safety running smoothly.", accent: "bg-[#dbeafe] text-sky" },
  DRIVER: { label: "Driver", icon: "wheel", band: "from-lime/55 via-lime/20 to-transparent", chip: "bg-lime text-ink", blurb: "You share your seats with colleagues.", accent: "bg-lime text-ink" },
  RIDER: { label: "Rider", icon: "car", band: "from-sky/30 via-lime/15 to-transparent", chip: "bg-surface-2 text-ink", blurb: "You ride to work with colleagues.", accent: "bg-surface-2 text-ink" },
};
const ORDER: PersonaKey[] = ["OWNER", "SUPPORT", "ORG_ADMIN", "HR_ADMIN", "OPS_ADMIN", "DRIVER", "RIDER"];

/** Which personas this person holds right now, most senior first. */
export function usePersonas(): PersonaKey[] {
  const { me, org } = useSession();
  const held = new Set<PersonaKey>(org?.roles ?? []);
  // An admin account does not ride or drive, so it has no rider or driver persona (an old mixed account shows as an admin).
  if (org && [...held].some((r) => r === "ORG_ADMIN" || r === "HR_ADMIN" || r === "OPS_ADMIN")) {
    held.delete("RIDER");
    held.delete("DRIVER");
  }
  if (me?.user.isPlatformAdmin) held.add("OWNER");
  else if (me?.user.platformRole === "SUPPORT") held.add("SUPPORT");
  return ORDER.filter((p) => held.has(p));
}

interface Ctx {
  profile: Profile | null;
  emailState: EmailState | null;
  setEmailState: (e: EmailState) => void;
  reloadProfile: () => Promise<void>;
  upload: (f: File) => Promise<void>;
  removePhoto: () => Promise<void>;
  photoBusy: boolean;
  photoMsg: Msg;
}
const AccountCtx = createContext<Ctx | null>(null);
export const useAccount = () => {
  const c = useContext(AccountCtx);
  if (!c) throw new Error("useAccount needs AccountFrame");
  return c;
};

/** A titled white card with an icon chip: the one block every account screen is built from. */
export function Section({ icon, title, sub, children, aside, id }: { icon: IconName; title: string; sub?: string; children: React.ReactNode; aside?: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-[26px] bg-white p-5 shadow-soft sm:p-6">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-2"><Icon name={icon} size={19} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold leading-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
        </div>
        {aside}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Identity header and tabs shared by Profile, Preferences, Security, Safety and Role. Tabs depend on who you are. */
export function AccountFrame({ children }: { children: React.ReactNode }) {
  const { me, org, reload } = useSession();
  const path = usePathname();
  const personas = usePersonas();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [emailState, setEmailState] = useState<EmailState | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [tiles, setTiles] = useState<Highlight[] | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState<Msg>();
  const file = useRef<HTMLInputElement>(null);

  const loadPhoto = useCallback(() => api<{ photoUrl: string | null }>("GET", "/me/photo").then((r) => setPhotoUrl(r.photoUrl), () => undefined), []);
  const reloadProfile = useCallback(async () => {
    await Promise.all([api<Profile>("GET", "/me/profile").then(setProfile, () => undefined), loadPhoto()]);
  }, [loadPhoto]);
  useEffect(() => {
    if (org) api<Profile>("GET", "/me/profile").then(setProfile, () => undefined);
  }, [org]);
  useEffect(() => {
    if (!org && !me?.user.isPlatformAdmin) return; // support staff have no company numbers
    api<{ tiles: Highlight[] }>("GET", "/me/highlights").then((r) => setTiles(r.tiles), () => setTiles([]));
  }, [org, me]);
  useEffect(() => {
    api<EmailState>("GET", "/me/email").then(setEmailState, () => undefined);
    api<{ photoUrl: string | null }>("GET", "/me/photo").then((r) => setPhotoUrl(r.photoUrl), () => undefined);
  }, []);

  const upload = useCallback(
    async (f: File) => {
      setPhotoMsg(undefined);
      if (!(PHOTO_TYPES as readonly string[]).includes(f.type)) return setPhotoMsg({ tone: "error", text: "Choose a JPG, PNG or WebP photo." });
      if (f.size > 5 * 1024 * 1024) return setPhotoMsg({ tone: "error", text: "The photo must be under 5 MB." });
      setPhotoBusy(true);
      try {
        // Sent through the RYDO API, so it does not depend on the browser being allowed to reach the file store.
        const form = new FormData();
        form.append("file", f);
        await api("POST", "/me/photo/file", form);
        await reloadProfile();
        await reload();
      } catch (err) {
        setPhotoMsg({ tone: "error", text: err instanceof RequestError ? err.message : "The photo could not be uploaded. Try again." });
      } finally {
        setPhotoBusy(false);
      }
    },
    [reloadProfile, reload],
  );
  const removePhoto = useCallback(async () => {
    await api("DELETE", "/me/photo");
    await reloadProfile();
  }, [reloadProfile]);

  const ctx = useMemo<Ctx>(() => ({ profile, emailState, setEmailState, reloadProfile, upload, removePhoto, photoBusy, photoMsg }), [profile, emailState, reloadProfile, upload, removePhoto, photoBusy, photoMsg]);

  const main = personas[0];
  const persona = main ? PERSONA[main] : null;
  const name = profile?.name ?? me?.user.name ?? me?.user.email ?? "";

  const roleTab = personas.some((p) => p === "ORG_ADMIN" || p === "HR_ADMIN" || p === "OPS_ADMIN") ? "Admin tools" : main === "OWNER" ? "RYDO owner" : main === "DRIVER" ? "Driving" : "My rides";
  const tabs: { href: string; label: string; icon: IconName; show: boolean }[] = [
    { href: "/account", label: "Profile", icon: "user", show: true },
    { href: "/settings", label: "Preferences", icon: "settings", show: true },
    { href: "/settings/security", label: "Security", icon: "shield", show: true },
    { href: "/settings/safety", label: "Safety & privacy", icon: "alert", show: !!org && !personas.some((p) => p === "ORG_ADMIN" || p === "HR_ADMIN" || p === "OPS_ADMIN") },
    { href: "/settings/role", label: roleTab, icon: persona?.icon ?? "car", show: personas.length > 0 },
  ];
  const active = (href: string) => (href === "/settings" ? path === "/settings" : path === href);

  return (
    <AccountCtx.Provider value={ctx}>
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <header className="overflow-hidden rounded-[30px] bg-white shadow-soft">
          <div aria-hidden="true" className={`relative h-28 overflow-hidden bg-gradient-to-r sm:h-32 ${persona?.band ?? "from-lime/40 via-sky/10 to-transparent"}`}>
            <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(11,20,38,.16)_1.4px,transparent_1.4px)] [background-size:16px_16px]" />
            {persona && <Icon name={persona.icon} size={150} className="absolute -right-4 -top-6 text-ink opacity-10" />}
          </div>
          <div className="flex flex-col gap-4 px-5 pb-5 sm:px-8 sm:pb-6">
            <div className="-mt-12 flex flex-wrap items-end gap-4 sm:-mt-14">
              <div className="relative rounded-full bg-white p-1.5 shadow-lift">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="Your profile photo" className="h-24 w-24 rounded-full object-cover sm:h-28 sm:w-28" />
                ) : (
                  <Avatar name={name || "R"} size={96} />
                )}
                {(
                  <>
                    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose a profile photo" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                    <button type="button" onClick={() => file.current?.click()} disabled={photoBusy} aria-label={photoUrl ? "Change photo" : "Add photo"} className="absolute -bottom-0.5 -right-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-ink text-lime shadow-lift transition-transform hover:scale-105 disabled:opacity-60">
                      <Icon name={photoBusy ? "clock" : "plus"} size={16} />
                    </button>
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{name}</h1>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <span className="truncate">{me?.user.email}</span>
                  {emailState && (emailState.verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-xs font-extrabold text-success"><Icon name="check" size={11} /> Verified</span>
                  ) : (
                    <Link href="/account#email" className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-extrabold text-warning hover:underline">Not verified · verify now <Icon name="arrowRight" size={11} /></Link>
                  ))}
                </p>
              </div>

            </div>

            <div className="flex flex-wrap items-center gap-2">
              {personas.map((p) => (
                <span key={p} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${PERSONA[p].chip}`}><Icon name={PERSONA[p].icon} size={13} /> {PERSONA[p].label}</span>
              ))}
              {org && <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-extrabold"><Icon name="building" size={13} /> {org.organization.name}</span>}
              {profile?.department && <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-extrabold">{profile.department}</span>}
            </div>
            {persona && <p className="text-sm text-muted">{persona.blurb}</p>}
            {tiles === null && (org || me?.user.isPlatformAdmin) && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[74px] animate-pulse rounded-2xl bg-surface" />)}</div>}
            {tiles && tiles.length > 0 && (
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {tiles.map((t) => {
                  const inner = (
                    <>
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${persona?.accent ?? "bg-surface-2"}`}><Icon name={TILE_ICON[t.key] ?? "sparkle"} size={17} /></span>
                      <span className="min-w-0">
                        <dd className="text-xl font-extrabold leading-tight tabular-nums">{t.value}</dd>
                        <dt className="truncate text-[11px] font-bold text-muted">{t.label}</dt>
                      </span>
                    </>
                  );
                  const cls = "flex items-center gap-3 rounded-2xl bg-surface p-3";
                  return t.href ? <Link key={t.key} href={t.href} className={`${cls} transition-colors hover:bg-surface-2`}>{inner}</Link> : <div key={t.key} className={cls}>{inner}</div>;
                })}
              </dl>
            )}
            {photoMsg && <p role="alert" className={`text-sm font-bold ${photoMsg.tone === "error" ? "text-danger" : "text-success"}`}>{photoMsg.text}</p>}
          </div>

          <nav aria-label="Account sections" className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line px-3 sm:px-6">
            {tabs.filter((t) => t.show).map((t) => (
              <Link key={t.href} href={t.href} aria-current={active(t.href) ? "page" : undefined} className={`relative inline-flex shrink-0 items-center gap-2 px-3.5 py-3.5 text-sm font-extrabold transition-colors ${active(t.href) ? "text-ink" : "text-muted hover:text-ink"}`}>
                <Icon name={t.icon} size={16} /> {t.label}
                {active(t.href) && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-lime" />}
              </Link>
            ))}
          </nav>
        </header>

        {children}
      </div>
    </AccountCtx.Provider>
  );
}
