"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { CHAT_EVENT, CHAT_READ_EVENT, REALTIME_PATH } from "@rydo/shared";

/**
 * One Socket.IO connection per tab. Signs in with the web cookie.
 * In development the web runs on :3000 and the API on :4000; in production set NEXT_PUBLIC_REALTIME_URL
 * (or leave it empty when the API is served from the same address).
 */
let socket: Socket | null = null;
/** How many parts of the page listen to each room; leave the room only when the last one stops. */
const rooms = new Map<string, number>();

function realtimeUrl() {
  const set = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (set !== undefined) return set || window.location.origin;
  return window.location.port === "3000" ? `${window.location.protocol}//${window.location.hostname}:4000` : window.location.origin;
}

function getSocket() {
  if (!socket) socket = io(realtimeUrl(), { path: REALTIME_PATH, transports: ["websocket"], withCredentials: true });
  return socket;
}

type Sub = { rideId?: string; opsOrgId?: string } | null;

/** Join a ride or company-ops room and get its live events. Re-joins after reconnects. */
export function useRealtime(sub: Sub, handlers: Record<string, (data: never) => void>) {
  const h = useRef(handlers);
  useEffect(() => {
    h.current = handlers;
  });
  const key = sub ? `${sub.rideId ?? ""}|${sub.opsOrgId ?? ""}` : "";

  useEffect(() => {
    if (!key) return;
    const [rideId, opsOrgId] = key.split("|");
    const body = rideId ? { rideId } : { opsOrgId };
    const s = getSocket();
    const join = () => s.emit("subscribe", body);
    const listeners = new Map<string, (d: unknown) => void>();
    for (const ev of Object.keys(h.current)) {
      const fn = (d: unknown) => (h.current[ev] as (d: unknown) => void)?.(d);
      listeners.set(ev, fn);
      s.on(ev, fn);
    }
    rooms.set(key, (rooms.get(key) ?? 0) + 1);
    s.on("connect", join);
    if (s.connected) join();
    return () => {
      s.off("connect", join);
      listeners.forEach((fn, ev) => s.off(ev, fn));
      const left = (rooms.get(key) ?? 1) - 1;
      if (left <= 0) {
        rooms.delete(key);
        s.emit("unsubscribe", body);
      } else rooms.set(key, left);
    };
    // Handler names are fixed per caller; re-run only when the room changes.
  }, [key]);
}

/** Live messages of one private chat (driver + one rider). Joins the chat room and re-joins after reconnects. */
export function useChatRealtime(thread: { rideId: string; riderMembershipId: string } | null, onMessage: (m: ChatLive) => void, onRead?: () => void) {
  const cb = useRef({ onMessage, onRead });
  useEffect(() => {
    cb.current = { onMessage, onRead };
  });
  const rideId = thread?.rideId;
  const riderMembershipId = thread?.riderMembershipId;
  useEffect(() => {
    if (!rideId || !riderMembershipId) return;
    const s = getSocket();
    const body = { rideId, riderMembershipId };
    const join = () => s.emit("chat.subscribe", body);
    const msg = (m: ChatLive) => cb.current.onMessage(m);
    const read = () => cb.current.onRead?.();
    s.on(CHAT_EVENT, msg);
    s.on(CHAT_READ_EVENT, read);
    s.on("connect", join);
    if (s.connected) join();
    return () => {
      s.off("connect", join);
      s.off(CHAT_EVENT, msg);
      s.off(CHAT_READ_EVENT, read);
      s.emit("chat.unsubscribe", body);
    };
  }, [rideId, riderMembershipId]);
}

export interface ChatLive {
  id: string;
  rideId: string;
  riderMembershipId: string;
  senderMembershipId: string;
  body: string;
  createdAt: string;
}

/** Straight-line distance in metres (for "driver is 1.2 km away"). */
export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
