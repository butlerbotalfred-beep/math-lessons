// Steve's Challenges player. Plays one exam (challenges/exams/<id>.json) question by question:
//  - tap:     Steve reads the question; the first tap on an answer reads it, a second tap picks it.
//  - explain: a tap question, then Joshua tells Steve why (recorded).
//  - read:    Steve gives the instructions only; Joshua reads the words himself into the microphone (recorded).
// Points for Joshua: 4 on the first try, then 3, then 2; after three misses Steve shows the answer (1 point).
// For the grown-ups report every answer is saved with first try right or not, tries, time, and replays.
// Early stop: after 3 first-try misses in a row in the same "ladder" (subject track), the rest of that track is skipped.
(function () {
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const EXAM = (params.get("e") || "sample").replace(/[^a-z0-9-]/gi, "");
  const PTS = [4, 3, 2, 1];
  const MAX_REC_MS = { read: 30000, explain: 40000 };
  let exam, lines, common, session, i = 0, points = 0, maxPoints = 0;
  const misses = {}, stopped = new Set();
  const voice = $("#voice");

  // ---------- sound ----------
  let playId = 0;
  function say(file) {
    const id = ++playId;
    return new Promise(done => {
      if (!file) { done(); return; }
      const end = () => { voice.onended = voice.onerror = null; talking(false); done(); };
      voice.onended = voice.onerror = () => { if (id === playId) end(); };
      try { voice.src = "audio/" + file; voice.currentTime = 0; talking(true); const p = voice.play(); if (p && p.catch) p.catch(end); }
      catch (e) { end(); }
    });
  }
  function hush() { playId++; try { voice.pause(); } catch (e) {} talking(false); }
  function talking(on) { document.querySelectorAll(".steve-head").forEach(h => h.classList.toggle("talking", on)); }
  const line = k => say(common[k]);
  const pick = (...ks) => ks[Math.floor(Math.random() * ks.length)];

  // ---------- drawing ----------
  const HEAD = '<span class="steve-head"><img src="../art/steve-head.webp" alt="" width="240" height="240"></span>';
  const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
  const MIC = '<svg class="go" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><svg class="stop" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';
  const SKIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l8 7-8 7M13 5l8 7-8 7"/></svg>';
  const SHAPES = {
    circle: '<circle cx="50" cy="50" r="40"/>',
    square: '<rect x="12" y="12" width="76" height="76" rx="4"/>',
    triangle: '<path d="M50 10L92 88H8z"/>',
    rectangle: '<rect x="6" y="26" width="88" height="48" rx="4"/>',
    star: '<path d="M50 6l12 30 32 2-25 20 9 32-28-18-28 18 9-32L6 38l32-2z"/>',
    heart: '<path d="M50 88S8 62 8 34a20 20 0 0 1 42-10 20 20 0 0 1 42 10c0 28-42 54-42 54z"/>',
    diamond: '<path d="M50 6l38 44-38 44-38-44z"/>',
    oval: '<ellipse cx="50" cy="50" rx="44" ry="30"/>',
  };
  const shape = (n, c) => `<svg class="shape" viewBox="0 0 100 100" aria-hidden="true" fill="${c || "#2f8fe6"}" stroke="#1d1647" stroke-width="4" stroke-linejoin="round">${SHAPES[n] || ""}</svg>`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function optHTML(o) {
    if (o.emoji) return `<span class="emo">${esc(o.emoji)}</span>`;
    if (o.shape) return shape(o.shape, o.color);
    if (o.dots != null) return `<span class="emo">${"⚫".repeat(o.dots) || "&nbsp;"}</span>`;
    return esc(o.text);
  }
  function showHTML(s) {
    if (!s) return "";
    if (s.emoji) return Array.from({ length: s.count || 1 }, () => `<span class="pic">${esc(s.emoji)}</span>`).join("");
    if (s.row) return s.row.map(x => `<span class="row-item">${esc(x)}</span>`).join("");
    if (s.shape) return shape(s.shape, s.color);
    if (s.text) return `<span class="readcard" style="font-size:44px">${esc(s.text)}</span>`;
    return "";
  }
  function dots() {
    $("#dots").innerHTML = exam.questions.map((q, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("");
  }

  // ---------- flow ----------
  async function load() {
    const get = u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
    [exam, lines, common] = await Promise.all([get(`exams/${EXAM}.json`), get(`exams/${EXAM}.audio.json`), get("audio/common.json")]);
    document.title = exam.title + " · Steve's Challenges";
    $("#title").textContent = exam.title;
    maxPoints = exam.questions.filter(q => q.type !== "read").length * 4;
    $("#stage").innerHTML = `<div class="big">
      <img class="steve-full" src="../art/steve.webp" alt="" width="483" height="706">
      <button class="go" id="start" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l14 8-14 8z"/></svg>Start!</button></div>`;
    $("#start").onclick = start;
  }
  async function start() {
    session = ChallengeStore.start(EXAM, exam.questions.length);
    if (params.get("at")) i = Math.max(0, Math.min(exam.questions.length - 1, +params.get("at") - 1)) || 0; // for testing: start at question N
    $("#stage").innerHTML = `<div class="big">${HEAD}<p class="points">Here we go!</p></div>`;
    await say(lines.intro);
    next();
  }
  function next() {
    hush();
    if (i >= exam.questions.length) return finish();
    const q = exam.questions[i];
    if (q.ladder && stopped.has(q.ladder)) { save(q, { skipped: true, stoppedEarly: true }); i++; return next(); }
    dots();
    ({ tap: tapQ, explain: tapQ, read: readQ }[q.type] || tapQ)(q);
  }
  function advance(q, firstTry) {
    if (q.ladder) {
      misses[q.ladder] = firstTry ? 0 : (misses[q.ladder] || 0) + 1;
      if (misses[q.ladder] >= 3) stopped.add(q.ladder);
    }
    i++; setTimeout(next, 350);
  }
  function save(q, extra) {
    ChallengeStore.answer(session, { qid: q.id, type: q.type, subject: q.subject, skill: q.skill, band: q.band, ladder: q.ladder || null, ...extra });
  }
  function header(q) {
    return `<div class="steve-row">${HEAD}<button class="hear" id="hear" type="button">${SPEAKER}Hear it again</button></div>`;
  }

  // Tap an answer (and maybe explain why)
  function tapQ(q) {
    let tries = 0, replays = 0, t0 = 0, armed = -1, busy = false; const wrong = [];
    $("#stage").innerHTML = header(q) + `<div class="show" id="show">${showHTML(q.show)}</div>
      <div class="opts" id="opts">${q.options.map((o, k) => `<button class="opt" type="button" data-k="${k}" aria-label="Answer ${k + 1}">${optHTML(o)}</button>`).join("")}</div>`;
    t0 = performance.now(); // time is counted from when the question appears
    const ask = () => say(lines[q.id]);
    $("#hear").onclick = () => { replays++; ask(); };
    ask();
    $("#opts").onclick = async e => {
      const b = e.target.closest(".opt"); if (!b || busy || b.classList.contains("wrong")) return;
      const k = +b.dataset.k;
      if (armed !== k) { // first tap: hear this answer
        document.querySelectorAll(".opt.armed").forEach(o => o.classList.remove("armed"));
        b.classList.add("armed"); armed = k; say(lines[`${q.id}.o${k}`]); return;
      }
      b.classList.remove("armed"); armed = -1; hush();
      if (k === q.answer) {
        busy = true; b.classList.add("right");
        points += PTS[tries]; save(q, { firstTry: tries === 0, tries: tries + 1, ms: Math.round(performance.now() - t0), replays, chosen: k, wrong });
        await line(pick("right0", "right1", "right2"));
        if (q.type === "explain") return explain(q, tries === 0);
        return advance(q, tries === 0);
      }
      tries++; b.classList.add("wrong", "shake"); setTimeout(() => b.classList.remove("shake"), 450);
      wrong.push(k);
      if (tries >= 3) {
        busy = true;
        document.querySelector(`.opt[data-k="${q.answer}"]`).classList.add("right");
        points += PTS[3]; save(q, { firstTry: false, tries: 4, ms: Math.round(performance.now() - t0), replays, revealed: true, wrong });
        await line("reveal"); return advance(q, false);
      }
      line("again");
    };
  }

  // Record Joshua's voice: read a word or sentence, or tell Steve why
  async function explain(q, firstTry) {
    $("#stage").innerHTML = header(q) + recorderHTML(false);
    $("#hear").onclick = () => say(lines[q.id + ".why"]);
    say(lines[q.id + ".why"]);
    recorder(q, "explain", null, async () => { await line("whydone"); advance(q, firstTry); });
  }
  function readQ(q) {
    const meta = { replays: 0 };
    $("#stage").innerHTML = header(q) + `<div class="readcard" id="readcard">${esc(q.text)}</div>` + recorderHTML(true);
    $("#hear").onclick = () => { meta.replays++; say(lines[q.id]); };
    say(lines[q.id]);
    recorder(q, "read", meta, async () => { await line(pick("readdone0", "readdone1")); advance(q, true); }, async () => {
      save(q, { skipped: true, replays: meta.replays }); await line("skipped"); advance(q, false);
    });
  }
  function recorderHTML(withSkip) {
    return `<div class="recrow"><button class="mic" id="mic" type="button" aria-label="Record">${MIC}</button>
      <span class="meter" aria-hidden="true"><i id="lvl"></i></span>
      ${withSkip ? `<button class="skip" id="skip" type="button" aria-label="Skip this one">${SKIP}</button>` : ""}</div>`;
  }
  function recorder(q, kind, meta, onDone, onSkip) {
    let stream = null, rec = null, chunks = [], t0 = 0, timer = null, raf = 0, actx = null, skipArmed = false;
    const mic = $("#mic"), skip = $("#skip");
    async function begin() {
      hush();
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { await line("nomic"); if (onSkip) onSkip(); else onDone(); return; }
      const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
      rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = finished;
      rec.start(); t0 = performance.now(); mic.classList.add("on"); mic.setAttribute("aria-label", "Stop");
      timer = setTimeout(end, MAX_REC_MS[kind]);
      meter();
    }
    function meter() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext; actx = new AC();
        const an = actx.createAnalyser(); an.fftSize = 512; actx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize), lvl = $("#lvl");
        const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); if (lvl) lvl.style.width = Math.min(100, m * 1.6) + "%"; raf = requestAnimationFrame(tick); };
        tick();
      } catch (e) {}
    }
    function end() { clearTimeout(timer); if (rec && rec.state !== "inactive") rec.stop(); }
    function finished() {
      cancelAnimationFrame(raf); try { actx && actx.close(); } catch (e) {}
      stream.getTracks().forEach(t => t.stop()); // give the speaker back to Steve at full volume
      const ms = Math.round(performance.now() - t0);
      const blob = new Blob(chunks, { type: (rec && rec.mimeType) || "audio/mp4" });
      ChallengeStore.recording(session, q.id, blob, { kind, ms, text: kind === "read" ? q.text : "" });
      if (kind === "read") save(q, { recorded: true, ms, ...(meta || {}) });
      mic.disabled = true; if (skip) skip.disabled = true;
      onDone();
    }
    mic.onclick = () => { if (rec && rec.state === "recording") end(); else if (!rec) begin(); };
    if (skip) skip.onclick = () => {
      if (rec) return;
      if (!skipArmed) { skipArmed = true; skip.classList.add("armed"); line("skip"); return; }
      skip.disabled = true; mic.disabled = true; onSkip();
    };
  }

  async function finish() {
    i = exam.questions.length; dots();
    ChallengeStore.finish(session, EXAM, points, maxPoints);
    $("#stage").innerHTML = `<div class="big">
      <svg class="trophy" viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffc531" stroke="#8a5a00" stroke-width=".6" d="M6 3h12v3h3v2a5 5 0 0 1-4.6 5A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 7.6 13 5 5 0 0 1 3 8V6h3zm0 5V8H5a3 3 0 0 0 1.4 2.5A7 7 0 0 1 6 8zm12 0a7 7 0 0 1-.4 2.5A3 3 0 0 0 19 8z"/></svg>
      <p class="points">${points} points!</p>
      <a class="go" href="index.html"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l14 8-14 8z"/></svg>All done</a></div>`;
    await say(lines.outro);
  }

  // iPad Safari plays sound only after a tap; the Start button is that tap.
  load().catch(e => { $("#stage").innerHTML = `<div class="big"><p class="points">Oops! This challenge didn't load.</p></div>`; console.error(e); });
  window.ChallengeDebug = { get state() { return { i, points, maxPoints, misses, stopped: [...stopped], session }; } };
})();
