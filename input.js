/* ===========================================================================
   input.js — Ziehen und Ablegen

   Kernstück ist der dynamische vertikale Offset: direkt an der Ablage bleibt
   das Teil nah am Finger und reagiert direkt. Je weiter der Finger nach oben
   ins Feld wandert, desto weiter schwebt das Teil über ihm, damit die
   Zielzelle nie unter dem Daumen verschwindet. Der Offset wird pro Frame
   weich nachgezogen, nie hart gesetzt.
   ========================================================================= */
(function () {
  const BS = (window.BS = window.BS || {});

  /* Zentral einstellbar — nach Gerätetest hier nachjustieren */
  const CFG = BS.DRAG_CFG = {
    baseOffset: 0.95,   /* Zellen Abstand direkt beim Aufnehmen  */
    maxExtra: 2.15,   /* zusätzliche Zellen oben im Feld       */
    followRate: 0.30,   /* wie schnell der Offset nachzieht      */
    snapRadius: 2.1,    /* max. quadratischer Abstand fürs Snappen */
    liftScale: 1.06    /* leichtes Vergrößern beim Anheben      */
  };

  const SNAP = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

  const drag = BS.drag = {
    on: false, slot: -1, id: null,
    px: 0, py: 0,        /* Fingerposition            */
    offset: 0, target: 0, /* aktueller / Ziel-Offset  */
    gx: 0, gy: 0, ok: false,
    lift: 0
  };

  /* Wie weit oben ist der Finger? 0 = Ablage, 1 = oberer Feldrand */
  function heightFactor(py) {
    const L = BS.L;
    const bottom = L.trayY;
    const top = L.y;
    if (bottom <= top) return 1;
    return BS.clamp((bottom - py) / (bottom - top), 0, 1);
  }

  function recalc() {
    const p = BS.Game.tray()[drag.slot];
    if (!p) return;
    const L = BS.L, sh = p.sh;
    const fx = (drag.px - L.bx - sh.w * L.cell / 2) / L.cell;
    const fy = (drag.py - drag.offset - L.by - sh.h * L.cell / 2) / L.cell;
    const rx = Math.round(fx), ry = Math.round(fy);

    if (BS.Game.canPlaceAt(p, rx, ry)) { drag.gx = rx; drag.gy = ry; drag.ok = true; return; }

    if (BS.Opt.snap) {
      let best = null, bd = 1e9;
      for (const o of SNAP) {
        const x = rx + o[0], y = ry + o[1];
        if (!BS.Game.canPlaceAt(p, x, y)) continue;
        const d = (x - fx) * (x - fx) + (y - fy) * (y - fy);
        if (d < bd) { bd = d; best = [x, y]; }
      }
      if (best && bd < CFG.snapRadius) { drag.gx = best[0]; drag.gy = best[1]; drag.ok = true; return; }
    }
    drag.gx = rx; drag.gy = ry; drag.ok = false;
  }

  /* Pro Frame: Offset weich nachziehen, dann Zielzelle neu bestimmen */
  BS.Input = {
    update(dt) {
      if (!drag.on) { drag.lift = BS.approach(drag.lift, 0, 0.25, dt); return; }
      const L = BS.L;
      drag.target = (CFG.baseOffset + CFG.maxExtra * BS.Ease.outCubic(heightFactor(drag.py))) * L.cell;
      drag.offset = BS.approach(drag.offset, drag.target, CFG.followRate, dt);
      drag.lift = BS.approach(drag.lift, 1, 0.3, dt);
      recalc();
    },

    attach(cv) {
      const pt = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

      cv.addEventListener("pointerdown", e => {
        if (!BS.Game.acceptsInput()) return;
        BS.SFX.ctx();
        const p = pt(e);

        if (BS.Game.hammerTap(p)) return;

        const hit = BS.Game.trayHit(p);
        if (hit >= 0) {
          drag.on = true; drag.slot = hit; drag.id = e.pointerId;
          drag.px = p.x; drag.py = p.y;
          drag.lift = 0;
          /* Start leicht unter dem Zielwert, damit das Anheben sichtbar wird */
          drag.offset = BS.DRAG_CFG.baseOffset * BS.L.cell * 0.45;
          drag.target = drag.offset;
          try { cv.setPointerCapture(e.pointerId); } catch (_) {}
          BS.SFX.lift(); BS.SFX.buzz(5);
          recalc();
        }
      }, { passive: true });

      cv.addEventListener("pointermove", e => {
        if (!drag.on || e.pointerId !== drag.id) return;
        const p = pt(e);
        drag.px = p.x; drag.py = p.y;
      }, { passive: true });

      const end = e => {
        if (!drag.on) return;
        const slot = drag.slot, ok = drag.ok, gx = drag.gx, gy = drag.gy;
        drag.on = false; drag.slot = -1; drag.id = null; drag.ok = false;
        try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
        if (ok) BS.Game.place(slot, gx, gy);
        else BS.SFX.bad();
      };
      cv.addEventListener("pointerup", end);
      cv.addEventListener("pointercancel", () => { drag.on = false; drag.slot = -1; drag.ok = false; });
    }
  };
})();
