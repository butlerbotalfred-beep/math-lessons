// Walkable lesson world. The lesson's video is cut into one short clip per question, using the QUIZ cue times in the
// lesson's own index.html, so a re-rendered video and its updated QUIZ need no change here. Each clip grows out of a
// signpost, shrinks back into it after a right answer, and the sign pops out coins (4, 3, 2 or 1 by try) onto the path.
// Joshua holds the Walk button and Steve walks to the next sign, picking up the coins on the way. The world itself is
// 3D (view3d.js). The last stop is the worksheet: one coin per right box.
(function () {
  const CFG = window.WORLD;
  const KEY = "mathapp:" + CFG.id + ":world";
  const VIEW = new URL("view3d.js", document.currentScript.src).href;
  // Our own audio element for spoken lines: app.js briefly plays and pauses #voice on the first tap to unlock it on
  // the iPad, which would cut off a line started by that same tap.
  const voice = new Audio(); voice.preload = "auto";
  let spoke = false;
  const COLORS = { red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#facc15", purple: "#a855f7", orange: "#f97316" };
  const COIN = '<i></i>';
  let QUIZ, Q, N, st, busy = false, seg = null;
  let world, view, walkbtn, purse, screen, v, quiz, bigplay, pausebtn;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  // `then` runs when the line ends, or right away if it can't play; never for a line cut off by the next one.
  let sayTok = 0;
  function say(src, then) {
    spoke = true;
    const tok = ++sayTok, fin = () => { if (tok === sayTok && then) { sayTok++; then(); } };
    try { voice.onended = fin; voice.onerror = fin; voice.src = src; voice.currentTime = 0; voice.play().catch(fin); } catch (e) { fin(); }
  }
  const line = (name, then) => say("../world/voice/" + name + ".mp3", then);
  const own = (name, then) => say("audio/" + name + ".mp3", then);

  // ---- sound effects (Web Audio, so they can play over the voice) ----
  let ac = null;
  function actx() {
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); }
    if (ac.state === "suspended") ac.resume().catch(() => {});
    return ac;
  }
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}  // play even with the iPad muted
  ["pointerdown", "touchend", "click"].forEach(ev => addEventListener(ev, actx, { capture: true }));
  function tone(f, t0, dur, type, vol) {
    const a = actx(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
    o.type = type || "square"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const sfx = {
    coin() { tone(988, 0, 0.09, "square", 0.08); tone(1319, 0.08, 0.45, "square", 0.08); },
    chime() { tone(1047, 0, 0.6, "sine", 0.22); tone(1319, 0.1, 0.6, "sine", 0.22); tone(1568, 0.2, 0.8, "sine", 0.22); },
    buzz() { tone(150, 0, 0.3, "triangle", 0.3); tone(130, 0.14, 0.3, "triangle", 0.25); },
    bump() { tone(196, 0, 0.12, "square", 0.08); tone(294, 0.05, 0.14, "square", 0.06); },
    grow() { for (let k = 0; k < 6; k++) tone(420 + k * 130, k * 0.045, 0.14, "sine", 0.07); },
    shrink() { for (let k = 0; k < 6; k++) tone(1100 - k * 130, k * 0.045, 0.14, "sine", 0.07); },
  };

  // ---- saved progress ----
  function blank() { return { at: 0, pos: 0, pts: Q.map(() => 0), tries: Q.map(() => 0), coins: 0, pending: 0, sheet: {} }; }
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    if (!s || !Array.isArray(s.pts) || s.pts.length !== N) s = blank();
    s.coins += s.pending || 0; s.pending = 0;            // coins left on the ground when the page closed count anyway
    while (s.at < N && s.pts[s.at] > 0) s.at++;
    s.pos = Math.min(s.pos, s.at);
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  // ---- layout ----
  function sizeScreen() {
    // between the All lessons bar and the Ask Steve button, so neither is covered
    const w = Math.min(innerWidth - 32, (innerHeight - 200) * 16 / 9);
    screen.style.setProperty("--sw", w + "px");
  }

  function build() {
    world = document.getElementById("world");
    view.place(st.pos);
    walkbtn = el("button", "walkbtn"); walkbtn.type = "button"; walkbtn.setAttribute("aria-label", "Walk");
    walkbtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 8h-4.5v8h-5v-8H5z"/></svg>';
    const hold = on => e => { e.preventDefault(); if (on && (busy || st.pos === st.at)) return; view.hold(on); walkbtn.classList.toggle("down", on); };
    walkbtn.addEventListener("pointerdown", hold(true));
    ["pointerup", "pointercancel", "pointerleave"].forEach(ev => walkbtn.addEventListener(ev, hold(false)));
    walkbtn.addEventListener("contextmenu", e => e.preventDefault());
    addEventListener("keydown", e => { if ((e.key === "ArrowUp" || e.key === " ") && !e.repeat && !busy && st.pos !== st.at) { view.hold(true); e.preventDefault(); } });
    addEventListener("keyup", e => { if (e.key === "ArrowUp" || e.key === " ") view.hold(false); });
    document.body.appendChild(walkbtn);

    purse = el("div", "purse"); purse.setAttribute("aria-live", "polite");
    purse.innerHTML = '<span class="coin" aria-hidden="true"></span><b>0</b>';
    document.body.appendChild(purse);

    screen = el("div", "screen"); screen.hidden = true;
    const stage = el("div", "stage");
    v = el("video"); v.id = "v"; v.src = CFG.video || "lesson.mp4"; v.setAttribute("playsinline", ""); v.preload = "auto"; v.disablePictureInPicture = true;
    quiz = el("div", "quiz"); quiz.hidden = true;
    bigplay = el("button", "bigplay"); bigplay.type = "button"; bigplay.hidden = true; bigplay.setAttribute("aria-label", "Play");
    pausebtn = el("button", "pausebtn"); pausebtn.type = "button"; pausebtn.setAttribute("aria-label", "Pause");
    bigplay.onclick = () => { bigplay.hidden = true; v.play().catch(() => { bigplay.hidden = false; }); };
    pausebtn.onclick = () => { if (v.paused) bigplay.onclick(); else v.pause(); };
    v.addEventListener("pause", () => pausebtn.classList.add("paused"));
    v.addEventListener("play", () => { pausebtn.classList.remove("paused"); if (!quiz.hidden) v.pause(); });
    stage.appendChild(v); stage.appendChild(quiz); stage.appendChild(bigplay); stage.appendChild(pausebtn);
    screen.appendChild(stage);
    document.body.appendChild(screen);
    sizeScreen();
    addEventListener("resize", () => { sizeScreen(); view.resize(); });
  }

  function renderPurse(ping) {
    purse.querySelector("b").textContent = st.coins;
    if (ping) { purse.classList.remove("ping"); void purse.offsetWidth; purse.classList.add("ping"); }
  }
  function renderSigns() {
    view.setSigns(st, busy);
    if (st.at > st.pos) view.setTarget(st.at);
    walkbtn.hidden = busy || st.at === st.pos;
  }

  // ---- moving between signs ----
  // Tapping the sign ahead walks there too; arriving opens its clip (or the worksheet).
  function tapSign(i) {
    if (busy || i !== st.at) return;
    if (st.pos !== i) view.walk();
    else if (i < N) openClip(i);
    else openSheet();
  }
  function arrive(i) {
    st.pos = i; save(); walkbtn.classList.remove("down");
    if (i < N) openClip(i); else openSheet();
  }

  // ---- clip screen: grows out of a sign, shrinks back into it ----
  function fromSign(i, scale) {
    const sr = view.signRect(i), fr = screen.getBoundingClientRect();
    const s = scale == null ? sr.width / fr.width : scale;
    const dx = sr.left + sr.width / 2 - (fr.left + fr.width * s / 2), dy = sr.top + sr.height / 2 - (fr.top + fr.height * s / 2);
    return `translate(${dx}px, ${dy}px) scale(${s})`;
  }
  function seek(t) {
    if (v.readyState >= 1) v.currentTime = t;
    else v.addEventListener("loadedmetadata", () => { v.currentTime = t; }, { once: true });
  }
  // End of the narrator's answer after a question's pause ("Red! You got it..."), so it plays before the clip shrinks
  // instead of opening the next clip. Only questions that replace a pause in the video have one.
  const reveal = i => Q[i].reveal || null;
  const after = i => reveal(i) || Q[i].resume;
  function openClip(i, outro) {
    busy = true; renderSigns();
    const from = outro ? after(N - 1) : i === 0 ? 0 : after(i - 1);
    const to = outro ? QUIZ.total : Q[i].t;
    seg = { i, from, to, q: outro ? null : i, after: outro ? () => closeClip(N).then(showSheet) : null };
    quiz.hidden = true; bigplay.hidden = true;
    seek(from);
    screen.hidden = false;
    screen.animate([{ transform: fromSign(i), opacity: 0.4 }, { transform: "none", opacity: 1 }], { duration: 560, easing: "cubic-bezier(.2,.8,.2,1)" });
    sfx.grow();
    v.play().catch(() => { bigplay.hidden = false; });
    setTimeout(() => { if (!screen.hidden) view.pause(true); }, 700);   // the world doesn't need drawing behind the clip
  }
  function closeClip(i) {
    return new Promise(res => {
      voice.pause(); v.pause(); sfx.shrink(); view.pause(false);
      const a = screen.animate([{ transform: "none", opacity: 1 }, { transform: fromSign(i, 0.02), opacity: 0.2 }], { duration: 620, easing: "cubic-bezier(.6,0,.9,.5)", fill: "forwards" });
      a.onfinish = () => { screen.hidden = true; a.cancel(); quiz.hidden = true; res(); };
    });
  }
  function tick() {
    if (seg && !v.paused && v.currentTime >= seg.to - 0.05) segEnd();
    requestAnimationFrame(tick);
  }
  function segEnd() {
    if (!seg) return;
    const s = seg; v.pause();
    if (s.q != null) { if (quiz.hidden) { seek(s.to); showQuestion(s.q); } return; }
    seg = null;
    s.after();
  }

  // ---- question card (same parts and scoring as the lesson page) ----
  function swatch(name) { const s = el("span", "swatch"); s.style.background = COLORS[name.toLowerCase()] || name; return s; }
  function showQuestion(i) {
    const q = Q[i];
    quiz.textContent = "";
    const card = el("div", "card"); card.setAttribute("role", "dialog"); card.setAttribute("aria-label", `Question ${i + 1}`);
    const head = el("div", "qhead"); head.appendChild(el("span", "", `Question ${i + 1} of ${N}`));
    const worth = el("span", "worth"); head.appendChild(worth); card.appendChild(head);
    if (q.visual && q.visual.length) {
      const vis = el("div", "visual");
      q.visual.forEach(x => vis.appendChild(x.startsWith("c:") ? swatch(x.slice(2)) : el("span", "vchip" + (x === "?" ? " q" : ""), x)));
      card.appendChild(vis);
    }
    card.appendChild(el("h2", "prompt", q.prompt));
    const opts = el("div", "opts"), fb = el("p", "feedback"); fb.setAttribute("aria-live", "assertive");
    const updateWorth = () => { const n = st.pts[i] || Math.max(1, 4 - st.tries[i]); worth.innerHTML = COIN.repeat(n); worth.setAttribute("aria-label", `${n} coins`); };
    q.choices.forEach((c, k) => {
      const b = el("button", "opt"); b.type = "button";
      if (c.startsWith("c:")) b.appendChild(swatch(c.slice(2)));
      b.appendChild(el("span", "", c.startsWith("c:") ? c.slice(2) : c));
      b.onclick = () => {
        if (st.pts[i] || b.disabled) return;
        st.tries[i]++;
        if (k === q.answer) {
          const pts = Math.max(1, 5 - st.tries[i]);
          st.pts[i] = pts; st.pending = pts; st.at = i + 1; save();
          b.classList.add("right"); [...opts.children].forEach(o => o.disabled = true);
          fb.className = "feedback good"; fb.textContent = pts === 4 ? "Right on the first try!" : "That's it!";
          updateWorth(); sfx.chime(); own("right" + (1 + (i % 4)));
          if (i === N - 1) { try { LessonApp.quiz(st.pts.reduce((a, b) => a + b, 0), N * 4, st.pts.filter(p => p === 4).length); } catch (e) {} }
          const r = reveal(i);
          setTimeout(() => {
            if (!r) return finishStop(i, pts);
            quiz.hidden = true; seg = { i, from: Q[i].resume, to: r, q: null, after: () => finishStop(i, pts) };
            seek(Q[i].resume); v.play().catch(() => { bigplay.hidden = false; });
          }, 1700);
        } else {
          b.classList.add("wrong", "shake"); b.disabled = true;
          fb.className = "feedback bad"; fb.textContent = "Not quite. Try again!";
          sfx.buzz(); own(st.tries[i] % 2 ? "wrong1" : "wrong2"); save(); updateWorth();
        }
      };
      opts.appendChild(b);
    });
    card.appendChild(opts); card.appendChild(fb);
    const foot = el("div", "qfoot");
    const again = el("button", "btn", "Hear it again"); again.type = "button"; again.onclick = () => own(q.id);
    foot.appendChild(again); card.appendChild(foot);
    quiz.appendChild(card); quiz.hidden = false;
    // First tap on an answer reads it aloud (app.js, through #voice), second tap picks it; stop our question voice first.
    card.addEventListener("click", () => voice.pause(), true);
    try { if (window.LessonApp && LessonApp.confirmChoices) LessonApp.confirmChoices(card, q.id); } catch (e) {}
    updateWorth(); own(q.id);
  }

  // ---- coins ----
  // Coins pop out of the sign and land on the path ahead; Steve picks them up as he walks to the next sign.
  async function finishStop(i, pts) {
    seg = null;
    await closeClip(i);
    renderSigns();
    const drops = [];
    for (let k = 0; k < pts; k++) { view.bump(i); sfx.coin(); drops.push(view.dropCoin(i, k, pts)); await wait(380); }
    await Promise.all(drops);
    busy = false; renderSigns();
    line(i + 1 === N ? "coins-sheet" : "coins-walk");
  }
  // a coin flies from a screen point (or an element) to the coin counter
  function collect(c, then) {
    let x = c.x, y = c.y;
    if (c instanceof Element) { const r = c.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; c.remove(); }
    const p = purse.querySelector(".coin").getBoundingClientRect();
    const f = el("span", "coin fly"); f.style.left = x + "px"; f.style.top = y + "px";
    document.body.appendChild(f); sfx.coin();
    const dx = p.left + p.width / 2 - x, dy = p.top + p.height / 2 - y;
    const a = f.animate([{ transform: "none" }, { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 80}px) scale(1.2)`, offset: 0.4 }, { transform: `translate(${dx}px, ${dy}px) scale(.55)` }], { duration: 650, easing: "ease-in" });
    a.onfinish = () => {
      f.remove(); st.coins++; if (st.pending > 0) st.pending--; save(); renderPurse(true);
      if (then) then();
    };
  }
  // ---- worksheet ----
  // The app picks each box in order (top, bottom, answer; left to right; row by row). One tap on a number answers.
  // Three tries: wrong numbers go red, the right one green. After three misses the answer goes in (green with a
  // red border) and a narrated explanation (pNN/audio/ws-x-<box id>.mp3) says how to get it.
  let sheetEl, boxes = [], sel = null, lock = false;
  function boxList() {
    const out = [];
    CFG.sheet.printed.forEach((row, r) => row.forEach((pr, c) => {
      const f = CFG.sheet.facts[r][c];
      if (pr[0] == null) out.push({ id: `${r}-${c}-t`, r, c, part: "t", ans: f[0], say: () => line("ws-nextfact-top") });
      if (pr[1] == null) out.push({ id: `${r}-${c}-b`, r, c, part: "b", ans: f[1], say: () => pr[0] == null ? line("ws-nextfact-bot") : own(`ws-m${pr[0]}`) });
      out.push({ id: `${r}-${c}-a`, r, c, part: "a", ans: f[0] + f[1], say: () => pr[0] != null && pr[1] != null ? own(`ws-p${pr[0]}-${pr[1]}`) : line("ws-addthem") });
    }));
    return out;
  }
  const bs = id => { const s = st.sheet[id] || (st.sheet[id] = { tries: 0, ok: false, shown: false, last: null }); s.wrong = s.wrong || []; return s; };
  const finished = b => bs(b.id).ok || bs(b.id).shown;

  function openSheet() {
    const last = Q[N - 1];
    if (QUIZ.total - last.resume > 1.5 && !st.sawOutro) { st.sawOutro = true; save(); openClip(N, true); return; }
    showSheet();
  }
  function showSheet() {
    busy = true; renderSigns();
    if (!sheetEl) buildSheet();
    renderSheet();
    sheetEl.hidden = false;
    sheetEl.querySelector(".paper").animate([{ transform: "scale(.2)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 480, easing: "cubic-bezier(.2,.8,.2,1)" });
    sfx.grow();
    if (boxes.every(finished)) { showDone(false); return; }
    lock = false; sel = boxes.find(b => !finished(b)); renderSheet();
    line("ws-intro", () => { if (sel) selectBox(sel); });
  }
  function buildSheet() {
    boxes = boxList();
    sheetEl = el("div", "sheetwrap"); sheetEl.hidden = true;
    const paper = el("div", "paper");
    const head = el("header");
    head.appendChild(el("h2", "", `${CFG.sheet.title} (page ${CFG.page})`));
    const hear = el("button", "hear"); hear.type = "button";
    hear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12"/></svg>Hear it';
    hear.onclick = () => { if (sel && !lock) sel.say(); else if (!sel) line("ws-intro"); };
    const back = el("button", "hear back"); back.type = "button"; back.setAttribute("aria-label", "Back to the path");
    back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Path';
    back.onclick = closeSheet;
    head.appendChild(hear); head.appendChild(back); paper.appendChild(head);
    const rows = el("div", "rows");
    CFG.sheet.printed.forEach((row, r) => {
      const rowEl = el("div", "row");
      row.forEach((pr, c) => {
        const f = el("div", "fact");
        const cell = (part, val) => {
          if (val != null) return el("span", "n", val);
          const bx = boxes.find(b => b.id === `${r}-${c}-${part}`);
          const btn = el("button", "box"); btn.type = "button"; btn.setAttribute("aria-label", "Answer box");
          // boxes aren't picked by tapping: the current one repeats its question, a revealed one its explanation
          btn.onclick = () => { if (lock) return; if (bx === sel) bx.say(); else if (bs(bx.id).shown) explain(bx); };
          bx.el = btn; return btn;
        };
        f.appendChild(cell("t", pr[0]));
        f.appendChild(el("span", "plus", "+"));
        f.appendChild(cell("b", pr[1]));
        f.appendChild(el("span", "bar"));
        f.appendChild(cell("a", null));
        rowEl.appendChild(f);
      });
      rows.appendChild(rowEl);
    });
    paper.appendChild(rows);
    const pad = el("div", "pad");
    for (let n = 0; n <= 10; n++) {
      const k = el("button", "key", n); k.type = "button"; k.dataset.n = n;
      k.onclick = () => tapKey(n, k);
      pad.appendChild(k);
    }
    paper.appendChild(pad);
    const done = el("div", "donebox"); done.hidden = true; paper.appendChild(done);
    sheetEl.appendChild(paper);
    document.body.appendChild(sheetEl);
  }
  function renderSheet() {
    boxes.forEach(b => {
      const s = bs(b.id), e = b.el;
      e.className = "box" + (s.ok ? " good" : s.shown ? " shown" : s.last != null ? " bad" : "") + (sel === b ? " sel" : "");
      e.textContent = s.ok || s.shown ? b.ans : s.last != null ? s.last : "";
    });
    const tried = sel ? bs(sel.id).wrong : [];
    sheetEl.querySelectorAll(".key").forEach(k => {
      const n = +k.dataset.n;
      k.classList.toggle("bad", tried.includes(n));
      k.disabled = !sel || lock || tried.includes(n);
    });
  }
  function selectBox(b) {
    if (!b) return;
    sel = b; renderSheet();
    b.el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    b.say();
  }
  const explain = (b, then) => own("ws-x-" + b.id, then);
  function tapKey(n, key) {
    if (!sel || lock || finished(sel)) return;
    const b = sel, s = bs(b.id);
    if (s.wrong.includes(n)) return;
    s.tries++;
    b.el.classList.remove("shake"); void b.el.offsetWidth;
    if (n === b.ans) {
      s.ok = true; s.last = null; save(); lock = true; renderSheet();
      key.classList.add("good");
      sfx.chime(); flyCoin(b.el); reportSheet();
      line("ws-right" + (1 + boxes.filter(x => bs(x.id).ok).length % 3), () => { key.classList.remove("good"); nextBox(); });
    } else {
      s.wrong.push(n); s.last = n;
      sfx.buzz();
      if (s.tries >= 3) {
        s.shown = true; s.last = null; save(); lock = true; renderSheet(); reportSheet();
        b.el.classList.add("shake");
        setTimeout(() => { if (lock && !sheetEl.hidden) explain(b, nextBox); }, 700);
      } else {
        save(); renderSheet(); b.el.classList.add("shake"); line(s.tries === 1 ? "ws-wrong1" : "ws-wrong2");
      }
    }
  }
  function closeSheet() { voice.pause(); sayTok++; sel = null; lock = false; sheetEl.hidden = true; busy = false; renderSigns(); }
  function nextBox() {
    if (sheetEl.hidden) return;
    lock = false;
    const next = boxes.find(b => !finished(b));
    if (next) selectBox(next); else { sel = null; renderSheet(); showDone(true); }
  }
  function flyCoin(fromEl) {
    const c = el("span", "coin"); const r = fromEl.getBoundingClientRect();
    c.style.position = "fixed"; c.style.left = r.left + r.width / 2 + "px"; c.style.top = r.top + "px"; c.style.zIndex = 60;
    document.body.appendChild(c);
    const a = c.animate([{ transform: "translateY(20px) scale(.3)", opacity: 0 }, { transform: "translateY(-50px) scale(1)", opacity: 1 }], { duration: 320, easing: "ease-out", fill: "forwards" });
    a.onfinish = () => { a.cancel(); c.style.transform = "translateY(-50px)"; c.className = "coin"; collect(c); };
  }
  function reportSheet() {
    try { LessonApp.sheet(boxes.filter(b => bs(b.id).ok).length, boxes.length); } catch (e) {}
  }
  function showDone(fresh) {
    const d = sheetEl.querySelector(".donebox"); d.textContent = "";
    const big = el("div", "big"); big.innerHTML = '<span class="coin" aria-hidden="true"></span>';
    big.appendChild(el("span", "", st.coins));
    d.appendChild(big);
    const right = boxes.filter(b => bs(b.id).ok).length;
    d.appendChild(el("p", "", `${right} of ${boxes.length} boxes right`));
    const home = el("a", "btn primary", "All lessons"); home.href = "../index.html";
    const back = el("button", "btn", "Back to the path"); back.type = "button";
    back.onclick = closeSheet;
    const row = el("div", "qfoot"); row.style.gap = "12px"; row.appendChild(back); row.appendChild(home); d.appendChild(row);
    sheetEl.querySelector(".pad").hidden = true;
    d.hidden = false; d.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (fresh) { sfx.chime(); line("ws-done"); }
  }

  // ---- start ----
  function quizFrom(html) {
    const ln = html.split("\n").find(l => l.startsWith("const QUIZ = "));
    return JSON.parse(ln.slice("const QUIZ = ".length).trim().replace(/;$/, ""));
  }
  fetch(CFG.lesson || "index.html").then(r => r.text()).then(async html => {
    QUIZ = quizFrom(html); Q = QUIZ.questions; N = Q.length;
    st = load(); save();
    const { createView } = await import(VIEW);
    view = createView({ container: document.getElementById("world"), N, onTap: tapSign, onArrive: arrive, onPick: p => collect(p) });
    build(); renderPurse(); renderSigns();
    requestAnimationFrame(tick);
    v.addEventListener("ended", segEnd);
    // First tap on the page: greet (a tap is needed before the iPad plays sound). Runs after the tapped button's own
    // handler, so a tap that opens a clip or the worksheet isn't talked over. If that tap already said something,
    // the voice is unlocked; otherwise a silent play unlocks it for lines said later without a tap.
    const greet = () => {
      removeEventListener("click", greet);
      if (!busy) { line(st.at === 0 && st.pos === 0 ? "start" : st.pos !== st.at ? "hold-walk" : st.at === N ? "tosheet" : "arrive"); return; }
      if (!spoke) { voice.muted = true; voice.src = "../world/voice/arrive.mp3"; const p = voice.play(), done = () => { if (!spoke) voice.pause(); voice.muted = false; }; if (p && p.then) p.then(done, done); else done(); }
    };
    addEventListener("click", greet);
    window.WorldDebug = { st: () => st, segEnd, finishStop, openSheet, view: () => view };
  });
})();
