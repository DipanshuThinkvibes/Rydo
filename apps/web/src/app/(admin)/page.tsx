"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

/** Sends people to the page that matters for their role. */
export default function Home() {
  const { me, org, isAdmin } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!me) return;
    router.replace(isAdmin ? "/employees" : org ? "/ride" : me.user.isPlatformAdmin ? "/platform" : "/account");
  }, [me, org, isAdmin, router]);
  return <p className="text-muted">Loading…</p>;
}