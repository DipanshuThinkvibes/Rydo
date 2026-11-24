"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

/** Sends people to the page that matters for their role. */
export default function Home() {
  const { me, org, isAdmin, can, features, support } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!me) return;
    router.replace(support ? "/employees" : isAdmin ? (can("HR_ADMIN", "ORG_ADMIN") ? "/employees" : "/ops") : org && features.share ? "/dashboard" : me.user.isPlatformAdmin ? "/platform" : me.user.platformRole === "SUPPORT" ? "/platform/reports" : "/account");
  }, [me, org, isAdmin, can, features.share, support, router]);
  return <p className="text-muted">Loading…</p>;
}