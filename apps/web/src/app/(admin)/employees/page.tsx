"use client";

import { useCallback, useEffect, useState } from "react";
import { ORG_ROLES, type OrgRoleName } from "@rydo/shared";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Button, Notice, PageHeader } from "@/components/ui";

interface Member {
  id: string;
  name: string;
  email: string;
  department: string | null;
  departmentId: string | null;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED" | "LEFT";
  roles: OrgRoleName[];
}
interface Department {
  id: string;
  name: string;
}

const filters = [
  { key: "PENDING", label: "Waiting for approval" },
  { key: "ACTIVE", label: "Active" },
  { key: "SUSPENDED", label: "Suspended" },
  { key: "", label: "Everyone" },
] as const;

const roleLabel: Record<OrgRoleName, string> = { ORG_ADMIN: "Org Admin", HR_ADMIN: "HR Admin", OPS_ADMIN: "Ops Admin", RIDER: "Rider", DRIVER: "Driver" };

export default function EmployeesPage() {
  const { org, me, can } = useSession();
  const [filter, setFilter] = useState<(typeof filters)[number]["key"]>("PENDING");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Member[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [open, setOpen] = useState<string>();
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  const fetchRows = useCallback(() => {
    const qs = new URLSearchParams();
    if (filter) qs.set("status", filter);
    if (search) qs.set("q", search);
    return api<Member[]>("GET", `/admin/members?${qs}`);
  }, [filter, search]);
  const show = useCallback((data: Member[]) => {
    setRows(data);
    setError(undefined);
  }, []);
  const failed = useCallback((e: unknown) => setError(e instanceof RequestError ? e.message : "Could not load employees."), []);
  const load = useCallback(() => fetchRows().then(show, failed), [fetchRows, show, failed]);

  useEffect(() => {
    if (org) fetchRows().then(show, failed);
  }, [org, fetchRows, show, failed]);
  useEffect(() => {
    if (org) api<Department[]>("GET", "/admin/departments").then(setDepartments).catch(() => setDepartments([]));
  }, [org]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(undefined);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof RequestError ? e.message : "That didn't work. Try again.");
    } finally {
      setBusyId(undefined);
    }
  }

  if (!org) return <p className="text-muted">Choose a company to see its employees.</p>;
  const myMembershipId = me?.memberships.find((m) => m.organization.id === org.organization.id)?.id;

  return (
    <section className="flex max-w-4xl flex-col gap-5">
      <PageHeader title="Employees" sub="New sign-ups wait here until HR approves them. Approved people can book and offer rides." />
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter" className="flex w-fit flex-wrap gap-1 rounded-2xl bg-surface-2 p-1">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`min-h-10 rounded-xl px-4 text-sm font-extrabold ${filter === f.key ? "bg-white shadow-sm" : "text-muted"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <form
          role="search"
          className="flex flex-[1_1_220px] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query.trim());
          }}
        >
          <label htmlFor="q" className="sr-only">Search by name or email</label>
          <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" className="h-11 min-w-0 flex-1 rounded-2xl border-[1.5px] border-line-strong bg-white px-4 text-sm font-semibold outline-none focus:border-ink" />
          <Button type="submit" variant="ghost">Search</Button>
        </form>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {rows === null ? (
        <p className="text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-[18px] border-[1.5px] border-dashed border-line-strong p-8 text-center text-muted">
          {filter === "PENDING" && !search ? "No one is waiting. New sign-ups will appear here." : "No employees match."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((m) => {
            const busy = busyId === m.id;
            const isOpen = open === m.id;
            return (
              <li key={m.id} className="rounded-[18px] border border-line bg-white">
                <div className="flex flex-wrap items-center gap-4 p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E0EAFF] font-extrabold text-[#1E3A8A]">
                    {m.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-extrabold">{m.name}</span>
                    <span className="truncate text-sm text-muted">
                      {m.email}
                      {m.department ? ` · ${m.department}` : ""} · {m.roles.map((r) => roleLabel[r]).join(", ")}
                    </span>
                  </span>
                  {m.status === "PENDING" ? (
                    <span className="flex gap-2">
                      <Button variant="ghost" disabled={busy} onClick={() => act(m.id, () => api("POST", `/admin/members/${m.id}/reject`))}>Reject</Button>
                      <Button disabled={busy} onClick={() => act(m.id, () => api("POST", `/admin/members/${m.id}/approve`))}>Approve</Button>
                    </span>
                  ) : (
                    <>
                      <Badge tone={m.status === "ACTIVE" ? "success" : m.status === "SUSPENDED" ? "warning" : "neutral"}>{m.status.toLowerCase()}</Badge>
                      <Button variant="ghost" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : m.id)}>
                        {isOpen ? "Close" : "Manage"}
                      </Button>
                    </>
                  )}
                </div>
                {isOpen && (
                  <MemberPanel
                    member={m}
                    departments={departments}
                    canEditRoles={can("ORG_ADMIN")}
                    isMe={m.id === myMembershipId}
                    busy={busy}
                    act={(fn) => act(m.id, fn)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MemberPanel({ member, departments, canEditRoles, isMe, busy, act }: { member: Member; departments: Department[]; canEditRoles: boolean; isMe: boolean; busy: boolean; act: (fn: () => Promise<unknown>) => void }) {
  const [roles, setRoles] = useState<OrgRoleName[]>(member.roles);
  const toggle = (r: OrgRoleName) => setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));
  const changed = roles.length !== member.roles.length || roles.some((r) => !member.roles.includes(r));

  return (
    <div className="flex flex-col gap-5 border-t border-line p-4 sm:flex-row sm:flex-wrap">
      <div className="flex flex-[1_1_220px] flex-col gap-1.5">
        <label htmlFor={`dept-${member.id}`} className="text-sm font-bold">Department</label>
        <select
          id={`dept-${member.id}`}
          disabled={busy}
          value={member.departmentId ?? ""}
          onChange={(e) => act(() => api("PATCH", `/admin/members/${member.id}`, { departmentId: e.target.value || null }))}
          className="h-11 rounded-2xl border-[1.5px] border-line-strong px-3 text-sm font-semibold"
        >
          <option value="">No department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      {canEditRoles && (
        <fieldset className="flex flex-[2_1_320px] flex-col gap-2">
          <legend className="mb-1.5 text-sm font-bold">Roles</legend>
          <div className="flex flex-wrap gap-2">
            {ORG_ROLES.map((r) => (
              <label key={r} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3 text-sm font-bold ${roles.includes(r) ? "border-ink bg-ink text-white" : "border-line-strong"}`}>
                <input type="checkbox" className="sr-only" checked={roles.includes(r)} onChange={() => toggle(r)} />
                {roleLabel[r]}
              </label>
            ))}
          </div>
          {changed && (
            <Button className="self-start" disabled={busy || roles.length === 0} onClick={() => act(() => api("PATCH", `/admin/members/${member.id}/roles`, { roles }))}>
              Save roles
            </Button>
          )}
        </fieldset>
      )}
      {!isMe && (member.status === "ACTIVE" || member.status === "SUSPENDED") && (
        <div className="flex basis-full items-center justify-between gap-3 rounded-2xl bg-surface p-3">
          <span className="text-sm text-muted">
            {member.status === "ACTIVE" ? "Suspending removes access to RYDO at once. Ride history is kept." : "Reactivating restores their access."}
          </span>
          {member.status === "ACTIVE" ? (
            <Button variant="danger" disabled={busy} onClick={() => act(() => api("POST", `/admin/members/${member.id}/suspend`))}>Suspend</Button>
          ) : (
            <Button disabled={busy} onClick={() => act(() => api("POST", `/admin/members/${member.id}/reactivate`))}>Reactivate</Button>
          )}
        </div>
      )}
    </div>
  );
}