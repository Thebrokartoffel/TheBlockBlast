/* ===========================================================================
   pieces.js — Formen und Auswahl-Algorithmus

   Es kommen keine neuen Formen dazu. Was sich ändert, ist wie ausgewählt wird:
   board-bewusst gewichtet, mit Lückenhilfe, Wiederholungsschutz und
   gewichteter Zufallsziehung aus den besten Kandidaten — damit es sich
   niemals berechnet anfühlt.
   ========================================================================= */
(function () {
  const BS = (window.BS = window.BS || {});

  /* [Muster, Grundgewicht] — '#' ist ein Block, '.' ist leer */
  const SRC = [
    ["#", 5.0],
    ["##", 6.5], ["#\n#", 6.5],
    ["###", 6.5], ["#\n#\n#", 6.5],
    ["####", 3.4], ["#\n#\n#\n#", 3.4],
    ["#####", 1.5], ["#\n#\n#\n#\n#", 1.5],
    ["##\n##", 6.0],
    ["###\n###", 2.4], ["##\n##\n##", 2.4],
    ["###\n###\n###", 1.0],
    ["##\n#.", 4.8], ["##\n.#", 4.8], ["#.\n##", 4.8], [".#\n##", 4.8],
    ["#..\n###", 2.5], ["###\n..#", 2.5], ["###\n#..", 2.5], ["..#\n###", 2.5],
    ["##\n#.\n#.", 2.5], ["##\n.#\n.#", 2.5], ["#.\n#.\n##", 2.5], [".#\n.#\n##", 2.5],
    [".##\n##.", 1.8], ["##.\n.##", 1.8], ["#.\n##\n.#", 1.8], [".#\n##\n#.", 1.8],
    ["###\n.#.", 2.4], [".#.\n###", 2.4], ["#.\n##\n#.", 2.4], [".#\n##\n.#", 2.4],
    ["#..\n#..\n###", 1.1], ["###\n#..\n#..", 1.1], ["###\n..#\n..#", 1.1], ["..#\n..#\n###", 1.1],
    [".#.\n###\n.#.", 0.7]
  ];

  const SHAPES = SRC.map(([pat, w], i) => {
    const rows = pat.split("\n"), cells = [];
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === "#") cells.push([x, y]); });
    return {
      id: i,
      cells,
      w: Math.max(...rows.map(r => r.length)),
      h: rows.length,
      n: cells.length,
      weight: w,
      slot: (i * 3) % 8          /* feste Farbzuordnung, in jeder Palette gleich */
    };
  });
  BS.SHAPES = SHAPES;

  const SPECIALS = [{ t: "gem", p: 44 }, { t: "x2", p: 24 }, { t: "star", p: 20 }, { t: "bomb", p: 12 }];

  /* ---------------------------------------------------------------- Board-Hilfen
     Alle Funktionen arbeiten auf einem Uint8Array der Kantenlänge N.
     1 = belegt (blockiert), 2 = gesperrt (blockiert, zählt aber nicht für Linien) */
  function validPositions(b, N, sh) {
    const out = [];
    for (let y = 0; y <= N - sh.h; y++)
      for (let x = 0; x <= N - sh.w; x++) {
        let ok = true;
        for (const c of sh.cells) if (b[(y + c[1]) * N + x + c[0]]) { ok = false; break; }
        if (ok) out.push(x + y * N);
      }
    return out;
  }

  function applyAndClear(b, N, sh, x, y) {
    for (const c of sh.cells) b[(y + c[1]) * N + x + c[0]] = 1;
    const rows = [], cols = [];
    for (let ry = 0; ry < N; ry++) { let f = true; for (let rx = 0; rx < N; rx++) if (b[ry * N + rx] !== 1) { f = false; break; } if (f) rows.push(ry); }
    for (let cx = 0; cx < N; cx++) { let f = true; for (let cy = 0; cy < N; cy++) if (b[cy * N + cx] !== 1) { f = false; break; } if (f) cols.push(cx); }
    rows.forEach(ry => { for (let rx = 0; rx < N; rx++) if (b[ry * N + rx] === 1) b[ry * N + rx] = 0; });
    cols.forEach(cx => { for (let cy = 0; cy < N; cy++) if (b[cy * N + cx] === 1) b[cy * N + cx] = 0; });
    return rows.length + cols.length;
  }

  /* Gibt es eine Reihenfolge, in der alle Teile Platz finden? */
  function seqOK(shapes, b, N, depth) {
    if (!shapes.length) return true;
    depth = depth || 0;
    for (let si = 0; si < shapes.length; si++) {
      const sh = shapes[si];
      const rest = shapes.filter((_, i) => i !== si);
      const pos = validPositions(b, N, sh);
      if (!pos.length) continue;
      const lim = Math.min(pos.length, depth === 0 ? 20 : 12);
      for (let k = 0; k < lim; k++) {
        const j = k + ((Math.random() * (pos.length - k)) | 0);
        const t = pos[k]; pos[k] = pos[j]; pos[j] = t;
        const b2 = b.slice();
        applyAndClear(b2, N, sh, pos[k] % N, (pos[k] / N) | 0);
        if (seqOK(rest, b2, N, depth + 1)) return true;
      }
    }
    return false;
  }

  /* Wie viele Linien kann diese Form irgendwo schließen? */
  function clearPower(b, N, sh) {
    let best = 0;
    for (let y = 0; y <= N - sh.h; y++)
      for (let x = 0; x <= N - sh.w; x++) {
        let ok = true;
        for (const c of sh.cells) if (b[(y + c[1]) * N + x + c[0]]) { ok = false; break; }
        if (!ok) continue;
        const b2 = b.slice();
        const lines = applyAndClear(b2, N, sh, x, y);
        if (lines > best) { best = lines; if (best >= 3) return best; }
      }
    return best;
  }

  /* Reihen und Spalten, denen nur noch ein oder zwei Zellen fehlen */
  function gaps(b, N) {
    let near = 0;
    for (let y = 0; y < N; y++) { let e = 0; for (let x = 0; x < N; x++) if (b[y * N + x] !== 1) e++; if (e > 0 && e <= 2) near++; }
    for (let x = 0; x < N; x++) { let e = 0; for (let y = 0; y < N; y++) if (b[y * N + x] !== 1) e++; if (e > 0 && e <= 2) near++; }
    return near;
  }

  /* ------------------------------------------------------------------ Gewichte
     Je voller das Brett, desto seltener sperrige Teile. Je höher Score und
     Serie, desto eher kommen die unangenehmen Formen zurück. */
  function pickShape(fill, pressureBias) {
    const pressure = Math.max(0, fill - 0.32) * 2.9 * (1 - pressureBias * 0.55);
    let total = 0;
    const ws = SHAPES.map(s => {
      let w = s.weight / (1 + pressure * (s.n - 1) * 0.5);
      if (pressureBias > 0 && s.n >= 4) w *= 1 + pressureBias * 0.9;   /* Schwierigkeits-Skalierung */
      total += w; return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < SHAPES.length; i++) { r -= ws[i]; if (r <= 0) return SHAPES[i]; }
    return SHAPES[0];
  }

  function rollSpecial(ctx) {
    const chance = Math.min(0.34, 0.11 + ctx.score / 240000 + ctx.level * 0.006 + Math.min(0.06, ctx.streak * 0.006));
    if (Math.random() > chance) return null;
    let t = Math.random() * 100;
    for (const s of SPECIALS) { t -= s.p; if (t <= 0) return s.t; }
    return "gem";
  }

  let recent = [];                                   /* Wiederholungsschutz */
  function makePiece(fill, ctx, bias) {
    let sh, guard = 0;
    do {
      sh = pickShape(fill, bias);
      guard++;
    } while (guard < 8 && recent.length >= 2 && recent[0] === sh.id && recent[1] === sh.id);
    recent.unshift(sh.id); recent.length = Math.min(recent.length, 4);

    const specials = {};
    const sp = rollSpecial(ctx);
    if (sp) specials[(Math.random() * sh.cells.length) | 0] = sp;
    return { sh, slot: sh.slot, specials, born: performance.now(), wild: false, mystery: false };
  }

  /* --------------------------------------------------------------- Kandidatensatz
     Erst mehrere Sätze würfeln, jeden bewerten, dann gewichtet-zufällig aus den
     guten ziehen. Kein "nimm immer den besten" — das würde deterministisch wirken. */
  function scoreSet(set, b, N, want) {
    let placeable = 0, spots = 0, power = 0;
    for (const p of set) {
      const pos = validPositions(b, N, p.sh);
      if (pos.length) { placeable++; spots += Math.min(16, pos.length); }
      if (pos.length) power += clearPower(b, N, p.sh);
    }
    let sc = placeable * 24 + spots * 0.5 + power * (want.assist ? 22 : 13);
    if (placeable === 3 && seqOK(set.map(p => p.sh), b, N)) sc += 80;
    if (placeable === 0) sc -= 400;
    return sc;
  }

  BS.Pieces = {
    SHAPES,
    validPositions,
    applyAndClear,
    seqOK,
    clearPower,

    resetHistory() { recent = []; },

    /* board: Uint8Array, N: Kantenlänge, ctx: {score, level, streak, fill, assist, hard, count} */
    deal(b, N, ctx) {
      const count = ctx.count || 3;
      const fill = ctx.fill;
      const near = gaps(b, N);
      const want = { assist: ctx.assist || near > 0 };
      /* Schwierigkeits-Bias: steigt mit Level und Serie, sinkt bei vollem Brett */
      const bias = Math.max(0, Math.min(0.8, (ctx.level - 1) * 0.05 + ctx.streak * 0.02 - Math.max(0, fill - 0.45) * 1.2));

      /* Absichtlich sperriger Satz — aber nie bei vollem Brett */
      if (!ctx.assist && fill < 0.48 && Math.random() < Math.min(0.26, 0.03 + ctx.level * 0.018)) {
        for (let i = 0; i < 8; i++) {
          const set = [];
          for (let k = 0; k < count; k++) set.push(makePiece(fill, ctx, bias));
          if (set.some(p => validPositions(b, N, p.sh).length)) return set;
        }
      }

      const cands = [];
      const tries = ctx.assist ? 12 : 9;
      for (let i = 0; i < tries; i++) {
        const set = [];
        for (let k = 0; k < count; k++) set.push(makePiece(fill, ctx, bias));
        cands.push({ set, sc: scoreSet(set, b, N, want) });
      }
      cands.sort((a, z) => z.sc - a.sc);

      /* Gewichtete Ziehung aus den besten vier: klar besser gewichtet,
         aber nicht immer derselbe Griff */
      const pool = cands.slice(0, 4);
      const base = pool[pool.length - 1].sc;
      let tot = 0;
      const ws = pool.map(c => { const w = Math.max(1, c.sc - base + 12); tot += w; return w; });
      let r = Math.random() * tot;
      for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i].set; }
      return pool[0].set;
    },

    /* Einzelnes Ersatzteil, z. B. für Chaos-Events */
    single(fill, ctx) { return makePiece(fill, ctx, 0); },

    /* Zufällige andere Form mit gleicher Zellzahl (Mystery-Block) */
    morph(sh) {
      const same = SHAPES.filter(s => s.n === sh.n && s.id !== sh.id);
      return same.length ? same[(Math.random() * same.length) | 0] : sh;
    }
  };
})();
