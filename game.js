/* ===========================================================================
   game.js — Board, Platzieren, Auflösen, Punkte, Rendering, Bedienung
   ========================================================================= */
(function () {
  const BS = (window.BS = window.BS || {});
  const $ = id => document.getElementById(id);

  /* ------------------------------------------------------------- Persistenz */
  const KEY = "blockstorm2";
  const mem = {};
  const Store = BS.Store = {
    get(k, d) { try { const v = localStorage.getItem(KEY + "." + k); return v === null ? d : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { try { localStorage.setItem(KEY + "." + k, JSON.stringify(v)); } catch (e) { mem[k] = v; } },
    del(k) { try { localStorage.removeItem(KEY + "." + k); } catch (e) { delete mem[k]; } }
  };

  const Opt = BS.Opt = {
    sound: Store.get("o.sound", true),
    haptic: Store.get("o.haptic", true),
    fx: Store.get("o.fx", true),
    snap: Store.get("o.snap", true),
    hint: Store.get("o.hint", true)
  };

  const META = {
    best: Store.get("best", { normal: 0, extreme: 0, chaos: 0 }),
    games: Store.get("games", { normal: 0, extreme: 0, chaos: 0 }),
    lines: Store.get("lines", 0),
    perfect: Store.get("perfect", 0),
    bestStreak: Store.get("bestStreak", 0),
    bestChain: Store.get("bestChain", 0),
    bestRings: Store.get("bestRings", 0)
  };

  /* ------------------------------------------------------------------ State */
  const S = BS.S = {
    mode: "normal",
    N: 8, viewN: 8, rings: 0, coreOff: 0,
    board: new Array(64).fill(null),
    tray: [null, null, null],
    score: 0, shown: 0, streak: 0, dry: 0, bestStreak: 0, bestChain: 0,
    lines: 0, blocks: 0, perfect: 0, level: 1,
    hammer: 2, swap: 2, nextHammer: 18000, nextSwap: 13000,
    running: false, busy: false, over: false, paused: false,
    hammerMode: false, assistNext: false, odCooldown: 0,
    glow: { rows: [], cols: [], a: 0 },
    chaos: {}, ver: 0
  };
  const touch = () => { S.ver++; };

  /* --------------------------------------------------------- Canvas & Layout */
  const cv = $("game");
  const ctx = cv.getContext("2d", { alpha: true });
  const L = BS.L = { x: 0, y: 0, size: 0, cx: 0, cy: 0, cell: 0, bx: 0, by: 0, trayY: 0, trayH: 0, slotW: 0 };
  let W = 0, H = 0, DPR = 1;
  BS.FAM = "system-ui,sans-serif";

  const holes = new Map();
  function holeSprite(s) {
    const size = Math.max(3, Math.round(s));
    let c = holes.get(size);
    if (c) return c;
    if (holes.size > 40) holes.clear();
    c = document.createElement("canvas");
    c.width = Math.ceil(size * DPR); c.height = Math.ceil(size * DPR);
    const o = c.getContext("2d");
    o.setTransform(DPR, 0, 0, DPR, 0, 0);
    const u = BS.Themes.ui();
    const g = size * 0.06, w = size - g * 2, rad = size * 0.28;
    o.fillStyle = u.hole; BS.path(o, g, g, w, w, rad); o.fill();
    o.fillStyle = u.holeLip; BS.path(o, g, g + w * 0.82, w, w * 0.18, rad * 0.6); o.fill();
    holes.set(size, c);
    return c;
  }

  BS.onThemeChange = () => { holes.clear(); };

  function resize() {
    const r = $("stage").getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    BS.Render.dpr = DPR;
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const pad = 10;
    const trayReserve = Math.min(148, Math.max(96, H * 0.235));
    L.size = Math.floor(Math.min(W - pad * 2, H - trayReserve - pad));
    L.x = Math.round((W - L.size) / 2);
    L.y = Math.round(pad + Math.max(0, (H - trayReserve - pad - L.size) / 2));
    L.cx = L.x + L.size / 2; L.cy = L.y + L.size / 2;
    L.trayY = L.y + L.size + Math.max(12, (H - L.y - L.size) * 0.16);
    L.trayH = Math.max(58, H - L.trayY - 2);
    holes.clear(); BS.Render.invalidate();
    try { BS.FAM = getComputedStyle(document.body).fontFamily; } catch (e) {}
    geom();
  }
  function geom() {
    L.cell = L.size / S.viewN;
    L.bx = L.cx - S.N * L.cell / 2;
    L.by = L.cy - S.N * L.cell / 2;
    L.slotW = W / Math.max(1, S.tray.length);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 120));
  window.addEventListener("load", () => setTimeout(resize, 60));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);

  /* -------------------------------------------------------------- Board-Hilfen */
  const idx = (x, y) => y * S.N + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < S.N && y < S.N;
  const solid = i => { const c = S.board[i]; return !!c && !c.lock; };   /* zählt für Linien */
  function fillRatio() { let n = 0; for (let i = 0; i < S.board.length; i++) if (S.board[i]) n++; return n / S.board.length; }

  function bits() {
    const b = new Uint8Array(S.N * S.N);
    for (let i = 0; i < b.length; i++) b[i] = S.board[i] ? 1 : 0;
    return b;
  }
  function canPlace(p, gx, gy) {
    if (!p) return false;
    for (const c of p.sh.cells) {
      const x = gx + c[0], y = gy + c[1];
      if (!inB(x, y)) return false;
      if (!p.wild && S.board[y * S.N + x]) return false;
    }
    return true;
  }
  function anywhere(p) {
    if (!p) return false;
    for (let y = 0; y <= S.N - p.sh.h; y++) for (let x = 0; x <= S.N - p.sh.w; x++) if (canPlace(p, x, y)) return true;
    return false;
  }
  const anyMove = () => S.tray.some(p => p && anywhere(p));

  function fullLines() {
    const rows = [], cols = [];
    for (let y = 0; y < S.N; y++) { let f = true; for (let x = 0; x < S.N; x++) if (!solid(idx(x, y))) { f = false; break; } if (f) rows.push(y); }
    for (let x = 0; x < S.N; x++) { let f = true; for (let y = 0; y < S.N; y++) if (!solid(idx(x, y))) { f = false; break; } if (f) cols.push(x); }
    return { rows, cols };
  }
  /* Welche Linien würden bei dieser Platzierung komplett? */
  function previewLines(p, gx, gy) {
    const t = new Uint8Array(S.N * S.N);
    for (let i = 0; i < t.length; i++) t[i] = solid(i) ? 1 : (S.board[i] ? 2 : 0);
    for (const c of p.sh.cells) t[idx(gx + c[0], gy + c[1])] = 1;
    const rows = [], cols = [];
    for (let y = 0; y < S.N; y++) { let f = true; for (let x = 0; x < S.N; x++) if (t[idx(x, y)] !== 1) { f = false; break; } if (f) rows.push(y); }
    for (let x = 0; x < S.N; x++) { let f = true; for (let y = 0; y < S.N; y++) if (t[idx(x, y)] !== 1) { f = false; break; } if (f) cols.push(x); }
    return { rows, cols };
  }
  function nearFull() {
    const rows = [], cols = [];
    for (let y = 0; y < S.N; y++) { let e = 0; for (let x = 0; x < S.N; x++) if (!solid(idx(x, y))) e++; if (e === 1) rows.push(y); }
    for (let x = 0; x < S.N; x++) { let e = 0; for (let y = 0; y < S.N; y++) if (!solid(idx(x, y))) e++; if (e === 1) cols.push(x); }
    return { rows, cols };
  }

  /* ---------------------------------------------------------------- Nachschub */
  function refill() {
    const count = (S.mode === "chaos" && S.chaos.doubleNext) ? 4 : 3;
    if (S.chaos) S.chaos.doubleNext = false;
    const set = BS.Pieces.deal(bits(), S.N, {
      score: S.score, level: S.level, streak: S.streak,
      fill: fillRatio(), assist: S.assistNext, count
    });
    if (S.mode === "chaos" && S.chaos.forceSpecial) {
      const p = set[(Math.random() * set.length) | 0];
      p.specials = {}; p.specials[(Math.random() * p.sh.cells.length) | 0] = S.chaos.forceSpecial;
      S.chaos.forceSpecial = null;
    }
    if (S.mode === "chaos" && S.chaos.forceWild) { set[(Math.random() * set.length) | 0].wild = true; S.chaos.forceWild = false; }
    S.assistNext = false;
    S.tray = set;
    geom(); touch();
  }

  /* ------------------------------------------------------------------ Scoring */
  const modeMult = () => BS.MODES[S.mode].mult;
  const streakMult = () => Math.min(6, 1 + S.streak * 0.3);
  const lineBase = n => n <= 0 ? 0 : n === 1 ? 100 : n === 2 ? 300 : n === 3 ? 600 : 1000 + (n - 4) * 300;

  const STREAK_TXT = [[20, "LEGENDARY!"], [16, "CHAOS!"], [12, "UNSTOPPABLE!"], [8, "AMAZING!"], [5, "GREAT!"], [3, "NICE!"]];
  const MULTI_TXT = { 2: "DOUBLE", 3: "TRIPLE", 4: "QUAD", 5: "PENTA", 6: "HEXA", 7: "MEGA BLAST" };

  function addScore(v) {
    S.score += v;
    if (S.score >= S.nextHammer) { S.hammer = Math.min(6, S.hammer + 1); S.nextHammer += 18000; toast("🔨 Hammer erhalten"); BS.SFX.power(); }
    if (S.score >= S.nextSwap) { S.swap = Math.min(6, S.swap + 1); S.nextSwap += 13000; toast("🔄 Tausch erhalten"); BS.SFX.power(); }
    const lv = 1 + Math.floor(S.score / 12000);
    if (lv > S.level) { S.level = lv; BS.FX.banner("LEVEL " + lv, BS.Themes.ui().acc, "", false); BS.SFX.power(); BS.SFX.buzz([10, 34, 10]); }
    hud();
  }

  /* ------------------------------------------------- Platzieren und Auflösen */
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function place(slot, gx, gy) {
    const p = S.tray[slot];
    if (!p || !canPlace(p, gx, gy)) return;
    S.busy = true;

    /* Mystery-Block: beim Setzen in eine andere Form gleicher Größe wechseln */
    if (p.mystery) {
      const alt = BS.Pieces.morph(p.sh);
      const test = { sh: alt, wild: p.wild };
      if (canPlace(test, gx, gy)) {
        p.sh = alt; p.slot = alt.slot;
        BS.FX.pop(L.cx, L.by + gy * L.cell, "MYSTERY!", BS.Themes.ui().gold, 22);
      }
      p.mystery = false;
    }

    const now = performance.now();
    p.sh.cells.forEach((c, i) => {
      const x = gx + c[0], y = gy + c[1];
      S.board[idx(x, y)] = { slot: p.slot, sp: p.specials[i] || null, t: now + i * 12, clrAt: 0, lock: 0 };
    });
    touch();
    S.blocks += p.sh.n;
    addScore(Math.round(p.sh.n * 2 * modeMult()));
    S.tray[slot] = null;
    BS.SFX.place(p.sh.n); BS.SFX.buzz(8);
    BS.FX.pulse = Math.max(BS.FX.pulse, 0.35);

    const gained = await resolve();

    /* Combo hält bis zu zwei trockene Züge aus — das macht Serien erreichbar */
    if (gained === 0) {
      S.dry++;
      if (S.dry >= 3) { if (S.streak >= 2) toast("Combo vorbei"); S.streak = 0; S.dry = 0; }
    } else S.dry = 0;
    combo();

    const ev = BS.Chaos.tick(S);
    if (ev) {
      BS.FX.banner(ev.label, BS.Themes.ui().gold, ev.hint, false);
      BS.FX.flash = Math.max(BS.FX.flash, 0.35);
      BS.SFX.chaos(); BS.SFX.buzz([14, 30, 14]);
      touch();
    }

    if (S.tray.every(t => !t)) refill();
    if (S.odCooldown > 0) S.odCooldown--;
    save();
    S.busy = false;
    if (!anyMove()) gameOver();
  }

  async function resolve() {
    const fl = fullLines();
    if (!fl.rows.length && !fl.cols.length) return 0;

    S.streak++;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    combo();

    const nLines = fl.rows.length + fl.cols.length;
    S.lines += nLines;

    /* Glühen der Vorschau nahtlos in die Zerstörung übernehmen */
    S.glow.rows = fl.rows.slice(); S.glow.cols = fl.cols.slice(); S.glow.a = 1;

    let pending = new Set();
    fl.rows.forEach(y => { for (let x = 0; x < S.N; x++) pending.add(idx(x, y)); });
    fl.cols.forEach(x => { for (let y = 0; y < S.N; y++) pending.add(idx(x, y)); });

    let wave = 0, total = 0;
    const rainbowHit = BS.Chaos.rainbowActive(S) && fl.rows.indexOf(S.chaos.rainbowRow) >= 0;

    while (pending.size) {
      wave++;
      const waveMult = 1 + 0.5 * (wave - 1);
      let bonus = 0, boost = 1, bombs = 0;
      const next = new Set();

      for (const i of pending) {
        const c = S.board[i]; if (!c || !c.sp) continue;
        const x = i % S.N, y = (i / S.N) | 0;
        if (c.sp === "gem") bonus += 300;
        else if (c.sp === "x2") boost *= 2;
        else if (c.sp === "star") { bonus += 200; for (let k = 0; k < S.N; k++) { next.add(idx(k, y)); next.add(idx(x, k)); } }
        else if (c.sp === "bomb") {
          bonus += 150; bombs++;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inB(x + dx, y + dy)) next.add(idx(x + dx, y + dy));
        }
      }

      const base = wave === 1 ? lineBase(nLines) + pending.size * 5 : 150 * wave + pending.size * 20;
      let gained = (base + bonus) * waveMult * boost * streakMult() * modeMult();
      if (rainbowHit && wave === 1) gained *= 2;
      gained = Math.round(gained);
      total += gained;

      /* Welle vom Schwerpunkt nach außen */
      let ax = 0, ay = 0;
      for (const i of pending) { ax += i % S.N; ay += (i / S.N) | 0; }
      ax /= pending.size; ay /= pending.size;
      const order = [...pending];
      const t0 = performance.now();
      let maxDly = 0;
      for (const i of order) {
        const c = S.board[i]; if (!c) continue;
        const d = Math.hypot(i % S.N - ax, ((i / S.N) | 0) - ay);
        c.clrAt = t0 + d * 20;
        if (d * 20 > maxDly) maxDly = d * 20;
      }

      if (bombs) { BS.SFX.boom(); BS.FX.kick(8 + bombs * 2); }
      BS.SFX.clear(S.streak + wave);
      BS.FX.kick(3 + nLines * 1.8 + wave * 2.6);
      BS.SFX.buzz(bombs ? [18, 22, 18] : 14);
      BS.FX.pulse = Math.min(1, 0.3 + nLines * 0.12 + wave * 0.14);

      const tag = boost > 1 ? "BOOST ×" + boost : (rainbowHit && wave === 1 ? "RAINBOW ×2" : "");
      if (wave === 1) {
        if (nLines >= 2) BS.FX.banner(MULTI_TXT[Math.min(nLines, 7)] || "MEGA BLAST", BS.Themes.ui().acc, tag);
        const st = STREAK_TXT.find(r => S.streak >= r[0]);
        if (st && S.streak === st[0]) BS.FX.banner(st[1], BS.Themes.ui().gold, "COMBO ×" + S.streak);
      } else {
        BS.FX.banner("CHAIN ×" + wave, BS.Themes.ui().gold, tag);
        S.bestChain = Math.max(S.bestChain, wave);
      }

      await sleep(Math.min(420, 180 + maxDly));
      touch();

      for (const i of order) {
        const c = S.board[i]; if (!c) continue;
        BS.FX.burst(L.bx + ((i % S.N) + 0.5) * L.cell, L.by + (((i / S.N) | 0) + 0.5) * L.cell,
          c.slot, c.sp ? 9 : 5, c.sp ? 3.2 : 2.1, L.cell);
        S.board[i] = null;
      }
      BS.FX.flash = Math.min(0.7, 0.16 + nLines * 0.05 + wave * 0.1);
      BS.FX.pop(L.cx, L.cy, "+" + gained.toLocaleString("de-DE"),
        wave > 1 ? BS.Themes.ui().gold : BS.Themes.ui().acc, 30 + Math.min(18, nLines * 3 + wave * 4));
      addScore(gained);
      await sleep(wave > 1 ? 55 : 80);

      const nxt = new Set();
      for (const i of next) if (S.board[i]) nxt.add(i);
      pending = nxt;
    }

    /* ---- Extreme: Ring abtragen, wenn eine reine Randlinie fiel ---- */
    if (S.mode === "extreme" && S.rings > 0) {
      const outer = fl.rows.some(y => BS.Extreme.isOuterLine(S, y)) || fl.cols.some(x => BS.Extreme.isOuterLine(S, x));
      if (outer) await peelRing();
    }
    /* ---- Extreme: Overdrive auslösen ---- */
    if (BS.Extreme.shouldExpand(S, nLines)) await overdrive();

    if (S.board.every(c => !c)) await perfectClear();
    return total;
  }

  /* --------------------------------------------------------------- Overdrive */
  async function overdrive() {
    const from = S.N;
    BS.Extreme.expand(S);
    META.bestRings = Math.max(META.bestRings, S.rings); Store.set("bestRings", META.bestRings);
    BS.FX.banner("OVERDRIVE", BS.Themes.ui().gold, "Feld " + S.N + "×" + S.N, true);
    BS.FX.flash = 0.6; BS.FX.kick(14);
    BS.SFX.zoomOut(); BS.SFX.buzz([20, 40, 20, 40, 60]);
    touch(); geom();
    await tweenView(from, S.N, 620);
    toast("Ring geöffnet — Randlinien lösen ihn wieder auf");
  }

  async function peelRing() {
    const from = S.N;
    const lost = BS.Extreme.peel(S);
    if (!lost) return;
    for (const c of lost) {
      BS.FX.burst(L.bx + (c.x + 0.5) * L.cell, L.by + (c.y + 0.5) * L.cell, c.c.slot, 6, 2.4, L.cell);
    }
    BS.FX.banner("RING AUFGELÖST", BS.Themes.ui().acc, "Feld " + S.N + "×" + S.N, true);
    BS.FX.flash = 0.45; BS.FX.kick(10);
    BS.SFX.zoomIn(); BS.SFX.buzz([24, 36, 24]);
    touch(); geom();
    await tweenView(from, S.N, 560);
  }

  function tweenView(a, b, ms) {
    return new Promise(res => {
      const t0 = performance.now();
      (function step() {
        const k = Math.min(1, (performance.now() - t0) / ms);
        S.viewN = a + (b - a) * BS.Ease.outQuint(k);
        geom();
        if (k < 1) requestAnimationFrame(step); else { S.viewN = b; geom(); res(); }
      })();
    });
  }

  /* ----------------------------------------------------------- Perfect Clear */
  async function perfectClear() {
    S.perfect++;
    META.perfect++; Store.set("perfect", META.perfect);

    const bonus = Math.round((1000 + S.streak * 250) * modeMult());
    addScore(bonus);

    /* Serie wird belohnt statt zurückgesetzt */
    S.streak++; S.dry = 0;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    S.assistNext = true;                       /* nächster Satz passt besonders gut */
    S.hammer = Math.min(6, S.hammer + 1);

    BS.FX.banner("PERFECT CLEAR", BS.Themes.ui().gold, "+" + bonus.toLocaleString("de-DE"), true);
    BS.FX.confetti(L.x, L.y, L.size, L.size, L.cell);
    BS.FX.flash = 0.8; BS.FX.pulse = 1; BS.FX.kick(16);
    BS.SFX.perfect(); BS.SFX.buzz([30, 50, 30, 50, 70]);
    toast("Perfect Clear #" + S.perfect + " · 🔨 +1");

    if (S.mode === "chaos") {
      for (let i = 0; i < S.board.length; i++) if (S.board[i] && S.board[i].lock) S.board[i] = null;
      BS.Chaos.reset(S);
    }
    if (S.mode === "extreme" && S.rings > 0) await peelRing();

    combo(); hud();
    await sleep(240);
  }

  /* ------------------------------------------------------------------ Werkzeug */
  function hammerTap(p) {
    if (!S.hammerMode) return false;
    const gx = Math.floor((p.x - L.bx) / L.cell), gy = Math.floor((p.y - L.by) / L.cell);
    if (inB(gx, gy) && S.board[idx(gx, gy)]) {
      const c = S.board[idx(gx, gy)];
      BS.FX.burst(L.bx + (gx + 0.5) * L.cell, L.by + (gy + 0.5) * L.cell, c.slot, 12, 2.8, L.cell);
      S.board[idx(gx, gy)] = null; touch();
      S.hammer--; S.hammerMode = false;
      BS.SFX.boom(); BS.FX.kick(8); BS.SFX.buzz(18); hud(); save();
    } else { S.hammerMode = false; hud(); }
    return true;
  }

  /* -------------------------------------------------------------- Rendering */
  function drawBg() {
    const u = BS.Themes.ui();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, u.bg); g.addColorStop(1, u.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (Opt.fx) {
      const y = L.cy + Math.sin(performance.now() / 3400) * L.size * 0.05;
      const rg = ctx.createRadialGradient(L.cx, y, 0, L.cx, y, Math.max(60, L.size * 0.95));
      rg.addColorStop(0, BS.hexA(u.acc, 0.07)); rg.addColorStop(1, BS.hexA(u.acc, 0));
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
  }

  /* Der Pre-Clear-Glow: Linien, die gleich fallen, leuchten schon vor dem Loslassen */
  function drawGlowBands(rows, cols, alpha) {
    if (alpha <= 0.01) return;
    const u = BS.Themes.ui();
    const t = performance.now();
    const puls = 0.62 + Math.sin(t / 150) * 0.24;
    const a = alpha * puls;

    const band = (x, y, w, h, vertical) => {
      const gr = vertical
        ? ctx.createLinearGradient(x, 0, x + w, 0)
        : ctx.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, BS.hexA(u.acc, a * 0.15));
      gr.addColorStop(0.5, (u.light ? "rgba(255,255,255," + (a * 0.85) + ")" : "rgba(255,255,255," + (a * 0.5) + ")"));
      gr.addColorStop(1, BS.hexA(u.acc, a * 0.15));
      ctx.fillStyle = gr;
      ctx.fillRect(x, y, w, h);
      ctx.save();
      ctx.shadowColor = BS.hexA(u.acc, a); ctx.shadowBlur = 22;
      ctx.strokeStyle = u.light ? BS.hexA(u.acc, a * 0.95) : "rgba(255,255,255," + (a * 0.85) + ")";
      ctx.lineWidth = 2.4;
      BS.path(ctx, x + 1, y + 1, w - 2, h - 2, L.cell * 0.2); ctx.stroke();
      ctx.restore();
    };

    rows.forEach(y => band(L.bx, L.by + y * L.cell, S.N * L.cell, L.cell, false));
    cols.forEach(x => band(L.bx + x * L.cell, L.by, L.cell, S.N * L.cell, true));

    if (Opt.fx && Math.random() < 0.7) {
      rows.forEach(y => BS.FX.spark(L.bx + Math.random() * S.N * L.cell, L.by + (y + Math.random()) * L.cell, u.light ? BS.hexA(u.acc, .95) : "rgba(255,255,255,.9)"));
      cols.forEach(x => BS.FX.spark(L.bx + (x + Math.random()) * L.cell, L.by + Math.random() * S.N * L.cell, u.light ? BS.hexA(u.acc, .95) : "rgba(255,255,255,.9)"));
    }
  }

  function drawBoard() {
    const u = BS.Themes.ui();
    const drag = BS.drag;
    const sc = 1 + BS.FX.pulse * 0.012;

    ctx.save();
    ctx.translate(L.cx, L.cy); ctx.scale(sc, sc); ctx.translate(-L.cx, -L.cy);

    /* Rahmen */
    ctx.fillStyle = u.frame;
    BS.path(ctx, L.x - 8, L.y - 8, L.size + 16, L.size + 16, 28); ctx.fill();
    ctx.strokeStyle = u.frameLine; ctx.lineWidth = 1.5;
    BS.path(ctx, L.x - 8, L.y - 8, L.size + 16, L.size + 16, 28); ctx.stroke();

    ctx.save();
    BS.path(ctx, L.x, L.y, L.size, L.size, 22); ctx.clip();

    /* Raster */
    const hs = holeSprite(L.cell);
    for (let y = 0; y < S.N; y++) for (let x = 0; x < S.N; x++) {
      const px = L.bx + x * L.cell, py = L.by + y * L.cell;
      if (px > L.x + L.size || py > L.y + L.size || px + L.cell < L.x || py + L.cell < L.y) continue;
      ctx.drawImage(hs, px, py, L.cell, L.cell);
    }

    /* Kernfeld markieren, solange Ringe offen sind */
    if (S.rings > 0) {
      const o = S.coreOff;
      ctx.strokeStyle = BS.hexA(u.gold, 0.32); ctx.lineWidth = 2;
      ctx.setLineDash([L.cell * 0.3, L.cell * 0.22]);
      BS.path(ctx, L.bx + o * L.cell, L.by + o * L.cell, 8 * L.cell, 8 * L.cell, L.cell * 0.25);
      ctx.stroke(); ctx.setLineDash([]);
    }

    /* Rainbow-Row */
    if (BS.Chaos.rainbowActive(S)) {
      const left = Math.max(0, (S.chaos.rainbowUntil - performance.now()) / 10000);
      ctx.fillStyle = BS.hexA(u.gold, 0.1 + 0.08 * Math.sin(performance.now() / 180)) ;
      ctx.fillRect(L.bx, L.by + S.chaos.rainbowRow * L.cell, S.N * L.cell, L.cell);
      ctx.fillStyle = BS.hexA(u.gold, 0.55);
      ctx.fillRect(L.bx, L.by + S.chaos.rainbowRow * L.cell, S.N * L.cell * left, 3);
    }

    /* Pre-Clear-Glow aus der Ziehvorschau */
    let pv = null;
    if (drag.on && drag.ok) {
      const p = S.tray[drag.slot];
      if (p) pv = previewLines(p, drag.gx, drag.gy);
    }
    if (pv && (pv.rows.length || pv.cols.length)) drawGlowBands(pv.rows, pv.cols, 1);
    else if (S.glow.a > 0) drawGlowBands(S.glow.rows, S.glow.cols, S.glow.a);

    /* Blöcke */
    const now = performance.now();
    const glowSet = new Set();
    if (pv) { pv.rows.forEach(y => { for (let x = 0; x < S.N; x++) glowSet.add(idx(x, y)); }); pv.cols.forEach(x => { for (let y = 0; y < S.N; y++) glowSet.add(idx(x, y)); }); }

    for (let y = 0; y < S.N; y++) for (let x = 0; x < S.N; x++) {
      const i = idx(x, y), c = S.board[i]; if (!c) continue;
      const px = L.bx + x * L.cell, py = L.by + y * L.cell;
      if (px > L.x + L.size || py > L.y + L.size || px + L.cell < L.x || py + L.cell < L.y) continue;

      if (c.lock) {                                   /* Frost-Zelle */
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = BS.hexA(u.acc, 0.22);
        BS.path(ctx, px + L.cell * 0.06, py + L.cell * 0.06, L.cell * 0.88, L.cell * 0.88, L.cell * 0.26); ctx.fill();
        ctx.strokeStyle = BS.hexA(u.acc, 0.7); ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        BS.path(ctx, px + L.cell * 0.06, py + L.cell * 0.06, L.cell * 0.88, L.cell * 0.88, L.cell * 0.26); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = u.ink; ctx.font = "700 " + (L.cell * 0.34) + "px " + BS.FAM;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(c.lock, px + L.cell / 2, py + L.cell / 2);
        ctx.restore();
        continue;
      }

      let s = 1, flash = 0;
      const age = now - c.t;
      if (age < 170) { const k = BS.clamp(age / 170, 0, 1); s = 0.68 + 0.32 * BS.Ease.outBack(k); }
      if (c.clrAt) { const k = (now - c.clrAt) / 190; if (k > 0) { flash = Math.min(1, k); s *= 1 + 0.2 * Math.sin(flash * Math.PI); } }

      ctx.save();
      ctx.translate(px + L.cell / 2, py + L.cell / 2); ctx.scale(s, s); ctx.translate(-L.cell / 2, -L.cell / 2);
      BS.Render.block(ctx, 0, 0, L.cell, c.slot, c.sp, 1, Opt.fx && (!!c.sp || flash > 0 || glowSet.has(i)));
      if (flash > 0 || glowSet.has(i)) {
        ctx.globalAlpha = flash > 0 ? 0.75 * flash : 0.3 + Math.sin(now / 150) * 0.12;
        ctx.fillStyle = u.light ? "rgba(255,255,255,.95)" : "#fff";
        BS.path(ctx, 0, 0, L.cell, L.cell, L.cell * 0.26); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    /* Geistervorschau */
    if (drag.on) {
      const p = S.tray[drag.slot];
      if (p) for (const cc of p.sh.cells) {
        const x = drag.gx + cc[0], y = drag.gy + cc[1];
        if (!inB(x, y)) continue;
        const px = L.bx + x * L.cell, py = L.by + y * L.cell;
        if (!drag.ok) {
          ctx.fillStyle = u.ghostBad;
          BS.path(ctx, px + 3, py + 3, L.cell - 6, L.cell - 6, L.cell * 0.26); ctx.fill();
        } else {
          BS.Render.block(ctx, px, py, L.cell, p.slot, null, 0.38, false);
          ctx.strokeStyle = u.light ? "rgba(40,52,78,.35)" : "rgba(255,255,255,.45)"; ctx.lineWidth = 2;
          BS.path(ctx, px + 2, py + 2, L.cell - 4, L.cell - 4, L.cell * 0.25); ctx.stroke();
        }
      }
    }

    if (S.hammerMode) {
      ctx.fillStyle = BS.hexA(u.gold, 0.045 + Math.sin(performance.now() / 280) * 0.03);
      ctx.fillRect(L.x, L.y, L.size, L.size);
    }
    ctx.restore();  /* Clip */

    /* Randmarker für fast volle Linien */
    if (Opt.hint && !BS.drag.on) {
      const nf = nearFull();
      if (nf.rows.length || nf.cols.length) {
        ctx.fillStyle = BS.hexA(u.acc, 0.5);
        const t = 4, o = 6;
        nf.rows.forEach(y => {
          const py = L.by + y * L.cell;
          if (py < L.y - L.cell || py > L.y + L.size) return;
          BS.path(ctx, L.x - o - t, py + L.cell * 0.22, t, L.cell * 0.56, t / 2); ctx.fill();
          BS.path(ctx, L.x + L.size + o, py + L.cell * 0.22, t, L.cell * 0.56, t / 2); ctx.fill();
        });
        nf.cols.forEach(x => {
          const px = L.bx + x * L.cell;
          if (px < L.x - L.cell || px > L.x + L.size) return;
          BS.path(ctx, px + L.cell * 0.22, L.y - o - t, L.cell * 0.56, t, t / 2); ctx.fill();
          BS.path(ctx, px + L.cell * 0.22, L.y + L.size + o, L.cell * 0.56, t, t / 2); ctx.fill();
        });
      }
    }
    ctx.restore();  /* Pulse-Scale */
  }

  function trayRect(i) { return { x: i * L.slotW, y: L.trayY, w: L.slotW, h: L.trayH }; }
  function trayScale(sh) { return Math.min(L.slotW * 0.74 / sh.w, L.trayH * 0.78 / sh.h, L.size / S.viewN * 0.72); }

  function drawTray() {
    const drag = BS.drag;
    for (let i = 0; i < S.tray.length; i++) {
      const p = S.tray[i]; if (!p || (drag.on && drag.slot === i)) continue;
      const r = trayRect(i), s = trayScale(p.sh);
      const ox = r.x + (r.w - p.sh.w * s) / 2, oy = r.y + (r.h - p.sh.h * s) / 2;
      const k = Math.min(1, (performance.now() - p.born) / 260);
      const sc = 0.6 + 0.4 * BS.Ease.outBack(k);
      if (p._v !== S.ver) { p._v = S.ver; p._dead = !anywhere(p); }
      ctx.save();
      ctx.globalAlpha = (p._dead ? 0.26 : 1) * Math.min(1, k * 2);
      ctx.translate(ox + p.sh.w * s / 2, oy + p.sh.h * s / 2 + (1 - k) * 16);
      ctx.scale(sc, sc);
      ctx.translate(-p.sh.w * s / 2, -p.sh.h * s / 2);
      for (let ci = 0; ci < p.sh.cells.length; ci++) {
        const cc = p.sh.cells[ci];
        BS.Render.block(ctx, cc[0] * s, cc[1] * s, s, p.slot, p.wild ? "wild" : (p.specials[ci] || null), 1, false);
      }
      if (p.mystery) {
        ctx.fillStyle = BS.Themes.isLight() ? "rgba(30,38,58,.85)" : "rgba(255,255,255,.92)";
        ctx.font = "700 " + (s * 0.8) + "px " + BS.FAM;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("?", p.sh.w * s / 2, p.sh.h * s / 2);
      }
      ctx.restore();
    }

    if (drag.on) {
      const p = S.tray[drag.slot];
      if (p) {
        const s = L.cell * (1 + 0.06 * drag.lift);
        const ox = drag.px - p.sh.w * s / 2, oy = drag.py - drag.offset - p.sh.h * s / 2;
        ctx.save();
        ctx.shadowColor = BS.Themes.ui().shadow; ctx.shadowBlur = 18; ctx.shadowOffsetY = 7;
        for (let ci = 0; ci < p.sh.cells.length; ci++) {
          const cc = p.sh.cells[ci];
          BS.Render.block(ctx, ox + cc[0] * s, oy + cc[1] * s, s, p.slot, p.wild ? "wild" : (p.specials[ci] || null), 1, false);
        }
        ctx.restore();
      }
    }
  }

  let last = performance.now();
  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (W === 0) resize();

    BS.Input.update(dt);
    BS.FX.update();
    if (S.glow.a > 0) S.glow.a = Math.max(0, S.glow.a - dt * 2.2);

    if (S.shown !== S.score) {
      const d = S.score - S.shown;
      S.shown += Math.max(1, Math.ceil(Math.abs(d) * 0.2)) * Math.sign(d);
      if (Math.abs(S.score - S.shown) < 2) S.shown = S.score;
      elScore.textContent = S.shown.toLocaleString("de-DE");
    }

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBg();

    let sx = 0, sy = 0;
    if (BS.FX.shake > 0.3) { sx = (Math.random() - 0.5) * BS.FX.shake; sy = (Math.random() - 0.5) * BS.FX.shake; }
    ctx.save(); ctx.translate(sx, sy);
    drawBoard(); drawTray();
    BS.FX.draw(ctx, W, H, L);
    ctx.restore();

    if (BS.FX.flash > 0.01) {
      const fu = BS.Themes.ui();
      ctx.fillStyle = "rgba(" + fu.flash + "," + (BS.FX.flash * fu.flashK) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* -------------------------------------------------------------------- HUD */
  const elScore = $("score"), elBest = $("best"), elLvl = $("lvl"), elModeTag = $("modeTag");
  const elComboBar = $("comboBar"), elComboTxt = $("comboTxt"), elComboFill = $("comboFill");

  function hud() {
    elBest.textContent = Math.max(META.best[S.mode] || 0, S.score).toLocaleString("de-DE");
    elLvl.textContent = S.level;
    elModeTag.textContent = BS.MODES[S.mode].name + (S.rings ? " · " + S.N + "×" + S.N : "");
    $("cHammer").textContent = S.hammer;
    $("cSwap").textContent = S.swap;
    $("pwHammer").classList.toggle("empty", S.hammer <= 0);
    $("pwSwap").classList.toggle("empty", S.swap <= 0);
    $("pwHammer").classList.toggle("active", S.hammerMode);
    elScore.classList.add("bump");
    setTimeout(() => elScore.classList.remove("bump"), 90);
  }
  function combo() {
    if (S.streak >= 2) {
      elComboBar.classList.add("on");
      elComboTxt.textContent = "COMBO ×" + S.streak + "  " + streakMult().toFixed(1) + "×";
      elComboFill.style.width = Math.min(100, (S.streak / 18) * 100) + "%";
      $("comboDots").textContent = "•".repeat(Math.max(0, 2 - S.dry)) || "!";
    } else elComboBar.classList.remove("on");
  }
  let toastT = null;
  function toast(m) {
    const t = $("toast"); t.textContent = m; t.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 1800);
  }
  const show = id => $(id).classList.remove("hide");
  const hide = id => $(id).classList.add("hide");

  /* ------------------------------------------------------------- Spielfluss */
  function newGame(mode) {
    S.mode = mode || S.mode;
    S.N = 8; S.viewN = 8; S.rings = 0; S.coreOff = 0;
    S.board = new Array(64).fill(null);
    S.tray = [null, null, null];
    S.score = 0; S.shown = 0; S.streak = 0; S.dry = 0; S.bestStreak = 0; S.bestChain = 0;
    S.lines = 0; S.blocks = 0; S.perfect = 0; S.level = 1;
    S.hammer = 2; S.swap = 2; S.nextHammer = 18000; S.nextSwap = 13000;
    S.over = false; S.busy = false; S.paused = false; S.hammerMode = false;
    S.assistNext = true; S.odCooldown = 0;
    S.glow = { rows: [], cols: [], a: 0 };
    BS.Chaos.reset(S);
    BS.Pieces.resetHistory();
    BS.FX.reset();
    touch(); geom(); refill();
    elScore.textContent = "0";
    S.running = true;
    hud(); combo();
    META.games[S.mode] = (META.games[S.mode] || 0) + 1; Store.set("games", META.games);
    save();
  }

  function gameOver() {
    if (S.over) return;
    S.over = true; S.running = false;
    BS.SFX.over(); BS.SFX.buzz([36, 54, 36]); BS.FX.kick(10);
    const isBest = S.score > (META.best[S.mode] || 0);
    if (isBest) { META.best[S.mode] = S.score; Store.set("best", META.best); }
    META.lines += S.lines; Store.set("lines", META.lines);
    if (S.bestStreak > META.bestStreak) { META.bestStreak = S.bestStreak; Store.set("bestStreak", META.bestStreak); }
    if (S.bestChain > META.bestChain) { META.bestChain = S.bestChain; Store.set("bestChain", META.bestChain); }
    Store.del("save." + S.mode);
    $("oScore").textContent = S.score.toLocaleString("de-DE");
    $("oMode").textContent = BS.MODES[S.mode].name;
    $("oMeta").textContent = "Combo ×" + S.bestStreak + " · " + S.lines + " Linien · " + S.perfect + " Perfect";
    $("oNewBest").style.display = isBest ? "" : "none";
    $("oWord").textContent = isBest ? "Neuer Bestwert — stark!"
      : S.score >= (META.best[S.mode] || 0) * 0.8 ? "Knapp dran. Nächste Runde sitzt er."
      : S.bestStreak >= 8 ? "Schöne Serie dabei gehabt."
      : S.perfect > 0 ? "Ein leeres Feld geschafft — nicht schlecht."
      : "Kein Teil passte mehr. Neue Runde?";
    setTimeout(() => show("scOver"), 560);
  }

  function save() {
    if (!S.running) return;
    Store.set("save." + S.mode, {
      N: S.N, rings: S.rings, b: S.board, sc: S.score, st: S.streak, dry: S.dry,
      bs: S.bestStreak, bc: S.bestChain, li: S.lines, bl: S.blocks, pf: S.perfect, lv: S.level,
      h: S.hammer, w: S.swap, nh: S.nextHammer, ns: S.nextSwap, ch: S.chaos, od: S.odCooldown,
      t: S.tray.map(p => p ? { i: p.sh.id, sl: p.slot, sp: p.specials, wd: !!p.wild, my: !!p.mystery } : null)
    });
  }
  function loadSave(mode) {
    const d = Store.get("save." + mode, null);
    if (!d || !d.b || !d.N || d.b.length !== d.N * d.N) return false;
    S.mode = mode;
    S.N = d.N; S.viewN = d.N; S.rings = d.rings || 0; S.coreOff = (S.N - 8) / 2;
    S.board = d.b.map(c => c ? { slot: c.slot || 0, sp: c.sp || null, lock: c.lock || 0, t: 0, clrAt: 0 } : null);
    S.score = d.sc || 0; S.shown = S.score; S.streak = d.st || 0; S.dry = d.dry || 0;
    S.bestStreak = d.bs || 0; S.bestChain = d.bc || 0; S.lines = d.li || 0; S.blocks = d.bl || 0;
    S.perfect = d.pf || 0; S.level = d.lv || 1;
    S.hammer = d.h === undefined ? 2 : d.h; S.swap = d.w === undefined ? 2 : d.w;
    S.nextHammer = d.nh || 18000; S.nextSwap = d.ns || 13000;
    S.chaos = d.ch || {}; if (!S.chaos.next) BS.Chaos.reset(S);
    S.odCooldown = d.od || 0;
    S.tray = (d.t || []).map(p => p && BS.SHAPES[p.i]
      ? { sh: BS.SHAPES[p.i], slot: p.sl === undefined ? BS.SHAPES[p.i].slot : p.sl, specials: p.sp || {}, born: 0, wild: !!p.wd, mystery: !!p.my }
      : null);
    if (!S.tray.length) S.tray = [null, null, null];
    S.over = false; S.running = true; S.busy = false; S.hammerMode = false;
    S.glow = { rows: [], cols: [], a: 0 };
    BS.FX.reset(); touch(); geom();
    if (S.tray.every(t => !t)) refill();
    elScore.textContent = S.score.toLocaleString("de-DE");
    hud(); combo();
    return true;
  }

  /* ------------------------------------------------------------ Öffentliche API */
  BS.Game = {
    state: S,
    tray: () => S.tray,
    acceptsInput: () => S.running && !S.busy && !S.paused && !S.over,
    canPlaceAt: (p, x, y) => canPlace(p, x, y),
    place,
    newGame,
    loadSave,
    anywhere,
    fullLines,
    previewLines,
    hammerTap,
    trayHit(p) {
      for (let i = 0; i < S.tray.length; i++) {
        if (!S.tray[i]) continue;
        const r = trayRect(i);
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y - 12 && p.y <= r.y + r.h + 12) return i;
      }
      return -1;
    },
    boot
  };

  /* ---------------------------------------------------------------- Bedienung */
  let pickedMode = Store.get("mode", "normal");

  function paintModeCards() {
    document.querySelectorAll(".mode").forEach(el => {
      const on = el.dataset.mode === pickedMode;
      el.classList.toggle("on", on);
    });
    $("mDesc").textContent = BS.MODES[pickedMode].desc;
    $("sBest").textContent = (META.best[pickedMode] || 0).toLocaleString("de-DE");
    $("btnResume").style.display = Store.get("save." + pickedMode, null) ? "" : "none";
  }
  function paintModeSwitch() {
    document.querySelectorAll("#modeSwitch .seg").forEach(el => {
      el.classList.toggle("on", el.dataset.val === BS.Themes.mode);
    });
    $("modeHint").textContent = BS.Themes.mode === "auto"
      ? "Folgt der Einstellung deines Handys — gerade " + (BS.Themes.isLight() ? "hell" : "dunkel")
      : (BS.Themes.mode === "light" ? "Helle Oberfläche" : "Dunkle Oberfläche");
  }

  function paintThemes() {
    paintModeSwitch();
    const wrap = $("themeList");
    wrap.innerHTML = "";
    const light = BS.Themes.isLight();
    BS.Themes.list().forEach(t => {
      const b = document.createElement("button");
      b.className = "theme" + (t.id === BS.Themes.id ? " on" : "");

      const left = document.createElement("span"); left.className = "tinfo";
      const nm = document.createElement("span"); nm.className = "tn"; nm.textContent = t.name;
      const hi = document.createElement("span"); hi.className = "th"; hi.textContent = t.hint;
      left.appendChild(nm); left.appendChild(hi);

      const sw = document.createElement("span"); sw.className = "swatches";
      sw.style.background = light ? t.bgLight : t.bgDark;
      (light ? t.light : t.dark).forEach(c => {
        const d = document.createElement("i"); d.style.background = c.f; sw.appendChild(d);
      });

      b.appendChild(left); b.appendChild(sw);
      b.onclick = () => { BS.Themes.set(t.id); BS.SFX.tap(); paintThemes(); };
      wrap.appendChild(b);
    });
  }
  function paintStats() {
    $("tBestN").textContent = (META.best.normal || 0).toLocaleString("de-DE");
    $("tBestE").textContent = (META.best.extreme || 0).toLocaleString("de-DE");
    $("tBestC").textContent = (META.best.chaos || 0).toLocaleString("de-DE");
    $("tCombo").textContent = "×" + META.bestStreak;
    $("tChain").textContent = "×" + META.bestChain;
    $("tPerfect").textContent = META.perfect;
    $("tLines").textContent = META.lines.toLocaleString("de-DE");
    $("tRings").textContent = META.bestRings;
    $("tGames").textContent = (META.games.normal || 0) + (META.games.extreme || 0) + (META.games.chaos || 0);
  }

  function bindSwitch(id, key) {
    const el = $(id);
    el.classList.toggle("on", !!Opt[key]);
    el.onclick = () => {
      Opt[key] = !Opt[key];
      el.classList.toggle("on", Opt[key]);
      Store.set("o." + key, Opt[key]);
      BS.SFX.on = Opt.sound; BS.SFX.haptic = Opt.haptic; BS.FX.full = Opt.fx;
      if (key === "sound" && Opt.sound) { BS.SFX.ctx(); BS.SFX.tap(); }
      if (key === "haptic" && Opt.haptic) BS.SFX.buzz(12);
    };
  }

  function boot() {
    BS.SFX.on = Opt.sound; BS.SFX.haptic = Opt.haptic; BS.FX.full = Opt.fx;
    BS.Themes.mode = Store.get("themeMode", "dark");
    BS.Themes.set(Store.get("theme", "schiefer"), true);
    BS.Themes.watch();
    resize();
    BS.Input.attach(cv);

    document.querySelectorAll(".mode").forEach(el => {
      el.onclick = () => { pickedMode = el.dataset.mode; Store.set("mode", pickedMode); BS.SFX.tap(); paintModeCards(); };
    });

    $("btnPlay").onclick = () => { BS.SFX.ctx(); BS.SFX.tap(); newGame(pickedMode); hide("scStart"); };
    $("btnResume").onclick = () => { BS.SFX.ctx(); BS.SFX.tap(); if (!loadSave(pickedMode)) newGame(pickedMode); hide("scStart"); };
    $("btnRules").onclick = () => { BS.SFX.tap(); show("scRules"); };
    $("btnRulesBack").onclick = () => { BS.SFX.tap(); hide("scRules"); };
    $("btnStats").onclick = () => { BS.SFX.tap(); paintStats(); show("scStats"); };
    $("btnStatsBack").onclick = () => { BS.SFX.tap(); hide("scStats"); };
    $("btnSettings").onclick = () => { BS.SFX.tap(); paintThemes(); show("scOpt"); };
    $("btnPSettings").onclick = () => { BS.SFX.tap(); paintThemes(); show("scOpt"); };
    $("btnOptBack").onclick = () => { BS.SFX.tap(); hide("scOpt"); };

    $("btnPause").onclick = () => {
      if (!S.running || S.over) return;
      S.paused = true; $("pScore").textContent = S.score.toLocaleString("de-DE");
      BS.SFX.tap(); show("scPause");
    };
    $("btnContinue").onclick = () => { S.paused = false; BS.SFX.tap(); hide("scPause"); };
    $("btnQuit").onclick = () => { S.paused = false; hide("scPause"); gameOver(); };
    $("btnAgain").onclick = () => { BS.SFX.tap(); newGame(S.mode); hide("scOver"); };
    $("btnHome").onclick = () => { BS.SFX.tap(); hide("scOver"); pickedMode = S.mode; paintModeCards(); show("scStart"); };

    $("pwHammer").onclick = () => {
      if (!BS.Game.acceptsInput()) return;
      if (S.hammer <= 0) { toast("Kein Hammer — alle 18.000 Punkte gibt es einen"); BS.SFX.bad(); return; }
      S.hammerMode = !S.hammerMode; BS.SFX.tap(); hud();
      if (S.hammerMode) toast("Block antippen zum Entfernen");
    };
    $("pwSwap").onclick = () => {
      if (!BS.Game.acceptsInput()) return;
      if (S.swap <= 0) { toast("Kein Tausch — alle 13.000 Punkte gibt es einen"); BS.SFX.bad(); return; }
      S.swap--; S.hammerMode = false;
      const keep = S.tray.map(p => !!p);
      S.assistNext = true;
      refill();
      for (let i = 0; i < S.tray.length; i++) if (keep[i] === false) S.tray[i] = null;
      BS.SFX.power(); BS.SFX.buzz(12); hud(); save();
      if (!anyMove()) gameOver();
    };

    document.querySelectorAll("#modeSwitch .seg").forEach(el => {
      el.onclick = () => { BS.Themes.setMode(el.dataset.val); BS.SFX.tap(); paintThemes(); };
    });

    ["swSound|sound", "swHaptic|haptic", "swFx|fx", "swSnap|snap", "swHint|hint"]
      .forEach(s => { const p = s.split("|"); bindSwitch(p[0], p[1]); });

    $("btnWipe").onclick = () => {
      if (!confirm("Alle Highscores und Statistiken löschen?")) return;
      META.best = { normal: 0, extreme: 0, chaos: 0 };
      META.games = { normal: 0, extreme: 0, chaos: 0 };
      META.lines = 0; META.perfect = 0; META.bestStreak = 0; META.bestChain = 0; META.bestRings = 0;
      ["best", "games", "lines", "perfect", "bestStreak", "bestChain", "bestRings",
        "save.normal", "save.extreme", "save.chaos"].forEach(k => Store.del(k));
      paintModeCards(); paintStats(); hud(); toast("Alles zurückgesetzt");
    };

    document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
    window.addEventListener("pagehide", save);

    paintModeCards(); paintThemes(); hud();
    requestAnimationFrame(frame);

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
    }
  }
})();
