"use client";

import { useCallback, useEffect, useState } from "react";
import { api, RequestError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge, Button } from "@/components/ui";

interface Member {
  id: string;
  name: string;
  email: string;
  department: string | null;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED" | "LEFT";
  roles: string[];
  joinedAt: string;
}

const filters = [
  { key: "PENDING", label: "Waiting for approval" },
  { key: "ACTIVE", label: "Active" },
  { key: "", label: "Everyone" },
] as const;

export default function ApprovalsPage() {
  const { org } = useSession();
  const [filter, setFilter] = useState<(typeof filters)[number]["key"]>("PENDING");
  const [rows, setRows] = useState<Member[] | null>(null);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  const load = useCallback(async () => {
    if (!org) return;
    setError(undefined);
    try {
      setRows(await api<Member[]>("GET", `/admin/members${filter ? `?status=${filter}` : ""}`));
    } catch (e) {
      setError(e instanceof RequestError ? e.message : "Could not load employees.");
    }
  }, [org, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await api("POST", `/admin/members/${id}/${action}`);
      await load();
    } catch (e) {
      setError(e instanceof RequestError ? e.message : "That didn't work. Try again.");
    } finally {
      setBusyId(undefined);
    }
  }

  if (!org) return <p className="text-muted">Choose a company to see its employees.</p>;

  return (
    <section className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold">Employees</h1>
        <p className="text-sm text-muted">New sign-ups wait here until HR approves them. Approved people can book and offer rides.</p>
      </div>
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
      {error && <p role="alert" className="font-semibold text-danger">{error}</p>}
      {rows === null ? (
        <p className="text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-[18px] border-[1.5px] border-dashed border-line-strong p-8 text-center text-muted">
          {filter === "PENDING" ? "No one is waiting. New sign-ups will appear here." : "No employees match this filter."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-4 rounded-[18px] border border-line bg-white p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E0EAFF] font-extrabold text-[#1E3A8A]">
                {m.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-extrabold">{m.name}</span>
                <span className="truncate text-sm text-muted">
                  {m.email}
                  {m.department ? ` · ${m.department}` : ""} · {m.roles.join(", ").toLowerCase()}
                </span>
              </span>
              {m.status === "PENDING" ? (
                <span className="flex gap-2">
                  <Button variant="ghost" disabled={busyId === m.id} onClick={() => decide(m.id, "reject")}>
                    Reject
                  </Button>
                  <Button disabled={busyId === m.id} onClick={() => decide(m.id, "approve")}>
                    Approve
                  </Button>
                </span>
              ) : (
                <Badge tone={m.status === "ACTIVE" ? "success" : "neutral"}>{m.status.toLowerCase()}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}