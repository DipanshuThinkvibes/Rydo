"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

/** Sends people to the page that matters for their role. */
export default function Home() {
  const { me, org, isAdmin, features, support } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!me) return;
    router.replace(support ? "/employees" : isAdmin ? "/employees" : org && features.share ? "/ride" : me.user.isPlatformAdmin ? "/platform" : "/account");
  }, [me, org, isAdmin, features.share, support, router]);
  return <p className="text-muted">Loading…</p>;
}