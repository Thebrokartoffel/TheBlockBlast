/* ===========================================================================
   animations.js — Easing, Partikel, Popups, Banner, Screen-Shake, Sound
   und das Zeichnen der Blöcke (Sprite-Cache).
   ========================================================================= */
(function () {
  const BS = (window.BS = window.BS || {});

  /* ------------------------------------------------------------------ Easing */
  const Ease = BS.Ease = {
    outCubic: t => 1 - Math.pow(1 - t, 3),
    outQuint: t => 1 - Math.pow(1 - t, 5),
    inOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    outBack: t => { const c = 1.70158, s = c + 1; return 1 + s * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outElastic: t => {
      if (t === 0 || t === 1) return t;
      const p = 2 * Math.PI / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * p) + 1;
    }
  };
  const lerp = BS.lerp = (a, b, t) => a + (b - a) * t;
  const clamp = BS.clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* Weiche Nachführung, bildratenunabhängig */
  BS.approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.pow(1 - rate, dt * 60));

  function hexA(hex, a) {
    const h = (hex || "#ffffff").replace("#", "");
    return "rgba(" + parseInt(h.substr(0, 2), 16) + "," + parseInt(h.substr(2, 2), 16) + "," + parseInt(h.substr(4, 2), 16) + "," + a + ")";
  }
  BS.hexA = hexA;

  /* ------------------------------------------------------------------- Sound */
  let AC = null;
  const SFX = BS.SFX = {
    on: true,
    haptic: true,
    ctx() {
      if (!this.on) return null;
      if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (AC.state === "suspended") AC.resume();
      return AC;
    },
    tone(freq, dur, type, vol, slide) {
      const ac = this.ctx(); if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, ac.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + dur);
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, ac.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + dur + 0.02);
    },
    noise(dur, vol, cut) {
      const ac = this.ctx(); if (!ac) return;
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cut || 1200;
      const g = ac.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
    },
    buzz(p) { if (this.haptic && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } },

    tap() { this.tone(420, 0.045, "triangle", 0.06); },
    lift() { this.tone(560, 0.05, "sine", 0.06); },
    place(n) { this.tone(150 + n * 16, 0.085, "square", 0.09, 40); },
    bad() { this.tone(140, 0.11, "sawtooth", 0.06, -50); },
    clear(step) {
      const b = 440 * Math.pow(1.0595, Math.min(step, 24) * 2);
      this.tone(b, 0.14, "triangle", 0.13);
      setTimeout(() => this.tone(b * 1.5, 0.16, "sine", 0.09), 50);
    },
    boom() { this.noise(0.34, 0.2); this.tone(85, 0.3, "sine", 0.15, -40); },
    power() { this.tone(620, 0.09, "square", 0.08); setTimeout(() => this.tone(930, 0.12, "square", 0.07), 65); },
    zoomOut() { [0, 90, 180, 270].forEach((d, i) => setTimeout(() => this.tone(220 * Math.pow(1.18, i), 0.26, "sine", 0.1), d)); },
    zoomIn() { [0, 90, 180].forEach((d, i) => setTimeout(() => this.tone(520 / Math.pow(1.2, i), 0.24, "sine", 0.09), d)); },
    chaos() { this.noise(0.2, 0.12, 2600); this.tone(330, 0.18, "sawtooth", 0.08, 180); },
    perfect() { [0, 105, 210, 315, 430].forEach((d, i) => setTimeout(() => this.tone(523 * Math.pow(1.26, i), 0.3, "triangle", 0.13), d)); },
    over() { [0, 130, 260].forEach((d, i) => setTimeout(() => this.tone(320 / (1 + i * 0.32), 0.36, "sawtooth", 0.1, -35), d)); }
  };

  /* ------------------------------------------------------- Rendering der Blöcke */
  function path(o, x, y, w, h, r) {
    o.beginPath();
    if (o.roundRect) { o.roundRect(x, y, w, h, r); return; }
    r = Math.min(r, w / 2, h / 2);
    o.moveTo(x + r, y); o.arcTo(x + w, y, x + w, y + h, r); o.arcTo(x + w, y + h, x, y + h, r);
    o.arcTo(x, y + h, x, y, r); o.arcTo(x, y, x + w, y, r); o.closePath();
  }
  BS.path = path;

  const cache = new Map();
  const Render = BS.Render = {
    dpr: 1,
    invalidate() { cache.clear(); },

    /* Klotziger Block: dunkle Grundfase, helle Lichtfase oben links,
       satte Frontfläche. Füllt die Zelle komplett aus. */
    paint(o, s, col) {
      const r = s * 0.26, b = s * 0.19;
      const gloss = BS.Themes.ui().gloss;
      o.fillStyle = col.d; path(o, 0, 0, s, s, r); o.fill();
      o.fillStyle = col.l; path(o, 0, 0, s - b * 0.9, s - b * 0.9, r); o.fill();
      o.fillStyle = col.f; path(o, b * 0.58, b * 0.58, s - b * 1.16, s - b * 1.16, r * 0.74); o.fill();
      o.fillStyle = "rgba(255,255,255," + gloss + ")";
      path(o, b * 0.58 + s * 0.06, b * 0.58 + s * 0.05, s - b * 1.16 - s * 0.12, s * 0.09, s * 0.045); o.fill();
    },

    sprite(slot, s) {
      const size = Math.max(4, Math.round(s));
      const key = BS.Themes.key() + "|" + slot + "|" + size;
      let c = cache.get(key);
      if (c) return c;
      if (cache.size > 160) cache.clear();
      c = document.createElement("canvas");
      c.width = Math.ceil(size * this.dpr); c.height = Math.ceil(size * this.dpr);
      const o = c.getContext("2d");
      o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.paint(o, size, BS.Themes.colors()[slot % 8]);
      cache.set(key, c);
      return c;
    },

    block(ctx, x, y, s, slot, sp, alpha, glow) {
      ctx.save();
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      if (glow) { ctx.shadowColor = BS.Themes.colors()[slot % 8].f; ctx.shadowBlur = s * 0.45; }
      ctx.drawImage(this.sprite(slot, s), x, y, s, s);
      ctx.shadowBlur = 0;
      if (sp) this.special(ctx, x + s / 2, y + s / 2, s, sp);
      ctx.restore();
    },

    /* Symbole bewusst ohne spitze Ecken */
    special(ctx, cx, cy, s, sp) {
      const t = performance.now() / 1000;
      ctx.save();
      ctx.translate(cx, cy);
      const k = 1 + Math.sin(t * 2.6) * 0.04;
      ctx.scale(k, k);
      ctx.fillStyle = "rgba(255,255,255,.93)";
      if (sp === "gem") {
        ctx.rotate(Math.PI / 4);
        const a = s * 0.30;
        path(ctx, -a / 2, -a / 2, a, a, a * 0.3); ctx.fill();
        ctx.fillStyle = "rgba(28,32,48,.16)";
        const c2 = s * 0.14;
        path(ctx, -c2 / 2, -c2 / 2, c2, c2, c2 * 0.3); ctx.fill();
      } else if (sp === "star") {
        const R = s * 0.27, c = R * 0.36;
        ctx.beginPath();
        ctx.moveTo(0, -R);
        ctx.quadraticCurveTo(c, -c, R, 0);
        ctx.quadraticCurveTo(c, c, 0, R);
        ctx.quadraticCurveTo(-c, c, -R, 0);
        ctx.quadraticCurveTo(-c, -c, 0, -R);
        ctx.closePath(); ctx.fill();
      } else if (sp === "bomb") {
        ctx.fillStyle = "rgba(26,30,45,.85)";
        ctx.beginPath(); ctx.arc(0, s * 0.02, s * 0.21, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.8)";
        ctx.beginPath(); ctx.arc(-s * 0.07, -s * 0.05, s * 0.06, 0, 7); ctx.fill();
      } else if (sp === "x2") {
        ctx.fillStyle = "rgba(26,30,45,.5)";
        path(ctx, -s * 0.25, -s * 0.15, s * 0.5, s * 0.3, s * 0.15); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "700 " + (s * 0.27) + "px " + BS.FAM;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("×2", 0, s * 0.01);
      } else if (sp === "wild") {
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(26,30,45,.55)";
        ctx.beginPath(); ctx.arc(0, 0, s * 0.09, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  };

  /* ----------------------------------------------------------------- Effekte */
  const FX = BS.FX = {
    parts: [], pops: [], banners: [], sparks: [],
    shake: 0, flash: 0, pulse: 0, full: true,

    reset() { this.parts.length = 0; this.pops.length = 0; this.banners.length = 0; this.sparks.length = 0; this.shake = 0; this.flash = 0; },

    burst(cx, cy, slot, amount, power, cell) {
      const C = BS.Themes.colors()[slot % 8];
      if (!this.full) amount = Math.ceil(amount * 0.4);
      for (let i = 0; i < amount; i++) {
        const a = Math.random() * Math.PI * 2, sp = (0.5 + Math.random() * 1.4) * power;
        this.parts.push({
          x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - power * 0.55,
          s: cell * (0.2 + Math.random() * 0.22), r: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.28, life: 1,
          decay: 0.011 + Math.random() * 0.009, f: C.f, l: C.l
        });
      }
      if (this.parts.length > 420) this.parts.splice(0, this.parts.length - 420);
    },

    confetti(x0, y0, w, h, cell) {
      const cols = BS.Themes.colors();
      for (let i = 0; i < 90; i++) {
        const C = cols[(Math.random() * cols.length) | 0];
        this.parts.push({
          x: x0 + Math.random() * w, y: y0 + Math.random() * h,
          vx: (Math.random() - 0.5) * 7, vy: -2 - Math.random() * 7,
          s: cell * (0.16 + Math.random() * 0.22), r: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.4, life: 1, decay: 0.008 + Math.random() * 0.006,
          f: C.f, l: C.l
        });
      }
    },

    /* Funken entlang einer gleich aufgehenden Linie */
    spark(x, y, col) {
      if (!this.full) return;
      this.sparks.push({
        x, y, vx: (Math.random() - 0.5) * 1.2, vy: -0.4 - Math.random() * 1.4,
        s: 1.5 + Math.random() * 2.5, life: 1, decay: 0.022 + Math.random() * 0.02, c: col
      });
      if (this.sparks.length > 160) this.sparks.splice(0, this.sparks.length - 160);
    },

    pop(x, y, text, color, size) { this.pops.push({ x, y, text, c: color || "#fff", s: size || 22, life: 1, vy: -1.2 }); },

    banner(text, color, sub, big) {
      this.banners.push({ text, sub: sub || "", c: color || "#fff", t: 0, life: 1, big: !!big });
      if (this.banners.length > 2) this.banners.shift();
    },

    kick(m) { this.shake = Math.max(this.shake, this.full ? m : m * 0.4); },

    update() {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.34; p.vx *= 0.985;
        p.r += p.vr; p.life -= p.decay;
        if (p.life <= 0) this.parts.splice(i, 1);
      }
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i];
        s.x += s.vx; s.y += s.vy; s.vy += 0.02; s.life -= s.decay;
        if (s.life <= 0) this.sparks.splice(i, 1);
      }
      for (let i = this.pops.length - 1; i >= 0; i--) {
        const p = this.pops[i];
        p.y += p.vy; p.vy *= 0.96; p.life -= 0.018;
        if (p.life <= 0) this.pops.splice(i, 1);
      }
      for (let i = this.banners.length - 1; i >= 0; i--) {
        const b = this.banners[i];
        b.t += 0.016; b.life -= b.big ? 0.009 : 0.013;
        if (b.life <= 0) this.banners.splice(i, 1);
      }
      if (this.shake > 0.3) this.shake *= 0.88; else this.shake = 0;
      if (this.flash > 0.01) this.flash *= 0.87; else this.flash = 0;
      this.pulse *= 0.9;
    },

    draw(ctx, W, H, L) {
      for (const p of this.parts) {
        ctx.save();
        ctx.globalAlpha = clamp(p.life * 1.4, 0, 1);
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.f; path(ctx, -p.s / 2, -p.s / 2, p.s, p.s, p.s * 0.34); ctx.fill();
        ctx.fillStyle = p.l; path(ctx, -p.s / 2, -p.s / 2, p.s * 0.58, p.s * 0.58, p.s * 0.28); ctx.fill();
        ctx.restore();
      }
      for (const s of this.sparks) {
        ctx.save();
        ctx.globalAlpha = clamp(s.life, 0, 1);
        ctx.fillStyle = s.c;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, 7); ctx.fill();
        ctx.restore();
      }
      for (const p of this.pops) {
        const k = Math.min(1, (1 - p.life) * 6);
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life * 1.7);
        ctx.font = "700 " + (p.s * (0.82 + 0.18 * Ease.outBack(k))) + "px " + BS.FAM;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 4; ctx.strokeStyle = BS.Themes.ui().outline;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.c; ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
      }
      for (let i = this.banners.length - 1; i >= 0; i--) {
        const b = this.banners[i];
        const inK = Math.min(1, b.t * 7);
        const sc = (b.big ? 0.62 : 0.78) + (b.big ? 0.38 : 0.22) * Ease.outBack(inK);
        const y = L.by + L.size * 0.2 - i * 42;
        ctx.save();
        ctx.globalAlpha = Math.min(1, b.life * 2.4);
        ctx.translate(L.cx, y); ctx.scale(sc, sc);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "700 " + (b.big ? 38 : 30) + "px " + BS.FAM;
        ctx.lineWidth = 5; ctx.strokeStyle = BS.Themes.ui().outline;
        ctx.strokeText(b.text, 0, 0);
        ctx.fillStyle = b.c; ctx.fillText(b.text, 0, 0);
        if (b.sub) {
          ctx.font = "600 12px " + BS.FAM;
          ctx.fillStyle = BS.Themes.ui().dim;
          ctx.fillText(b.sub.toUpperCase(), 0, b.big ? 30 : 24);
        }
        ctx.restore();
      }
    }
  };
})();
