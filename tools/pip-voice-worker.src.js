// Steve's video voice (Kokoro: 60% "am_michael" + 40% "am_puck", in steve.bin) running on the iPad itself.
// Turns text into 24 kHz audio, one sentence at a time, the same way the lesson videos were voiced.
import * as ort from "onnxruntime-web/wasm";
import { phonemize as espeak } from "phonemizer";
import VOCAB from "./vocab.json";

const BASE = new URL("./", self.location.href).href;
const MODEL_URL = BASE + "kokoro-int8.onnx";
const VOICE_URL = BASE + "steve.bin";
const CACHE = "pip-voice-v1";
ort.env.wasm.wasmPaths = BASE;
// Several cores when the page is cross-origin isolated (coi-sw.js), otherwise one.
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;

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
  // The voice's style is picked by length. Very short lines ("Great!") get a style that mumbles the first sound
  // ("uh-five"), so short lines borrow the style of a normal sentence.
  const row = Math.min(Math.max(ids.length, 40), 510) - 1;
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

// Split an answer into pieces, each with the pause that follows it, so Steve doesn't rush:
// half a second after a sentence, a bit less after a colon, and counting ("2, 4, 6, 8") slowed to a steady beat.
const NUM = "(?:\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)";
const COUNT = new RegExp(`\\b${NUM}(?:\\s*,\\s*(?:and\\s+)?${NUM}\\b){2,}`, "gi");
function chunks(text, speed) {
  const out = [];
  const add = (t, sp, gap) => { t = t.trim(); if (/[a-z0-9]/i.test(t)) out.push({ text: t, speed: sp, gap }); };
  const parts = text.match(/[^.!?:;]+(?:[.!?:;]+["')\]]*|$)/g) || [];
  for (const part of parts) {
    const end = /[:;]\W*$/.test(part.trim()) ? 0.4 : 0.5;
    let last = 0, m;
    COUNT.lastIndex = 0;
    while ((m = COUNT.exec(part))) {
      add(part.slice(last, m.index), speed, 0.3);
      // "2... 4... 6... 8." at a slower speed gives each number room without saying any of them alone
      add(m[0].split(/\s*,\s*(?:and\s+)?/).join("... ") + ".", 0.7, 0.35);
      last = m.index + m[0].length;
    }
    add(part.slice(last), speed, end);
    if (out.length) out[out.length - 1].gap = Math.max(out[out.length - 1].gap, end);
  }
  return out;
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
      const pieces = chunks(data.text, data.speed || 0.9);
      postMessage({ type: "plan", id, sizes: pieces.map(c => c.text.length / c.speed) });
      for (const c of pieces) {
        if (id !== current) return;
        const t0 = performance.now();
        const audio = await speakSentence(c.text, c.speed);
        if (id !== current) return;
        if (audio) postMessage({ type: "audio", id, audio, gap: c.gap, ms: performance.now() - t0 }, [audio.buffer]);
      }
      postMessage({ type: "done", id });
    }
    if (data.type === "stop") current = -1;
  } catch (e) {
    postMessage({ type: "error", id: data.id, message: String(e && e.message || e) });
  }
};
