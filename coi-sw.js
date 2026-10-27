// Adds the two headers GitHub Pages can't send (COOP and COEP) to page loads, so the pages are
// "cross-origin isolated". That unlocks SharedArrayBuffer, which lets Steve's voice run on several cores.
// Only page navigations and the voice worker script are touched (an isolated page can only start a worker
// that is isolated too); videos, audio and everything else go straight to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.mode !== "navigate" && e.request.destination !== "worker") return;
  e.respondWith((async () => {
    const r = await fetch(e.request);
    if (!r.ok || r.type === "opaqueredirect") return r;
    const h = new Headers(r.headers);
    h.set("Cross-Origin-Opener-Policy", "same-origin");
    h.set("Cross-Origin-Embedder-Policy", "require-corp");
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  })());
});
