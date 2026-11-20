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
    router.replace(support ? "/employees" : org && features.share ? "/dashboard" : isAdmin ? "/employees" : me.user.isPlatformAdmin ? "/platform" : "/account");
  }, [me, org, isAdmin, features.share, support, router]);
  return <p className="text-muted">Loading…</p>;
}