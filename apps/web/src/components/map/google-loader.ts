/**
 * Loads the Google Maps JavaScript API once per page. The only file that knows the script URL.
 * The browser key (NEXT_PUBLIC_GOOGLE_MAPS_KEY) must be restricted to this site's address in Google Cloud.
 */
let loading: Promise<void> | null = null;
let authFailed = false;
const listeners = new Set<() => void>();

export function onMapsAuthFailure(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function mapsAuthFailed() {
  return authFailed;
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("NO_WINDOW"));
  if (typeof (window as { google?: { maps?: { importLibrary?: unknown } } }).google?.maps?.importLibrary === "function") return Promise.resolve();
  if (loading) return loading;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) return Promise.reject(new Error("NO_KEY"));

  loading = new Promise<void>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    w.__rydoMapsReady = () => resolve();
    // Google calls this when the key is wrong or not allowed for this site.
    w.gm_authFailure = () => {
      authFailed = true;
      listeners.forEach((fn) => fn());
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__rydoMapsReady`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("LOAD_FAILED"));
    };
    document.head.appendChild(s);
  });
  return loading;
}
