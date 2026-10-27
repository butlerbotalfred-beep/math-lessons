// Shared by every lesson page in the app: home bar, iPad audio unlock, and saving results for the home page.
(function () {
  const page = (location.pathname.match(/\/(p\d+)\//) || [])[1] || "lesson";
  const KEY = "mathapp:" + page;
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function write(r) { r.updated = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) {} }
  window.LessonApp = {
    // called when the video ends
    quiz(points, max, firsts) {
      const r = read();
      r.max = max; r.last = points; r.plays = (r.plays || 0) + 1;
      if (!(r.best >= points)) { r.best = points; r.bestFirsts = firsts; }
      write(r);
    },
    // called whenever the on-screen worksheet is checked
    sheet(right, total) {
      const r = read();
      r.sheetTotal = total; r.sheetRight = right;
      if (!(r.sheetBest >= right)) r.sheetBest = right;
      if (right === total) r.sheetDone = true;
      write(r);
    },
    opened() { const r = read(); r.opened = true; write(r); },
    // Answers are read out one at a time: the first tap on an answer reads it and highlights it,
    // a second tap on the same answer chooses it. Call after the .opt buttons for question qid are in place.
    confirmChoices(card, qid) {
      if (!card || card.dataset.confirm) return;
      card.dataset.confirm = qid;
      card.addEventListener("click", e => {
        const b = e.target.closest(".opt");
        if (!b || !card.contains(b) || b.disabled || b.classList.contains("right") || b.classList.contains("wrong")) return;
        if (b.classList.contains("armed")) { b.classList.remove("armed"); return; } // second tap: let the lesson score it
        e.stopImmediatePropagation(); e.preventDefault();
        card.querySelectorAll(".opt.armed").forEach(o => o.classList.remove("armed"));
        b.classList.add("armed");
        const i = [...card.querySelectorAll(".opt")].indexOf(b);
        play("audio/" + qid + "-o" + i + ".mp3");
      }, true);
    }
  };
  function play(src) {
    const a = document.getElementById("voice"); if (!a) return;
    try { a.src = src; a.currentTime = 0; a.play().catch(() => {}); } catch (e) {}
  }
  // The lesson pages draw each question into #quiz; hook every new question card up as it appears.
  function watchQuiz() {
    const quiz = document.getElementById("quiz"); if (!quiz) return;
    new MutationObserver(() => {
      const card = quiz.querySelector(".card"); if (!card || !card.querySelector(".opt")) return;
      let qid = null;
      try { qid = QUIZ.questions[active].id; } catch (e) {}
      if (qid) LessonApp.confirmChoices(card, qid);
    }).observe(quiz, { childList: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchQuiz); else watchQuiz();
  LessonApp.opened();

  // Home bar at the top of each lesson
  function bar() {
    const b = document.createElement("nav"); b.className = "appbar";
    b.innerHTML = '<a class="apphome" href="../index.html"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>All lessons</a>';
    document.body.insertBefore(b, document.body.firstChild);
  }
  if (document.body) bar(); else document.addEventListener("DOMContentLoaded", bar);

  // iPad Safari only lets an audio element play after a tap has started it once.
  // On the first tap, start the question voice silently so later questions can be read aloud.
  let unlocked = false;
  function unlock() {
    if (unlocked) return; unlocked = true;
    const a = document.getElementById("voice"); if (!a) return;
    if (a.src && !a.paused) return;
    const had = a.getAttribute("src");
    if (!had) a.src = "audio/right1.mp3";
    a.muted = true;
    const p = a.play();
    const done = () => { if (!had) { a.pause(); a.currentTime = 0; } a.muted = false; };
    if (p && p.then) p.then(done, done); else done();
  }
  addEventListener("pointerdown", unlock, { capture: true, once: false });
  addEventListener("touchend", unlock, { capture: true });
})();
