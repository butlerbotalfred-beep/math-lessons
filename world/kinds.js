// Worksheet layouts for the walkable world. Each kind lays out one part of a printed page and registers its answer
// boxes, in the order the app asks them, with api.box({ id, ans, ask, why, draw }):
//   ask  what the narrator says to ask for this box,
//   why  the explanation said after three misses ({...} is a count, said slowly as one piece),
//   draw optional: draws the answer into the box (circles, a bar) instead of writing the number.
// The spoken lines are made from these texts by tools/ws_voice.py; world.js plays them.
(function () {
  const W = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const w = n => W[n], cap = s => s[0].toUpperCase() + s.slice(1);
  const range = (a, b) => { const r = []; for (let k = a; k <= b; k++) r.push(k); return r; };
  const slow = ns => "{" + ns.map(w).join("... ") + ".}";

  // a + b, by counting on from a
  function whySum(a, b) {
    const s = a + b;
    if (b === 0) return `The answer is ${w(s)}. ${cap(w(a))} plus zero. Adding zero doesn't change a number. So ${w(a)} plus zero is ${w(s)}.`;
    if (a === 0) return `The answer is ${w(s)}. Zero plus ${w(b)}. Adding zero doesn't change a number. So zero plus ${w(b)} is ${w(s)}.`;
    const head = `The answer is ${w(s)}. ${cap(w(a))} plus ${w(b)}.`, tail = `So ${w(a)} plus ${w(b)} is ${w(s)}.`;
    if (b === 1) return `${head} Start at ${w(a)}, and count on one more, ${w(s)}. ${tail}`;
    return `${head} Start at ${w(a)}, and count on ${w(b)} more. ${slow(range(a + 1, s))} ${tail}`;
  }
  // the next number in a row that goes up by one, down by one, or stays the same
  function whyTrend(vals, what, d) {
    if (d == null) d = vals[vals.length - 1] - vals[vals.length - 2];
    const nxt = vals[vals.length - 1] + d;
    const how = { 0: "They stay the same.", 1: "Each one is one more.", "-1": "Each one is one less." }[d];
    const seq = vals.length > 1 ? " " + cap(slow(vals)) : ` The last one is ${w(vals[0])}.`;
    return `The answer is ${w(nxt)}. Look at the ${what} numbers.${seq} ${how} So the next one is ${w(nxt)}.`;
  }
  function whyCount(n, things) {
    if (n === 0) return `The answer is zero. There are no ${things}.`;
    if (n === 1) return `The answer is one. There is just one.`;
    return `The answer is ${w(n)}. Let's count the ${things}. ${slow(range(1, n))} There are ${w(n)}.`;
  }

  function vfact(api, cells) {
    const f = api.el("div", "fact");
    f.appendChild(cells[0]); f.appendChild(api.el("span", "plus", "+")); f.appendChild(cells[1]);
    f.appendChild(api.el("span", "bar")); f.appendChild(cells[2]);
    return f;
  }
  const num = (api, n) => api.el("span", "n", n);

  const K = {};

  // Columns of vertical facts as printed; null is an empty box. Rows follow a pattern (page 45).
  K.vert = (part, api, host) => {
    part.printed.forEach((row, r) => {
      const rowEl = api.el("div", "row");
      row.forEach((pr, c) => {
        const f = part.facts[r][c];
        const tops = part.facts[r].slice(0, c).map(x => x[0]), bots = part.facts[r].slice(0, c).map(x => x[1]);
        const t = pr[0] != null ? num(api, pr[0]) : api.box({ id: `${r}-${c}-t`, ans: f[0],
          ask: "This is the next fact. Look at the pattern. What number goes on top?", why: whyTrend(tops, "top") });
        const b = pr[1] != null ? num(api, pr[1]) : api.box({ id: `${r}-${c}-b`, ans: f[1],
          ask: pr[0] == null ? "What number goes on the bottom? Look at the pattern." : `${cap(w(pr[0]))} plus what? Look at the pattern in this row.`,
          why: whyTrend(bots, "bottom") });
        const a = api.box({ id: `${r}-${c}-a`, ans: f[0] + f[1],
          ask: pr[0] != null && pr[1] != null ? `${cap(w(f[0]))} plus ${w(f[1])}. What's the answer?` : "Now add them. What's the answer?",
          why: whySum(f[0], f[1]) });
        rowEl.appendChild(vfact(api, [t, b, a]));
      });
      host.appendChild(rowEl);
    });
  };

  // "a + b = [ ]" in a grid (page 47, Find the sum)
  K.sums = (part, api, host) => {
    const g = api.el("div", "hsums");
    part.items.forEach(([a, b], k) => {
      const f = api.el("div", "hfact");
      f.appendChild(api.el("span", "", `${a} + ${b} =`));
      f.appendChild(api.box({ id: `s${k}`, ans: a + b, ask: `${cap(w(a))} plus ${w(b)}. What's the answer?`, why: whySum(a, b) }));
      g.appendChild(f);
    });
    host.appendChild(g);
  };

  // two groups of blocks, then [ ] + [ ] = [ ] (page 47, Write the addition sentences)
  K.pics = (part, api, host) => {
    const g = api.el("div", "pics");
    part.items.forEach((pic, k) => {
      const box = api.el("div", "pic"), groups = api.el("div", "groups");
      pic.forEach(rows => {
        const gr = api.el("div", "grp");
        rows.forEach(n => { const r = api.el("div"); for (let j = 0; j < n; j++) r.appendChild(api.el("i")); gr.appendChild(r); });
        groups.appendChild(gr);
      });
      box.appendChild(groups);
      const sum = rows => rows.reduce((x, y) => x + y, 0), A = sum(pic[0]), B = sum(pic[1]);
      const f = api.el("div", "hfact");
      f.appendChild(api.box({ id: `p${k}a`, ans: A, ask: "Count the first group of blocks. How many are there?", why: whyCount(A, "blocks in the first group") }));
      f.appendChild(api.el("span", "", "+"));
      f.appendChild(api.box({ id: `p${k}b`, ans: B, ask: "Now count the second group. How many are there?", why: whyCount(B, "blocks in the second group") }));
      f.appendChild(api.el("span", "", "="));
      f.appendChild(api.box({ id: `p${k}c`, ans: A + B, ask: "How many blocks are there in all?", why: whySum(A, B) }));
      box.appendChild(f); g.appendChild(box);
    });
    host.appendChild(g);
  };

  // Facts that make one total, the first given; the top goes up by one (page 47, Write the sums of 5)
  K.makes = (part, api, host) => {
    const T = part.total, rowEl = api.el("div", "row");
    for (let k = 0; k <= T; k++) {
      const a = k, b = T - k;
      const t = k === 0 ? num(api, a) : api.box({ id: `m${k}t`, ans: a,
        ask: `Write the next fact that makes ${w(T)}. The top number goes up by one. What goes on top?`,
        why: whyTrend(range(0, k - 1), "top", 1) });
      const bt = k === 0 ? num(api, b) : api.box({ id: `m${k}b`, ans: b,
        ask: `${cap(w(a))} plus what makes ${w(T)}?`,
        why: b === 0 ? `The answer is zero. ${cap(w(a))} is already ${w(T)}. So ${w(a)} plus zero makes ${w(T)}.`
          : b === 1 ? `The answer is one. Start at ${w(a)}, and count on one more, ${w(T)}. So ${w(a)} plus one makes ${w(T)}.`
          : `The answer is ${w(b)}. Start at ${w(a)}, and count on to ${w(T)}. ${slow(range(a + 1, T))} That's ${w(b)} more. So ${w(a)} plus ${w(b)} makes ${w(T)}.` });
      rowEl.appendChild(vfact(api, [t, bt, num(api, T)]));
    }
    host.appendChild(rowEl);
  };

  // A question with a number answer, said aloud (page 46's questions, page 47's "how many facts")
  K.ask = (part, api, host) => {
    part.items.forEach((q, k) => {
      const r = api.el("div", "askrow");
      r.appendChild(api.el("span", "asktext", q.text));
      r.appendChild(api.box({ id: `q${k}`, ans: q.ans, ask: q.say || q.text, why: q.why }));
      host.appendChild(r);
    });
  };

  // Dominoes: count the top, the bottom, then add (page 48, Write the number facts). The first is done for you.
  const PIPS = { 0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] };
  function domSvg(top, bot, h) {
    const dots = (n, cy) => PIPS[n].map(([x, y]) => `<circle cx="${25 + x * 12}" cy="${cy + y * 12}" r="4.6"/>`).join("");
    return `<svg class="dom" viewBox="0 0 50 100" height="${h}" width="${h / 2}" aria-hidden="true"><rect x="1.5" y="1.5" width="47" height="97" rx="7"/>` +
      `<line x1="7" y1="50" x2="43" y2="50"/><g>${dots(top, 25.5)}${dots(bot, 74.5)}</g></svg>`;
  }
  K.doms = (part, api, host) => {
    const g = api.el("div", "domrow");
    part.items.forEach(([a, b], k) => {
      const p = api.el("div", "prob"); p.insertAdjacentHTML("beforeend", domSvg(a, b, 104));
      const cells = k === 0 ? [num(api, a), num(api, b), num(api, a + b)] : [
        api.box({ id: `d${k}t`, ans: a, ask: "Count the dots on the top half of the domino. How many?",
          why: a === 0 ? "The answer is zero. The top half has no dots." : whyCount(a, "dots on the top half") }),
        api.box({ id: `d${k}b`, ans: b, ask: "Now count the dots on the bottom half. How many?",
          why: b === 0 ? "The answer is zero. The bottom half has no dots." : whyCount(b, "dots on the bottom half") }),
        api.box({ id: `d${k}s`, ans: a + b, ask: `${cap(w(a))} plus ${w(b)}. How many dots in all?`, why: whySum(a, b) })];
      p.appendChild(vfact(api, cells));
      if (k === 0) p.appendChild(api.el("span", "tag", "example"));
      g.appendChild(p);
    });
    host.appendChild(g);
  };

  // Add, then write the turnaround fact (page 48, Write the related addition fact). The first is done for you.
  K.related = (part, api, host) => {
    const g = api.el("div", "relgrid");
    part.items.forEach(([a, b], k) => {
      const s = a + b, p = api.el("div", "prob pair"), ex = k === 0;
      const left = [num(api, a), num(api, b), ex ? num(api, s) : api.box({ id: `r${k}s`, ans: s,
        ask: `${cap(w(a))} plus ${w(b)}. What's the answer?`, why: whySum(a, b) })];
      const turn = `${cap(w(a))} plus ${w(b)} turns around to ${w(b)} plus ${w(a)}.`;
      const right = ex ? [num(api, b), num(api, a), num(api, s)] : [
        api.box({ id: `r${k}t`, ans: b, ask: "Now write the turnaround fact. The numbers trade places. What number goes on top?",
          why: `The answer is ${w(b)}. In a turnaround, the numbers trade places. ${turn} So ${w(b)} goes on top.` }),
        api.box({ id: `r${k}b`, ans: a, ask: "What number goes on the bottom?",
          why: `The answer is ${w(a)}. In a turnaround, the numbers trade places. ${turn} So ${w(a)} goes on the bottom.` }),
        api.box({ id: `r${k}u`, ans: s, ask: "What is the answer for the turnaround?",
          why: `The answer is ${w(s)}. A turnaround has the same answer. ${cap(w(a))} plus ${w(b)} is ${w(s)}. So ${w(b)} plus ${w(a)} is ${w(s)} too.` })];
      p.appendChild(vfact(api, left)); p.appendChild(vfact(api, right));
      if (ex) p.appendChild(api.el("span", "tag", "example"));
      g.appendChild(p);
    });
    host.appendChild(g);
  };

  // Two-part boxes: circles for the first number on the left, the second on the right (page 49).
  function rings(el, n) { el.textContent = ""; for (let k = 0; k < n; k++) el.appendChild(document.createElement("i")); }
  K.mats = (part, api, host) => {
    const g = api.el("div", "mats");
    part.columns.forEach((col, c) => col.forEach(([a, b], r) => {
      const ex = (part.examples || []).some(([ec, er]) => ec === c && er === r);
      const cell = api.el("div", "matcell"); cell.style.gridColumn = c + 1; cell.style.gridRow = r + 1;
      cell.appendChild(api.el("span", "matfact", `${a} + ${b}`));
      const mat = api.el("div", "mat");
      const side = (n, which, first) => {
        if (ex) { const h = api.el("span", "half"); rings(h, n); return h; }
        const pos = first ? "first" : "second", spot = first ? "left" : "right";
        return api.box({ id: `c${c}-${r}${which}`, ans: n, draw: rings, cls: "half",
          ask: `${cap(w(a))} plus ${w(b)}. How many circles go on the ${spot} side?`,
          why: n === 0 ? `The answer is zero. The ${pos} number goes on the ${spot}. The ${pos} number is zero, so the ${spot} side stays empty.`
            : `The answer is ${w(n)}. The ${pos} number goes on the ${spot}. The ${pos} number is ${w(n)}. So draw ${w(n)} ${n === 1 ? "circle" : "circles"} on the ${spot}.` });
      };
      mat.appendChild(side(a, "l", true)); mat.appendChild(side(b, "r", false));
      cell.appendChild(mat);
      if (ex) cell.appendChild(api.el("span", "tag", "example"));
      g.appendChild(cell);
    }));
    host.appendChild(g);
  };

  // Page 46: count the facts for each sum (a tally appears), then color the graph's bars.
  function tallySvg(n) {
    const groups = Math.max(1, Math.ceil(n / 5)), wd = groups * 46;
    let s = `<svg class="tally" viewBox="0 0 ${wd} 34" width="${wd}" height="34" aria-hidden="true">`;
    for (let i = 0; i < n; i++) {
      const gx = 6 + Math.floor(i / 5) * 46, k = i % 5;
      s += k < 4 ? `<line x1="${gx + k * 9}" x2="${gx + k * 9}" y1="3" y2="31"/>` : `<line x1="${gx - 4}" x2="${gx + 31}" y1="27" y2="7"/>`;
    }
    return s + "</svg>";
  }
  K.tallies = (part, api, host) => {
    const g = api.el("div", "fboxes");
    part.facts.forEach((fs, k) => {
      const s = k + 1, n = fs.length, b = api.el("div", "fbox");
      b.appendChild(api.el("div", "lbl", `Facts for ${s}`));
      fs.forEach(f => b.appendChild(api.el("span", "fchip", f)));
      const tb = api.el("div", "tallybox"); b.appendChild(tb);
      b.appendChild(api.box({ id: `t${s}`, ans: n, onDone: () => { tb.innerHTML = tallySvg(n); },
        ask: `Look at the facts for the sum of ${w(s)}. Count them. How many facts are there?`,
        why: `The answer is ${w(n)}. Let's count the facts for the sum of ${w(s)}. ${slow(range(1, n))} There are ${w(n)} facts.` }));
      g.appendChild(b);
    });
    host.appendChild(g);
  };
  K.graph = (part, api, host) => {
    const g = api.el("div", "graph"), max = part.max || 6;
    part.counts.forEach((n, k) => {
      const s = k + 1, row = api.el("div", "grow"), cells = [];
      row.appendChild(api.el("span", "gs", s));
      const strip = api.el("div", "gcells");
      for (let j = 0; j < max; j++) { const c = api.el("span", "gcell"); cells.push(c); strip.appendChild(c); }
      const fill = m => cells.forEach((c, j) => c.classList.toggle("fill", j < m));
      if (k < (part.given || 0)) { fill(n); row.appendChild(api.el("span", "n gnum", n)); }
      else row.appendChild(api.box({ id: `g${s}`, ans: n, onDone: () => fill(n),
        ask: `Now color the graph. Look at your tally for ${w(s)}. Where does the bar for ${w(s)} stop?`,
        why: `The answer is ${w(n)}. The tally for ${w(s)} shows ${w(n)} facts. So the bar for ${w(s)} stops at ${w(n)}.` }));
      row.insertBefore(strip, row.lastChild);
      g.appendChild(row);
    });
    const ax = api.el("div", "gaxis"); ax.appendChild(api.el("span"));
    const nums = api.el("div", "gnums"); for (let j = 0; j <= max; j++) nums.appendChild(api.el("b", "", j));
    ax.appendChild(nums); g.appendChild(ax);
    host.appendChild(g);
  };

  window.SheetKinds = K;
  window.SheetWords = { w, cap, slow, range, whySum };
  window.SheetPics = { domSvg, tallySvg };
})();
