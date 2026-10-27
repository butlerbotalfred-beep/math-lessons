// Ask Steve: Joshua taps Steve, says his question, and Steve answers out loud.
// Speech-to-text is Safari's built-in recognizer; answers come from Claude through the ask-pip function.
(function () {
  const ENDPOINT = "https://nkumukzkrfdfnicozefu.supabase.co/functions/v1/ask-pip";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rdW11a3prcmZkZm5pY296ZWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNjExMzksImV4cCI6MjEwODYzNzEzOX0.FwbfSO-UxG4FtnHhJ4I66zJQKEF2j2tg9Ty0kcJKa1M";
  const page = (location.pathname.match(/\/(p\d+)\//) || [])[1] || "home";
  const HKEY = "pip-history:" + page;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  

  const BASE = new URL("./", (document.currentScript && document.currentScript.src) || location.href).href;
  const FACE = `<img src="${BASE}art/steve-head.webp" alt="" width="240" height="240" draggable="false">`;
  const MIC = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  let fab, panel, statusEl, heardEl, answerEl, loadEl, talkBtn, againBtn, rec = null, busy = false;

  function build() {
    fab = el("button", "pip-fab", FACE + "<span>Ask Steve</span>");
    fab.type = "button"; fab.id = "pip-open"; fab.setAttribute("aria-label", "Ask Steve a question by talking");
    panel = el("div", "pip-panel"); panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Ask Steve");
    panel.innerHTML = `<div class="pip-card">
      <div class="pip-top"><span class="pip-owl">${FACE}</span><p class="pip-status" id="pip-status" aria-live="polite"></p>
        <button class="pip-x" id="pip-close" type="button" aria-label="Close">✕</button></div>
      <p class="pip-heard" id="pip-heard" hidden></p>
      <p class="pip-answer" id="pip-answer" hidden></p>
      <p class="pip-load" id="pip-load" hidden></p>
      <div class="pip-btns">
        <button class="pip-talk" id="pip-talk" type="button">${MIC}<span>Talk to Steve</span></button>
        <button class="pip-again" id="pip-again" type="button" hidden>Hear it again</button>
      </div></div>`;
    document.body.appendChild(fab); document.body.appendChild(panel);
    statusEl = panel.querySelector("#pip-status"); heardEl = panel.querySelector("#pip-heard"); answerEl = panel.querySelector("#pip-answer"); loadEl = panel.querySelector("#pip-load");
    talkBtn = panel.querySelector("#pip-talk"); againBtn = panel.querySelector("#pip-again");
    fab.onclick = () => { open(); listen(); };
    talkBtn.onclick = () => { if (rec) { rec.stop(); return; } listen(); };
    againBtn.onclick = () => { wakeVoice(); replay(); };
    panel.querySelector("#pip-close").onclick = close;
    panel.addEventListener("click", e => { if (e.target === panel) close(); });
  }
  function open() {
    const v = document.getElementById("v"); if (v && !v.paused) v.pause();
    panel.hidden = false; fab.hidden = true;
  }
  function close() {
    if (rec) { try { rec.abort(); } catch (e) {} rec = null; }
    hush();
    panel.hidden = true; fab.hidden = false;
  }
  function status(t) { statusEl.textContent = t; }

  // ---- Steve's voice ----
  // The same Kokoro voice (a michael and puck mix) as the lesson videos, made right on the iPad by voice/pip-voice-worker.js.
  // The first time, the voice (about 110 MB) downloads and is kept in the browser's cache. Until it is ready,
  // or if it can't run, Steve falls back to the iPad's built-in voice.
  const VOICE_DIR = BASE + "voice/";
  let worker = null, voiceState = "off", ctx = null, nextAt = 0, speakId = 0, sources = [];
  let lastText = "", lastChunks = [], waiting = null, waitTimer = null;
  // While an answer is being voiced: pieces waiting to play, and how fast this device makes speech.
  let plan = null, pending = [], started = false, madeMs = 0, madeSec = 0, madeChars = 0;
  const lineCache = {};
  function startWorker(kind) {
    if (voiceState === "failed") return;
    if (!worker) {
      try { worker = new Worker(VOICE_DIR + "pip-voice-worker.js", { type: "module" }); }
      catch (e) { voiceState = "failed"; return; }
      worker.onmessage = onVoice;
      worker.onerror = () => voiceFailed();
    }
    if (kind === "load" && voiceState === "off") { voiceState = "loading"; worker.postMessage({ type: "load" }); }
    if (kind === "prefetch") worker.postMessage({ type: "prefetch" });
  }
  function voiceFailed() {
    voiceState = "failed"; loadEl.hidden = true;
    if (waiting) { const t = waiting; waiting = null; clearTimeout(waitTimer); fallbackSpeak(t); }
  }
  function onVoice({ data }) {
    if (data.type === "progress" && voiceState === "loading") {
      loadEl.hidden = false; loadEl.textContent = "Getting Steve's voice ready… " + Math.round(data.value * 100) + "%";
    } else if (data.type === "ready") {
      voiceState = "ready"; loadEl.hidden = true;
      if (waiting) { const t = waiting; waiting = null; clearTimeout(waitTimer); speak(t); }
    } else if (data.type === "plan" && data.id === speakId) {
      plan = data.sizes;
    } else if (data.type === "audio" && data.id === speakId) {
      const buf = audioCtx().createBuffer(1, data.audio.length, 24000);
      buf.getChannelData(0).set(data.audio);
      buf.gap = data.gap; // the pause after this piece: longer after a sentence or colon
      lastChunks.push(buf);
      madeMs += data.ms; madeSec += buf.duration; madeChars += plan ? plan[lastChunks.length - 1] || 0 : 0;
      pending.push(buf); flush(false);
    } else if (data.type === "done" && data.id === speakId) {
      flush(true);
    } else if (data.type === "error") {
      if (data.id === speakId) fallbackSpeak(lastText);
      if (voiceState !== "ready") voiceFailed();
    }
  }
  function audioCtx() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function playBuffer(buf) {
    const c = audioCtx(), src = c.createBufferSource();
    src.buffer = buf; src.connect(c.destination);
    const at = Math.max(c.currentTime + 0.05, nextAt);
    src.start(at); nextAt = at + buf.duration + (buf.gap != null ? buf.gap : 0.15);
    sources.push(src);
  }
  // Start talking only once enough is ready that Steve won't stall between sentences,
  // judged from how fast this iPad has been making speech so far.
  function flush(all) {
    if (!started && !all && plan) {
      const left = plan.reduce((a, b) => a + b, 0) - madeChars;
      const stillToMake = left * (madeSec / Math.max(madeChars, 1)) * (madeMs / 1000 / Math.max(madeSec, 0.01));
      const ready = pending.reduce((a, b) => a + b.duration + (b.gap || 0), 0);
      if (ready < stillToMake * 1.15) return;
    }
    started = true;
    pending.forEach(playBuffer); pending = [];
  }
  function hush() {
    sources.forEach(s => { try { s.stop(); } catch (e) {} });
    sources = []; nextAt = 0; speakId++;
    try { speechSynthesis.cancel(); } catch (e) {}
    if (worker) worker.postMessage({ type: "stop" });
  }
  function speak(text) {
    hush(); lastText = text; lastChunks = [];
    plan = null; pending = []; started = false; madeMs = 0; madeSec = 0; madeChars = 0;
    if (voiceState === "ready") { worker.postMessage({ type: "speak", id: speakId, text }); return; }
    if (voiceState === "loading") {
      // Wait a little for the video voice; if it takes too long, use the built-in voice this time.
      waiting = text; clearTimeout(waitTimer);
      waitTimer = setTimeout(() => { if (waiting) { const t = waiting; waiting = null; fallbackSpeak(t); } }, 20000);
      return;
    }
    fallbackSpeak(text);
  }
  function replay() {
    if (!lastChunks.length) { speak(lastText); return; }
    const chunks = lastChunks; hush(); lastChunks = chunks; chunks.forEach(playBuffer);
  }
  // Short fixed lines were recorded ahead of time in Steve's voice.
  async function line(name, text) {
    hush();
    try {
      if (!lineCache[name]) {
        const bytes = await (await fetch(VOICE_DIR + "lines/" + name + ".mp3")).arrayBuffer();
        lineCache[name] = await new Promise((ok, no) => audioCtx().decodeAudioData(bytes, ok, no));
      }
      playBuffer(lineCache[name]);
    } catch (e) { fallbackSpeak(text); }
  }

  // The iPad's own voice, used only as a backup.
  function pipVoice() {
    try {
      const vs = speechSynthesis.getVoices().filter(v => /^en[-_]US/i.test(v.lang));
      return vs.find(v => /Samantha|Ava|Allison|Google US English/i.test(v.name)) || vs[0] || null;
    } catch (e) { return null; }
  }
  function fallbackSpeak(text) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/:\s*/g, ". "));
      const v = pipVoice(); if (v) u.voice = v;
      u.lang = "en-US"; u.rate = 0.85; u.pitch = 1.15;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  // iPad only plays sound after a tap has started it once; do that silently on the first tap.
  let woke = false;
  function wakeVoice() {
    audioCtx();
    if (woke) return; woke = true;
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
    startWorker("load");
  }

  // ---- listening ----
  function listen() {
    wakeVoice();
    if (busy) return;
    if (!SR) {
      status("Steve can only hear you in Safari. Ask a grown-up to open this page in Safari.");
      talkBtn.hidden = true; return;
    }
    hush();
    heardEl.hidden = true; answerEl.hidden = true; againBtn.hidden = true;
    let heard = "", failed = null;
    rec = new SR(); rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    talkBtn.classList.add("on"); talkBtn.querySelector("span").textContent = "I'm listening…";
    status("Ask your question!");
    rec.onresult = ev => {
      heard = [...ev.results].map(r => r[0].transcript).join(" ").trim();
      heardEl.hidden = !heard; heardEl.textContent = heard;
    };
    rec.onerror = ev => { failed = ev.error; };
    rec.onend = () => {
      rec = null; talkBtn.classList.remove("on"); talkBtn.querySelector("span").textContent = "Talk to Steve";
      if (failed === "not-allowed" || failed === "service-not-allowed") {
        status("Steve needs the microphone. Grown-ups: tap the aA button in Safari's address bar, then Website Settings, and set Microphone to Allow.");
        return;
      }
      if (failed === "audio-capture") { status("Steve can't find the microphone on this iPad."); return; }
      if (!heard) { status("Steve didn't hear anything. Tap Talk to Steve and try again!"); line("nothear", "Oops, I didn't hear you. Tap the button and try again!"); return; }
      ask(heard);
    };
    try { rec.start(); } catch (e) { rec = null; status("Steve can't listen right now. Try again in a moment."); }
  }

  // ---- asking ----
  function history() { try { return JSON.parse(sessionStorage.getItem(HKEY) || "[]"); } catch (e) { return []; } }
  function remember(q, a) {
    const h = history().concat([{ role: "user", text: q }, { role: "assistant", text: a }]).slice(-6);
    try { sessionStorage.setItem(HKEY, JSON.stringify(h)); } catch (e) {}
  }
  // Color chips have no text; name their color from its hue.
  function colorName(x) {
    const m = getComputedStyle(x).backgroundColor.match(/\d+/g); if (!m) return "";
    const [r, g, b] = m.map(Number), max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 30) return max > 200 ? "white" : max < 60 ? "black" : "gray";
    let h = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min);
    h = (h * 60 + 360) % 360;
    return (h < 15 || h >= 335 ? "red" : h < 40 ? "orange" : h < 70 ? "yellow" : h < 170 ? "green" : h < 255 ? "blue" : h < 300 ? "purple" : "pink") + " square";
  }
  // What Joshua is looking at, so "explain the question" means the question on screen.
  function onScreen() {
    const card = document.querySelector("#quiz:not([hidden]) .card");
    if (!card) return "";
    const chips = [...card.querySelectorAll(".visual > *")].map(x => x.textContent.trim() || colorName(x)).filter(Boolean);
    const prompt = (card.querySelector(".prompt") || {}).textContent || "";
    const opts = [...card.querySelectorAll(".opt")].map(o => o.textContent.trim() + (o.classList.contains("wrong") ? " (already tried, not right)" : ""));
    return [chips.length ? "Shown: " + chips.join(", ") : "", "Question: " + prompt, opts.length ? "Answer choices: " + opts.join(" | ") : ""].filter(Boolean).join("\n").slice(0, 600);
  }
  async function ask(q) {
    busy = true; talkBtn.disabled = true;
    status("Steve is thinking…");
    line("think", "Hmm, let me think!");
    let answer = null, err = null;
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ANON, "apikey": ANON },
        body: JSON.stringify({ page, question: q, history: history(), screen: onScreen() }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.answer) answer = data.answer; else err = data.error || r.status;
    } catch (e) { err = "offline"; }
    busy = false; talkBtn.disabled = false;
    if (!answer) {
      const [name, msg, said] = err === "rate_limited" ? ["rest", "Steve needs a little rest. Let's try again in a minute!", "I need a little rest. Let's try again in a minute!"]
        : err === "offline" ? ["offline", "Steve can't reach the internet right now. Let's try again soon!", "I can't reach the internet right now. Let's try again soon!"]
        : err === "no_key" ? ["notset", "Steve isn't set up yet. Grown-ups: the Claude key still needs to be added in Supabase.", "I'm not set up yet. Ask a grown-up for help!"]
        : ["mixed", "Whoops! Steve got mixed up. Let's try again!", "Whoops, I got mixed up. Let's try again!"];
      status(msg); line(name, said);
      return;
    }
    remember(q, answer);
    status("Steve says:");
    answerEl.textContent = answer; answerEl.hidden = false; againBtn.hidden = false;
    speak(answer);
  }

  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
  // Let the pages run cross-origin isolated (see coi-sw.js) so Steve's voice can use several cores.
  // It takes effect from the next page load; until then the voice just runs on one core.
  try { if ("serviceWorker" in navigator && !window.crossOriginIsolated) navigator.serviceWorker.register(BASE + "coi-sw.js", { scope: BASE }).catch(() => {}); } catch (e) {}
  // On the home page, quietly download Steve's voice ahead of time so it is ready in the lessons.
  if (page === "home" && !(navigator.connection && navigator.connection.saveData)) {
    addEventListener("load", () => setTimeout(() => startWorker("prefetch"), 4000));
  }
  try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch (e) {}
})();
