// Grown-ups page for Steve's Challenges: results by subject, reading recordings to mark, each challenge's answers,
// and the paper writing task card. Talks to the "challenges" function with the grown-ups code.
(function () {
  const $ = s => document.querySelector(s);
  const KEY = "challenges:code";
  let code = sessionStorage.getItem(KEY) || "", data = null, titles = {};
  const LEVELS = ["", "Not yet", "Emerging", "Secure"];
  const MARKS = [null, "ok", "sound", "guess", "skip"];
  const SUBJECTS = { math: "Math", phonics: "Letters and sounds", reading: "Reading", logic: "Logic", language: "Language", science: "Science", social: "Social studies", faith: "Faith" };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const day = t => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  async function call(body) {
    const r = await fetch(ChallengeStore.ENDPOINT, { method: "POST", headers: { Authorization: "Bearer " + ChallengeStore.ANON, apikey: ChallengeStore.ANON, "Content-Type": "application/json" }, body: JSON.stringify({ code, ...body }) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error(j.error || "http " + r.status); err.code = j.error; throw err; }
    return j;
  }

  // ---------- the code gate ----------
  let mode = "enter";
  async function gate() {
    const msg = $("#gate-msg");
    try {
      const st = await call({ action: "status" });
      mode = st.codeSet ? "enter" : "choose";
    } catch (e) { $("#gate-help").textContent = "Can't reach the results right now. Check the internet connection and reload."; return; }
    if (mode === "choose") {
      $("#gate-title").textContent = "Choose a grown-ups code";
      $("#gate-help").textContent = "Pick a code only grown-ups know (at least 4 characters). You'll need it to see results and recordings on any device.";
      $("#code2").hidden = false; $("#gate-go").textContent = "Save code";
    } else {
      $("#gate-help").textContent = "Type the grown-ups code to see results and recordings.";
      if (code) { try { await open(); return; } catch (e) { code = ""; sessionStorage.removeItem(KEY); } }
    }
    $("#gate-form").hidden = false; $("#code1").focus();
    $("#gate-form").onsubmit = async e => {
      e.preventDefault(); msg.className = "msg"; msg.textContent = "";
      const c1 = $("#code1").value;
      try {
        if (mode === "choose" || mode === "change") {
          if (c1.length < 4) { msg.className = "msg bad"; msg.textContent = "Use at least 4 characters."; return; }
          if (c1 !== $("#code2").value) { msg.className = "msg bad"; msg.textContent = "The two codes don't match."; return; }
          await call({ action: "setcode", newCode: c1 });
        }
        code = c1; await open();
      } catch (err) {
        code = ""; msg.className = "msg bad";
        msg.textContent = err.code === "locked" ? "Too many wrong tries. Wait 15 minutes." : err.code === "code" ? "That code isn't right." : "Something went wrong. Try again.";
      }
    };
  }
  async function open() {
    await load();
    sessionStorage.setItem(KEY, code);
    $("#gate").hidden = true; $("#app").hidden = false;
  }
  $("#lock").onclick = () => { sessionStorage.removeItem(KEY); location.reload(); };
  $("#newcode").onclick = () => {
    mode = "change"; $("#gate").hidden = false; $("#gate-form").hidden = false; $("#code2").hidden = false;
    $("#gate-title").textContent = "Choose a new code"; $("#gate-help").textContent = "Type the new code twice.";
    $("#gate-go").textContent = "Save new code"; $("#code1").value = ""; $("#code2").value = ""; $("#code1").focus();
    $("#gate").scrollIntoView({ behavior: "smooth" });
  };
  $("#refresh").onclick = () => load().catch(() => {});

  // ---------- loading and drawing ----------
  async function load() {
    try { (await fetch("exams/list.json").then(r => r.json())).forEach(x => titles[x.id] = x.title); } catch (e) {}
    data = await call({ action: "list" });
    drawSubjects(); drawRecs(); drawSessions(); drawWriting();
    ChallengeStore.pending().then(n => { $("#pending").textContent = n ? `${n} answers on this device are still waiting to upload.` : ""; });
  }
  function drawSubjects() {
    const by = {};
    data.answers.filter(a => a.type !== "read" && !a.skipped).forEach(a => {
      const s = by[a.subject] = by[a.subject] || { n: 0, first: 0, skills: {} };
      s.n++; if (a.first_try) s.first++;
      const k = s.skills[a.skill] = s.skills[a.skill] || { n: 0, first: 0 }; k.n++; if (a.first_try) k.first++;
    });
    const rows = Object.entries(by).map(([sub, s]) => {
      const sk = Object.entries(s.skills);
      const good = sk.filter(([, k]) => k.first / k.n >= 0.8).map(([n]) => n), work = sk.filter(([, k]) => k.first / k.n < 0.5).map(([n]) => n);
      return `<tr><td>${esc(SUBJECTS[sub] || sub)}</td><td class="n">${s.n}</td><td class="n">${Math.round(100 * s.first / s.n)}%</td><td>${esc(good.join(", ") || "—")}</td><td>${esc(work.join(", ") || "—")}</td></tr>`;
    });
    const reads = data.recordings.filter(r => r.kind === "read" && r.marks);
    if (reads.length) {
      let words = 0, ok = 0, ms = 0;
      reads.forEach(r => { const m = r.marks.words || []; words += m.length; ok += m.filter(x => x === "ok").length; ms += r.ms || 0; });
      rows.push(`<tr><td>Reading aloud</td><td class="n">${reads.length} marked</td><td class="n">${words ? Math.round(100 * ok / words) : 0}% words read</td><td colspan="2">About ${ms ? Math.round(ok / (ms / 60000)) : 0} words read correctly per minute</td></tr>`);
    }
    $("#subjects").innerHTML = rows.join("") || `<tr><td colspan="5">No answers yet. Results show up here after Joshua does a challenge.</td></tr>`;
  }
  function drawRecs() {
    const box = $("#recs");
    if (!data.recordings.length) { box.innerHTML = "<p>No recordings yet.</p>"; return; }
    const ses = Object.fromEntries(data.sessions.map(s => [s.id, s]));
    box.innerHTML = "";
    [...data.recordings].reverse().forEach(r => {
      const s = ses[r.session_id] || {};
      const div = document.createElement("div"); div.className = "rec-item";
      const words = (r.text || "").split(/\s+/).filter(Boolean);
      const marks = (r.marks && r.marks.words) || [];
      const done = r.marks ? '<span class="pill ok">Marked</span>' : '<span class="pill mid">To mark</span>';
      div.innerHTML = `<div class="rowf"><strong>${esc(titles[s.exam] || s.exam || "")} · ${esc(r.qid)}</strong>${done}<span class="muted">${day(r.created_at)} · ${((r.ms || 0) / 1000).toFixed(1)} s · ${r.kind === "read" ? "Read it himself" : "Told Steve why"}</span></div>
        ${r.url ? `<audio controls preload="none" src="${esc(r.url)}"></audio>` : "<p class='muted'>Recording link unavailable; tap Refresh.</p>"}
        ${r.kind === "read" ? `<div class="words">${words.map((w, k) => `<button type="button" class="word" data-k="${k}" data-m="${marks[k] || ""}">${esc(w)}</button>`).join("")}</div>` : ""}
        <textarea placeholder="Notes (what he said, how he worked through words)">${esc(r.notes || "")}</textarea>
        <div class="rowf"><button class="btn primary save" type="button">Save</button><button class="btn danger del" type="button">Delete recording</button><span class="msg"></span></div>`;
      div.querySelectorAll(".word").forEach(b => b.onclick = () => { const i = MARKS.indexOf(b.dataset.m || null); b.dataset.m = MARKS[(i + 1) % MARKS.length] || ""; });
      const m = div.querySelector(".msg");
      div.querySelector(".save").onclick = async () => {
        const w = [...div.querySelectorAll(".word")].map(b => b.dataset.m || null);
        try { await call({ action: "mark", id: r.id, marks: r.kind === "read" ? { words: w } : { listened: true }, notes: div.querySelector("textarea").value }); m.className = "msg good"; m.textContent = "Saved"; r.marks = r.kind === "read" ? { words: w } : { listened: true }; drawSubjects(); }
        catch (e) { m.className = "msg bad"; m.textContent = "Didn't save. Try again."; }
      };
      armDelete(div.querySelector(".del"), async () => { await call({ action: "delrec", id: r.id }); await load(); });
      box.appendChild(div);
    });
  }
  function armDelete(btn, fn) {
    btn.onclick = async () => {
      if (!btn.classList.contains("armed")) { btn.classList.add("armed"); btn.dataset.t = btn.textContent; btn.textContent = "Tap again to delete"; setTimeout(() => { btn.classList.remove("armed"); btn.textContent = btn.dataset.t; }, 4000); return; }
      btn.disabled = true; try { await fn(); } catch (e) { btn.disabled = false; }
    };
  }
  function drawSessions() {
    const box = $("#sessions");
    if (!data.sessions.length) { box.innerHTML = "<p>None yet.</p>"; return; }
    box.innerHTML = "";
    data.sessions.forEach(s => {
      const ans = data.answers.filter(a => a.session_id === s.id);
      const d = document.createElement("details"); d.className = "rec-item";
      const taps = ans.filter(a => a.type !== "read" && !a.skipped), first = taps.filter(a => a.first_try).length;
      d.innerHTML = `<summary class="rowf" style="cursor:pointer"><strong>${esc(titles[s.exam] || s.exam)}</strong>
          <span class="muted">${day(s.started_at)}</span>
          ${s.finished_at ? `<span class="pill ok">${s.points} / ${s.max_points} points</span>` : '<span class="pill mid">Not finished</span>'}
          <span class="muted">${first} of ${taps.length} right on the first try</span></summary>
        <div class="tw"><table><thead><tr><th>#</th><th>Subject</th><th>Skill</th><th>Level</th><th>Result</th><th>Tries</th><th>Time</th><th>Replays</th></tr></thead><tbody>
        ${ans.sort((a, b) => a.qid.localeCompare(b.qid, undefined, { numeric: true })).map(a => `<tr><td>${esc(a.qid)}</td><td>${esc(SUBJECTS[a.subject] || a.subject)}</td><td>${esc(a.skill)}</td><td>${esc(a.band)}</td>
          <td>${result(a)}</td><td class="n">${a.tries ?? ""}</td><td class="n">${a.ms ? (a.ms / 1000).toFixed(1) + " s" : ""}</td><td class="n">${a.replays ?? ""}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="rowf"><button class="btn danger" type="button">Delete this challenge and its recordings</button></div>`;
      armDelete(d.querySelector(".btn.danger"), async () => { await call({ action: "delsession", session: s.id }); await load(); });
      box.appendChild(d);
    });
  }
  function result(a) {
    if (a.stopped_early) return '<span class="pill">Not asked (stopped early)</span>';
    if (a.skipped) return '<span class="pill no">Skipped</span>';
    if (a.type === "read") return '<span class="pill mid">Recorded</span>';
    if (a.first_try) return '<span class="pill ok">First try</span>';
    if (a.revealed) return '<span class="pill no">Shown the answer</span>';
    return '<span class="pill mid">Got it after a miss</span>';
  }

  // ---------- writing task card ----------
  document.querySelectorAll("#wform select[data-k]").forEach(s => s.innerHTML = LEVELS.map((l, i) => `<option value="${i}">${l || "Choose…"}</option>`).join(""));
  $("#wform").onsubmit = async e => {
    e.preventDefault();
    const scores = {}; document.querySelectorAll("#wform select[data-k]").forEach(s => scores[s.dataset.k] = +s.value || null);
    const m = $("#w-msg");
    try { await call({ action: "writing", exam: $("#w-exam").value, scores, notes: $("#w-notes").value }); m.className = "msg good"; m.textContent = "Saved"; $("#wform").reset(); await load(); }
    catch (err) { m.className = "msg bad"; m.textContent = "Didn't save. Try again."; }
  };
  function drawWriting() {
    const lv = v => esc(LEVELS[v] || "—");
    $("#wlist").innerHTML = data.writing.map(w => `<tr><td class="n">${esc(w.done_on)}</td><td>${esc(titles[w.exam] || w.exam || "")}</td>
      <td>${lv(w.scores.name)}</td><td>${lv(w.scores.letters)}</td><td>${lv(w.scores.person)}</td><td>${lv(w.scores.cut)}</td><td>${lv(w.scores.grip)}</td><td>${esc(w.notes || "")}</td>
      <td><button class="btn danger" type="button" data-id="${esc(w.id)}">Delete</button></td></tr>`).join("") || `<tr><td colspan="9">No cards yet.</td></tr>`;
    $("#wlist").querySelectorAll("button[data-id]").forEach(b => armDelete(b, async () => { await call({ action: "delwriting", id: b.dataset.id }); await load(); }));
  }

  gate();
})();
