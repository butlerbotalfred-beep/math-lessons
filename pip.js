// Ask Pip: Joshua taps the owl, says his question, and Pip answers out loud.
// Speech-to-text is Safari's built-in recognizer; answers come from Claude through the ask-pip function.
(function () {
  const ENDPOINT = "https://rtqyrglnwbjqlxslrvpb.supabase.co/functions/v1/ask-pip";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0cXlyZ2xud2JqcWx4c2xydnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNTcwNjIsImV4cCI6MjEwODYzMzA2Mn0.i7x1phVinvMaMGrLxsO0nynh38N8D5tPoTixeiRCpJ8";
  const page = (location.pathname.match(/\/(p\d+)\//) || [])[1] || "home";
  const HKEY = "pip-history:" + page;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const OWL = `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="38" rx="22" ry="22" fill="#8b5a2b"/><path d="M12 18 L20 26 L14 30Z M52 18 L44 26 L50 30Z" fill="#8b5a2b"/>
    <ellipse cx="32" cy="44" rx="13" ry="13" fill="#f3d7a8"/><circle cx="23" cy="31" r="9" fill="#fff"/><circle cx="41" cy="31" r="9" fill="#fff"/>
    <circle cx="24" cy="32" r="4.5" fill="#1e1b4b"/><circle cx="40" cy="32" r="4.5" fill="#1e1b4b"/><circle cx="25.5" cy="30.5" r="1.4" fill="#fff"/><circle cx="41.5" cy="30.5" r="1.4" fill="#fff"/>
    <path d="M29 38 L35 38 L32 43Z" fill="#f59e0b"/></svg>`;
  const MIC = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  let fab, panel, statusEl, heardEl, answerEl, talkBtn, againBtn, lastAnswer = "", rec = null, busy = false;

  function build() {
    fab = el("button", "pip-fab", OWL + "<span>Ask Pip</span>");
    fab.type = "button"; fab.id = "pip-open"; fab.setAttribute("aria-label", "Ask Pip a question by talking");
    panel = el("div", "pip-panel"); panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Ask Pip");
    panel.innerHTML = `<div class="pip-card">
      <div class="pip-top"><span class="pip-owl">${OWL}</span><p class="pip-status" id="pip-status" aria-live="polite"></p>
        <button class="pip-x" id="pip-close" type="button" aria-label="Close">✕</button></div>
      <p class="pip-heard" id="pip-heard" hidden></p>
      <p class="pip-answer" id="pip-answer" hidden></p>
      <div class="pip-btns">
        <button class="pip-talk" id="pip-talk" type="button">${MIC}<span>Talk to Pip</span></button>
        <button class="pip-again" id="pip-again" type="button" hidden>Hear it again</button>
      </div></div>`;
    document.body.appendChild(fab); document.body.appendChild(panel);
    statusEl = panel.querySelector("#pip-status"); heardEl = panel.querySelector("#pip-heard"); answerEl = panel.querySelector("#pip-answer");
    talkBtn = panel.querySelector("#pip-talk"); againBtn = panel.querySelector("#pip-again");
    fab.onclick = () => { open(); listen(); };
    talkBtn.onclick = () => { if (rec) { rec.stop(); return; } listen(); };
    againBtn.onclick = () => speak(lastAnswer);
    panel.querySelector("#pip-close").onclick = close;
    panel.addEventListener("click", e => { if (e.target === panel) close(); });
  }
  function open() {
    const v = document.getElementById("v"); if (v && !v.paused) v.pause();
    panel.hidden = false; fab.hidden = true;
  }
  function close() {
    if (rec) { try { rec.abort(); } catch (e) {} rec = null; }
    try { speechSynthesis.cancel(); } catch (e) {}
    panel.hidden = true; fab.hidden = false;
  }
  function status(t) { statusEl.textContent = t; }

  // ---- Pip's voice ----
  function pipVoice() {
    try {
      const vs = speechSynthesis.getVoices().filter(v => /^en[-_]US/i.test(v.lang));
      return vs.find(v => /Samantha|Ava|Allison|Google US English/i.test(v.name)) || vs[0] || null;
    } catch (e) { return null; }
  }
  function speak(text, onend) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pipVoice(); if (v) u.voice = v;
      u.lang = "en-US"; u.rate = 0.9; u.pitch = 1.3;
      if (onend) u.onend = onend;
      speechSynthesis.speak(u);
    } catch (e) { if (onend) onend(); }
  }
  // iPad only lets a page speak after a tap has started speech once; do it silently on that tap.
  let voiceReady = false;
  function wakeVoice() {
    if (voiceReady) return; voiceReady = true;
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
  }

  // ---- listening ----
  function listen() {
    wakeVoice();
    if (busy) return;
    if (!SR) {
      status("Pip can only hear you in Safari. Ask a grown-up to open this page in Safari.");
      talkBtn.hidden = true; return;
    }
    try { speechSynthesis.cancel(); } catch (e) {}
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
      rec = null; talkBtn.classList.remove("on"); talkBtn.querySelector("span").textContent = "Talk to Pip";
      if (failed === "not-allowed" || failed === "service-not-allowed") {
        status("Pip needs the microphone. Grown-ups: tap the aA button in Safari's address bar, then Website Settings, and set Microphone to Allow.");
        return;
      }
      if (failed === "audio-capture") { status("Pip can't find the microphone on this iPad."); return; }
      if (!heard) { status("Pip didn't hear anything. Tap Talk to Pip and try again!"); speak("Hoo! I didn't hear you. Tap the button and try again!"); return; }
      ask(heard);
    };
    try { rec.start(); } catch (e) { rec = null; status("Pip can't listen right now. Try again in a moment."); }
  }

  // ---- asking ----
  function history() { try { return JSON.parse(sessionStorage.getItem(HKEY) || "[]"); } catch (e) { return []; } }
  function remember(q, a) {
    const h = history().concat([{ role: "user", text: q }, { role: "assistant", text: a }]).slice(-6);
    try { sessionStorage.setItem(HKEY, JSON.stringify(h)); } catch (e) {}
  }
  async function ask(q) {
    busy = true; talkBtn.disabled = true;
    status("Pip is thinking…");
    speak("Hmm, let me think!");
    let answer = null, err = null;
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ANON, "apikey": ANON },
        body: JSON.stringify({ page, question: q, history: history() }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.answer) answer = data.answer; else err = data.error || r.status;
    } catch (e) { err = "offline"; }
    busy = false; talkBtn.disabled = false;
    if (!answer) {
      const msg = err === "rate_limited" ? "Pip needs a little rest. Let's try again in a minute!"
        : err === "offline" ? "Pip can't reach the internet right now. Let's try again soon!"
        : "Hoo! Pip got mixed up. Let's try again!";
      status(msg); speak(msg);
      if (err === "no_key") status("Pip isn't set up yet. Grown-ups: the Claude key still needs to be added in Supabase.");
      return;
    }
    remember(q, answer);
    lastAnswer = answer;
    status("Pip says:");
    answerEl.textContent = answer; answerEl.hidden = false; againBtn.hidden = false;
    speak(answer);
  }

  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
  try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch (e) {}
})();
