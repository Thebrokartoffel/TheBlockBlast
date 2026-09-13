/* ===========================================================================
   modes.js — Normal, Extreme (Overdrive mit wachsendem Feld) und Chaos
   ========================================================================= */
(function () {
  const BS = (window.BS = window.BS || {});

  BS.MODES = {
    normal: { id: "normal", name: "Normal", mult: 1.0, desc: "Klassisch. 8×8, faire Teile, entspannt." },
    extreme: { id: "extreme", name: "Extreme", mult: 1.25, desc: "Große Combos sprengen das Feld auf. Mehr Risiko, mehr Punkte." },
    chaos: { id: "chaos", name: "Chaos", mult: 1.5, desc: "Ständig neue Zufallsereignisse. Kein Zug wie der andere." }
  };

  /* =========================================================================
     EXTREME — Overdrive

     Auslöser: drei oder mehr Linien in einem Zug, oder eine Serie von fünf.
     Danach drei Züge Sperre, damit es sich verdient anfühlt und nicht
     bei jedem Zug feuert. Das Kernfeld 8×8 bleibt immer erhalten.
     ======================================================================= */
  BS.Extreme = {
    MAX_RINGS: 3,
    RING: 2,                       /* Zellen Breite pro Ring je Seite */

    shouldExpand(S, nLines) {
      if (S.mode !== "extreme") return false;
      if (S.rings >= this.MAX_RINGS) return false;
      if (S.odCooldown > 0) return false;
      return nLines >= 3 || (S.streak >= 5 && S.streak % 5 === 0);
    },

    expand(S) {
      const oldN = S.N, add = this.RING, newN = oldN + add * 2;
      const nb = new Array(newN * newN).fill(null);
      for (let y = 0; y < oldN; y++)
        for (let x = 0; x < oldN; x++)
          nb[(y + add) * newN + (x + add)] = S.board[y * oldN + x];
      S.board = nb;
      S.N = newN;
      S.rings++;
      S.odCooldown = 3;
      S.coreOff = (newN - 8) / 2;
      return newN;
    },

    /* Liegt diese Reihe/Spalte komplett im äußersten Ring? */
    isOuterLine(S, i) {
      return S.rings > 0 && (i < this.RING || i >= S.N - this.RING);
    },

    /* Ring abtragen: die äußeren zwei Bänder verschwinden dauerhaft */
    peel(S) {
      const oldN = S.N, cut = this.RING, newN = oldN - cut * 2;
      if (newN < 8) return null;
      const lost = [];
      for (let y = 0; y < oldN; y++)
        for (let x = 0; x < oldN; x++) {
          const inside = x >= cut && y >= cut && x < oldN - cut && y < oldN - cut;
          if (!inside && S.board[y * oldN + x]) lost.push({ x, y, c: S.board[y * oldN + x] });
        }
      const nb = new Array(newN * newN).fill(null);
      for (let y = 0; y < newN; y++)
        for (let x = 0; x < newN; x++)
          nb[y * newN + x] = S.board[(y + cut) * oldN + (x + cut)];
      S.board = nb;
      S.N = newN;
      S.rings--;
      S.coreOff = (newN - 8) / 2;
      return lost;
    }
  };

  /* =========================================================================
     CHAOS — Zufallsereignisse

     Alle fünf bis acht Platzierungen, mit steigendem Score etwas häufiger.
     Jedes Ereignis wird kurz angekündigt, damit man reagieren kann.
     ======================================================================= */
  const EVENTS = [
    {
      id: "bomb", label: "BOMBEN-LIEFERUNG", hint: "Ein Teil bringt eine Bombe mit",
      run(S) { S.chaos.forceSpecial = "bomb"; }
    },
    {
      id: "wild", label: "WILDCARD", hint: "Ein Teil passt überall — auch über Blöcke",
      run(S) {
        const live = S.tray.map((p, i) => p ? i : -1).filter(i => i >= 0);
        if (!live.length) { S.chaos.forceWild = true; return; }
        const i = live[(Math.random() * live.length) | 0];
        S.tray[i].wild = true;
      }
    },
    {
      id: "shuffle", label: "BOARD-SHUFFLE", hint: "Alles wird neu gemischt",
      run(S) {
        const cells = [];
        for (let i = 0; i < S.board.length; i++) if (S.board[i] && !S.board[i].lock) { cells.push(S.board[i]); S.board[i] = null; }
        const free = [];
        for (let i = 0; i < S.board.length; i++) if (!S.board[i]) free.push(i);
        for (let i = free.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = free[i]; free[i] = free[j]; free[j] = t; }
        const now = performance.now();
        cells.forEach((c, k) => { c.t = now + k * 6; S.board[free[k]] = c; });
      }
    },
    {
      id: "rainbow", label: "RAINBOW-ROW", hint: "Diese Reihe zählt zehn Sekunden doppelt",
      run(S) {
        const cand = [];
        for (let y = 0; y < S.N; y++) { let e = 0; for (let x = 0; x < S.N; x++) if (!S.board[y * S.N + x]) e++; if (e > 0) cand.push(y); }
        if (!cand.length) return;
        S.chaos.rainbowRow = cand[(Math.random() * cand.length) | 0];
        S.chaos.rainbowUntil = performance.now() + 10000;
      }
    },
    {
      id: "freeze", label: "FROST", hint: "Eine Zelle ist drei Züge gesperrt",
      run(S) {
        const free = [];
        for (let i = 0; i < S.board.length; i++) if (!S.board[i]) free.push(i);
        if (!free.length) return;
        const i = free[(Math.random() * free.length) | 0];
        S.board[i] = { slot: 0, sp: null, lock: 3, t: performance.now(), clrAt: 0 };
      }
    },
    {
      id: "mystery", label: "MYSTERY-BLOCK", hint: "Ein Teil verwandelt sich beim Setzen",
      run(S) {
        const live = S.tray.map((p, i) => p ? i : -1).filter(i => i >= 0);
        if (!live.length) return;
        S.tray[live[(Math.random() * live.length) | 0]].mystery = true;
      }
    },
    {
      id: "double", label: "DOUBLE TROUBLE", hint: "Vier Teile statt drei",
      run(S) { S.chaos.doubleNext = true; }
    }
  ];

  BS.Chaos = {
    EVENTS,

    reset(S) {
      S.chaos = {
        next: 4 + ((Math.random() * 4) | 0),
        forceSpecial: null, forceWild: false, doubleNext: false,
        rainbowRow: -1, rainbowUntil: 0, last: ""
      };
    },

    rainbowActive(S) {
      return S.mode === "chaos" && S.chaos.rainbowRow >= 0 && performance.now() < S.chaos.rainbowUntil;
    },

    /* Nach jeder Platzierung aufrufen */
    tick(S) {
      if (S.mode !== "chaos") return null;
      /* Frost-Zellen abbauen */
      for (let i = 0; i < S.board.length; i++) {
        const c = S.board[i];
        if (c && c.lock) { c.lock--; if (c.lock <= 0) S.board[i] = null; }
      }
      if (S.chaos.rainbowRow >= 0 && performance.now() > S.chaos.rainbowUntil) S.chaos.rainbowRow = -1;

      S.chaos.next--;
      if (S.chaos.next > 0) return null;

      /* Frequenz steigt mit dem Score, bleibt aber atmungsfähig */
      const speed = Math.min(3, Math.floor(S.score / 25000));
      S.chaos.next = Math.max(3, 5 - speed) + ((Math.random() * 4) | 0);

      let ev, guard = 0;
      do { ev = EVENTS[(Math.random() * EVENTS.length) | 0]; guard++; }
      while (guard < 6 && ev.id === S.chaos.last);
      S.chaos.last = ev.id;
      ev.run(S);
      return ev;
    }
  };
})();
