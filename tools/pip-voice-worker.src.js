// Pip's video voice (Kokoro, "am_puck") running on the iPad itself.
// Turns text into 24 kHz audio, one sentence at a time, the same way the lesson videos were voiced.
import * as ort from "onnxruntime-web/wasm";
import { phonemize as espeak } from "phonemizer";
import VOCAB from "./vocab.json";

const BASE = new URL("./", self.location.href).href;
const MODEL_URL = BASE + "kokoro-int8.onnx";
const VOICE_URL = BASE + "am_puck.bin";
const CACHE = "pip-voice-v1";
ort.env.wasm.wasmPaths = BASE;
ort.env.wasm.numThreads = 1;

let session = null, voice = null, loading = null;

// Fetch once, then keep the file in the browser's cache so later visits load instantly.
async function cachedBytes(url, onProgress) {
  let cache = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch (e) {}
  const res = await fetch(url);
  if (!res.ok) throw new Error("download failed " + res.status);
  const total = +res.headers.get("content-length") || 0, reader = res.body.getReader(), parts = [];
  let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; if (onProgress && total) onProgress(got / total); }
  const bytes = new Uint8Array(got); let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
  if (cache) try { await cache.put(url, new Response(bytes)); } catch (e) {}
  return bytes;
}

function load() {
  return loading ||= (async () => {
    const [model, v] = await Promise.all([
      cachedBytes(MODEL_URL, p => postMessage({ type: "progress", value: p })),
      cachedBytes(VOICE_URL),
    ]);
    voice = new Float32Array(v.buffer, v.byteOffset, v.byteLength / 4);
    session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    postMessage({ type: "ready" });
  })();
}

// Text to phonemes: espeak-ng (en-us) with punctuation kept, as kokoro-onnx does for the videos.
const PUNCT = /(\s*[;:,.!?¡¿—…"«»“”(){}\[\]]+\s*)+/g;
async function phonemes(text) {
  text = text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  const out = [];
  let last = 0;
  for (const m of text.matchAll(PUNCT)) {
    if (m.index > last) out.push((await espeak(text.slice(last, m.index), "en-us")).join(" "));
    out.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push((await espeak(text.slice(last), "en-us")).join(" "));
  return out.join("").replace(/ʲ/g, "j").replace(/r/g, "ɹ").replace(/x/g, "k").replace(/ɬ/g, "l").trim();
}

async function speakSentence(text, speed) {
  const ph = await phonemes(text);
  const ids = [...ph].map(c => VOCAB[c]).filter(i => i !== undefined).slice(0, 510);
  if (!ids.length) return null;
  const row = Math.min(ids.length, 510) - 1;
  const feeds = {
    tokens: new ort.Tensor("int64", BigInt64Array.from([0, ...ids, 0].map(BigInt)), [1, ids.length + 2]),
    style: new ort.Tensor("float32", voice.slice(row * 256, row * 256 + 256), [1, 256]),
    speed: new ort.Tensor("float32", new Float32Array([speed]), [1]),
  };
  const { audio } = await session.run(feeds);
  return trim(audio.data);
}

// Cut the quiet lead-in and tail, like kokoro-onnx does, so sentences flow together.
function trim(a) {
  let peak = 0; for (const x of a) peak = Math.max(peak, Math.abs(x));
  const th = peak * 0.03, pad = 1200;
  let s = 0, e = a.length - 1;
  while (s < e && Math.abs(a[s]) < th) s++;
  while (e > s && Math.abs(a[e]) < th) e--;
  return a.slice(Math.max(0, s - pad), Math.min(a.length, e + pad));
}

function sentences(text) {
  return (text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || []).map(s => s.trim()).filter(Boolean);
}

let current = 0;
onmessage = async ({ data }) => {
  try {
    if (data.type === "load") { await load(); return; }
    // Download the voice into the cache ahead of time without starting it up.
    if (data.type === "prefetch") { await cachedBytes(MODEL_URL, p => postMessage({ type: "progress", value: p })); await cachedBytes(VOICE_URL); postMessage({ type: "prefetched" }); return; }
    if (data.type === "speak") {
      const id = current = data.id;
      await load();
      for (const s of sentences(data.text)) {
        if (id !== current) return;
        const t0 = performance.now();
        const audio = await speakSentence(s, data.speed || 1);
        if (id !== current) return;
        if (audio) postMessage({ type: "audio", id, audio, ms: performance.now() - t0 }, [audio.buffer]);
      }
      postMessage({ type: "done", id });
    }
    if (data.type === "stop") current = -1;
  } catch (e) {
    postMessage({ type: "error", id: data.id, message: String(e && e.message || e) });
  }
};
