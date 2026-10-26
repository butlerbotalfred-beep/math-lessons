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
    opened() { const r = read(); r.opened = true; write(r); }
  };
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
