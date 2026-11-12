// Steve's Challenges: saves Joshua's assessment answers and reading recordings, and serves them to the grown-ups page.
// Kid actions (start, answer, finish, recording) need only the public anon key. Everything that reads, marks or deletes
// needs the grown-ups code, which is stored here only as a salted PBKDF2 hash (table ch_parent).
// Tables ch_* have RLS on with no policies; recordings sit in the private "challenge-recordings" bucket.
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://butlerbotalfred-beep.github.io", "http://localhost:8765"];
const BUCKET = "challenge-recordings";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const hits = new Map<string, number[]>();
function limited(ip: string, max: number) {
  const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  recent.push(now); hits.set(ip, recent);
  return recent.length > max;
}
function cors(origin: string | null) {
  const ok = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

const s = (v: unknown, n = 200) => (v == null ? null : String(v).slice(0, n));
const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const bool = (v: unknown) => (v == null ? null : !!v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hash(code: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 120_000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
// true = right code; false = wrong; "locked" = too many wrong tries; "unset" = no code chosen yet
async function checkCode(code: unknown): Promise<true | false | "locked" | "unset"> {
  const { data } = await db.from("ch_parent").select("*").eq("id", 1).maybeSingle();
  if (!data) return "unset";
  if (data.locked_until && new Date(data.locked_until) > new Date()) return "locked";
  const ok = typeof code === "string" && (await hash(code, data.salt)) === data.code_hash;
  const fails = ok ? 0 : data.fails + 1;
  await db.from("ch_parent").update({ fails: fails >= 8 ? 0 : fails, locked_until: fails >= 8 ? new Date(Date.now() + 15 * 60_000).toISOString() : null }).eq("id", 1);
  return ok;
}

async function kid(action: string, b: Record<string, unknown>, req: Request, url: URL) {
  if (action === "start") {
    if (!UUID.test(String(b.session))) return [{ error: "session" }, 400] as const;
    const { error } = await db.from("ch_sessions").upsert({ id: b.session, exam: s(b.exam, 40), device: s(b.device, 64), total: int(b.total) }, { onConflict: "id", ignoreDuplicates: true });
    return error ? [{ error: error.message }, 500] as const : [{ ok: true }, 200] as const;
  }
  if (action === "answer") {
    if (!UUID.test(String(b.session))) return [{ error: "session" }, 400] as const;
    const row = {
      session_id: b.session, qid: s(b.qid, 40), type: s(b.type, 20), subject: s(b.subject, 40), skill: s(b.skill, 120), band: s(b.band, 10), ladder: s(b.ladder, 40),
      first_try: bool(b.firstTry), tries: int(b.tries), ms: int(b.ms), replays: int(b.replays), chosen: int(b.chosen),
      wrong: Array.isArray(b.wrong) ? b.wrong.slice(0, 10).map(Number) : null,
      revealed: !!b.revealed, skipped: !!b.skipped, stopped_early: !!b.stoppedEarly, recorded: !!b.recorded,
    };
    const { error } = await db.from("ch_answers").upsert(row, { onConflict: "session_id,qid" });
    return error ? [{ error: error.message }, 500] as const : [{ ok: true }, 200] as const;
  }
  if (action === "finish") {
    const { error } = await db.from("ch_sessions").update({ points: int(b.points), max_points: int(b.max), finished_at: new Date().toISOString() }).eq("id", b.session);
    return error ? [{ error: error.message }, 500] as const : [{ ok: true }, 200] as const;
  }
  if (action === "recording") {
    const session = url.searchParams.get("session") || "", qid = (url.searchParams.get("qid") || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
    if (!UUID.test(session) || !qid) return [{ error: "bad" }, 400] as const;
    const mime = (req.headers.get("content-type") || "audio/mp4").split(";")[0];
    if (!/^audio\//.test(mime)) return [{ error: "type" }, 400] as const;
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!bytes.length || bytes.length > 10_000_000) return [{ error: "size" }, 400] as const;
    const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : "m4a";
    const path = `${session}/${qid}-${Date.now()}.${ext}`;
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) return [{ error: up.error.message }, 500] as const;
    const { error } = await db.from("ch_recordings").insert({ session_id: session, qid, kind: s(url.searchParams.get("kind"), 20) || "read", text: s(url.searchParams.get("text"), 500), path, mime, ms: int(url.searchParams.get("ms")) });
    return error ? [{ error: error.message }, 500] as const : [{ ok: true }, 200] as const;
  }
  return null;
}

async function parent(action: string, b: Record<string, unknown>) {
  if (action === "status") {
    const { data } = await db.from("ch_parent").select("id").eq("id", 1).maybeSingle();
    return [{ codeSet: !!data }, 200] as const;
  }
  if (action === "setcode") {
    const code = String(b.newCode || "");
    if (code.length < 4 || code.length > 64) return [{ error: "short" }, 400] as const;
    const { data } = await db.from("ch_parent").select("id").eq("id", 1).maybeSingle();
    if (data) { const ok = await checkCode(b.code); if (ok !== true) return [{ error: ok === "locked" ? "locked" : "code" }, 403] as const; }
    const salt = crypto.randomUUID();
    await db.from("ch_parent").upsert({ id: 1, code_hash: await hash(code, salt), salt, fails: 0, locked_until: null });
    return [{ ok: true }, 200] as const;
  }
  const ok = await checkCode(b.code);
  if (ok !== true) return [{ error: ok === "locked" ? "locked" : ok === "unset" ? "unset" : "code" }, 403] as const;

  if (action === "list") {
    const [ses, ans, recs, wr] = await Promise.all([
      db.from("ch_sessions").select("*").order("started_at", { ascending: false }).limit(200),
      db.from("ch_answers").select("*").limit(5000),
      db.from("ch_recordings").select("*").order("created_at").limit(2000),
      db.from("ch_writing").select("*").order("done_on", { ascending: false }).limit(100),
    ]);
    const recordings = recs.data || [];
    const signed = recordings.length ? await db.storage.from(BUCKET).createSignedUrls(recordings.map(r => r.path), 3600) : { data: [] };
    const urls = new Map((signed.data || []).map((x: { path: string | null; signedUrl: string }) => [x.path, x.signedUrl]));
    return [{ sessions: ses.data || [], answers: ans.data || [], recordings: recordings.map(r => ({ ...r, url: urls.get(r.path) || null })), writing: wr.data || [] }, 200] as const;
  }
  if (action === "mark") {
    const { error } = await db.from("ch_recordings").update({ marks: b.marks ?? null, notes: s(b.notes, 2000) }).eq("id", b.id);
    return error ? [{ error: error.message }, 500] as const : [{ ok: true }, 200] as const;
  }
  if (action === "delrec") {
    const { data } = await db.from("ch_recordings").select("path").eq("id", b.id).maybeSingle();
    if (data) await db.storage.from(BUCKET).remove([data.path]);
    await db.from("ch_recordings").delete().eq("id", b.id);
    return [{ ok: true }, 200] as const;
  }
  if (action === "delsession") {
    const { data } = await db.from("ch_recordings").select("path").eq("session_id", b.session);
    if (data && data.length) await db.storage.from(BUCKET).remove(data.map(r => r.path));
    await db.from("ch_sessions").delete().eq("id", b.session);
    return [{ ok: true }, 200] as const;
  }
  if (action === "writing") {
    const row = { exam: s(b.exam, 40), scores: b.scores ?? {}, notes: s(b.notes, 2000), ...(b.done_on ? { done_on: s(b.done_on, 10) } : {}) };
    const { error } = b.id ? await db.from("ch_writing").update(row).eq("id", b.id) : await db.from("ch_writing").insert(row);
    return error ? [{ error: error.message }, 500] as const : [{ ok: true }, 200] as const;
  }
  if (action === "delwriting") {
    await db.from("ch_writing").delete().eq("id", b.id);
    return [{ ok: true }, 200] as const;
  }
  return [{ error: "action" }, 400] as const;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method" }, 405, origin);
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin" }, 403, origin);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (limited(ip, 1500)) return json({ error: "rate_limited" }, 429, origin);
  const url = new URL(req.url);
  try {
    if (url.searchParams.get("action") === "recording") {
      const r = await kid("recording", {}, req, url);
      return json(r![0], r![1], origin);
    }
    let b: Record<string, unknown>;
    try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400, origin); }
    const action = String(b.action || "");
    const r = (await kid(action, b, req, url)) || (await parent(action, b));
    return json(r[0], r[1], origin);
  } catch (e) {
    console.error(e);
    return json({ error: "server" }, 500, origin);
  }
});
