// Saving challenge results. Every answer and recording first goes into an outbox on this iPad (IndexedDB), then is sent
// to the "challenges" function in the homeschool-pip Supabase project. If the network is down, it waits and tries again
// later, so nothing Joshua does is lost. A short summary per challenge is also kept in localStorage for the trophies.
(function () {
  const ENDPOINT = "https://nkumukzkrfdfnicozefu.supabase.co/functions/v1/challenges";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rdW11a3prcmZkZm5pY296ZWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNjExMzksImV4cCI6MjEwODYzNzEzOX0.FwbfSO-UxG4FtnHhJ4I66zJQKEF2j2tg9Ty0kcJKa1M";
  const DB = "challenges-outbox", OS = "out";

  function db() {
    return new Promise((ok, no) => {
      let r; try { r = indexedDB.open(DB, 1); } catch (e) { no(e); return; }
      r.onupgradeneeded = () => r.result.createObjectStore(OS, { keyPath: "k", autoIncrement: true });
      r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
    });
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((ok, no) => { const t = d.transaction(OS, mode); const s = t.objectStore(OS); const out = fn(s); t.oncomplete = () => ok(out && out.result); t.onerror = () => no(t.error); });
  }
  const memory = []; // used only if IndexedDB is unavailable (private browsing)
  async function put(item) { try { await tx("readwrite", s => s.add(item)); } catch (e) { memory.push(item); } }
  async function all() { let a = []; try { a = await tx("readonly", s => s.getAll()); } catch (e) {} return a.concat(memory); }
  async function del(item) { if (item.k == null) { memory.splice(memory.indexOf(item), 1); return; } try { await tx("readwrite", s => s.delete(item.k)); } catch (e) {} }

  async function send(item) {
    const h = { Authorization: "Bearer " + ANON, apikey: ANON };
    let res;
    if (item.blob) {
      const q = new URLSearchParams({ action: "recording", session: item.session, qid: item.qid, kind: item.kind || "read", ms: String(item.ms || 0), text: item.text || "" });
      res = await fetch(ENDPOINT + "?" + q, { method: "POST", headers: { ...h, "Content-Type": item.blob.type || "audio/mp4" }, body: item.blob });
    } else {
      res = await fetch(ENDPOINT, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
    }
    // 4xx (except 429) will never succeed, so drop it instead of blocking everything behind it
    if (!res.ok && (res.status >= 500 || res.status === 429 || res.status === 401)) throw new Error("save failed " + res.status);
  }
  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      const items = (await all()).sort((a, b) => (a.t || 0) - (b.t || 0));
      for (const it of items) {
        try { await send(it); await del(it); }
        catch (e) { break; } // keep order: an answer never lands before its session
      }
    })().finally(() => { flushing = null; });
    return flushing;
  }
  function queue(item) { item.t = Date.now() + Math.random() / 10; return put(item).then(() => { flush().catch(() => {}); }); }

  function device() {
    try { let d = localStorage.getItem("challenges:device"); if (!d) { d = uuid(); localStorage.setItem("challenges:device", d); } return d; } catch (e) { return "unknown"; }
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  function local(exam, patch) {
    const key = "challenges:" + exam;
    let r = {}; try { r = JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch (e) {}
    if (patch) { Object.assign(r, patch); try { localStorage.setItem(key, JSON.stringify(r)); } catch (e) {} }
    return r;
  }

  window.ChallengeStore = {
    ENDPOINT, ANON, uuid, flush, local,
    start(exam, total) {
      const id = uuid();
      queue({ body: { action: "start", session: id, exam, device: device(), total } });
      local(exam, { lastStarted: Date.now() });
      return id;
    },
    answer(session, a) { return queue({ body: { action: "answer", session, ...a } }); },
    recording(session, qid, blob, meta) { return queue({ session, qid, blob, ...meta }); },
    finish(session, exam, points, max) {
      const r = local(exam);
      local(exam, { done: true, last: points, max, best: Math.max(r.best || 0, points), finishedAt: Date.now(), times: (r.times || 0) + 1 });
      return queue({ body: { action: "finish", session, points, max } });
    },
    pending: async () => (await all()).length,
  };
  addEventListener("online", () => flush().catch(() => {}));
  addEventListener("load", () => setTimeout(() => flush().catch(() => {}), 1500));
})();
