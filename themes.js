/* ===========================================================================
   themes.js — Farbwelten

   Sechs Themes, jedes mit Hell- und Dunkelmodus. Die Blockfarben gehören zum
   Theme, die Oberflächentöne zum Modus. Eine Form bekommt in jedem Theme
   denselben Farbplatz, nur mit anderen Werten.

   Für den Hellmodus werden die Blockfarben automatisch etwas vertieft, damit
   sie auf hellem Grund genauso satt wirken wie auf dunklem.
   ========================================================================= */
(function () {
  const BS = (window.BS = window.BS || {});

  /* ------------------------------------------------------------ Farbhelfer */
  function toRGB(h) {
    h = (h || "#888888").replace("#", "");
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  const hex = a => "#" + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  /* amt < 0 verdunkelt, amt > 0 hellt auf */
  function shade(h, amt) {
    const c = toRGB(h);
    return hex(c.map(v => amt < 0 ? v * (1 + amt) : v + (255 - v) * amt));
  }
  /* etwas mehr Farbe reinziehen, ohne die Helligkeit zu kippen */
  function sat(h, amt) {
    const c = toRGB(h), m = (c[0] + c[1] + c[2]) / 3;
    return hex(c.map(v => m + (v - m) * (1 + amt)));
  }

  /* --------------------------------------------------------- Oberflächentöne */
  function darkUI(bg, bg2, panel, acc, gold) {
    return {
      light: false,
      bg, bg2, panel,
      ink: "#eef1f8", dim: "#8b93a8",
      acc, gold, onAcc: "#0e2129",
      soft: "rgba(255,255,255,.06)", softHi: "rgba(255,255,255,.12)",
      line: "rgba(255,255,255,.07)", shadow: "rgba(0,0,0,.35)",
      frame: "rgba(0,0,0,.20)", frameLine: "rgba(255,255,255,.06)",
      hole: "rgba(0,0,0,.30)", holeLip: "rgba(255,255,255,.04)",
      outline: "rgba(12,14,22,.6)", ghostBad: "rgba(226,96,108,.16)",
      gloss: 0.20, flash: "255,255,255", flashK: 0.18
    };
  }
  function lightUI(bg, bg2, panel, acc, gold, ink) {
    return {
      light: true,
      bg, bg2, panel,
      ink: ink || "#1e2433", dim: "#6f7789",
      acc, gold, onAcc: "#ffffff",
      soft: "rgba(24,32,52,.055)", softHi: "rgba(24,32,52,.11)",
      line: "rgba(24,32,52,.09)", shadow: "rgba(40,50,70,.16)",
      frame: "rgba(24,32,52,.05)", frameLine: "rgba(24,32,52,.08)",
      hole: "rgba(24,32,52,.085)", holeLip: "rgba(255,255,255,.55)",
      outline: "rgba(255,255,255,.8)", ghostBad: "rgba(200,70,84,.14)",
      gloss: 0.14, flash: "255,255,255", flashK: 0.30
    };
  }

  /* ------------------------------------------------------------------ Themes */
  const DEF = {
    schiefer: {
      name: "Schiefer", hint: "Ruhig und neutral",
      dark: darkUI("#121520", "#1c2132", "#1c2030", "#6fb4d8", "#e0bb6a"),
      light: lightUI("#f5f7fb", "#e9edf5", "#ffffff", "#3d89b2", "#b07f28"),
      blocks: [
        { l: "#f5a3a8", f: "#e2606c", d: "#a03f4a" },
        { l: "#f8c493", f: "#ea9250", d: "#a86336" },
        { l: "#f4dc99", f: "#e0bb56", d: "#9e8237" },
        { l: "#a5dcb1", f: "#5cba81", d: "#3c8058" },
        { l: "#9dd5e8", f: "#4ea9cd", d: "#33718d" },
        { l: "#a9b3e6", f: "#6478d0", d: "#414c91" },
        { l: "#c7b1e2", f: "#9877cc", d: "#64508f" },
        { l: "#eab0cb", f: "#d47da8", d: "#8f5273" }
      ]
    },

    pastell: {
      name: "Pastell", hint: "Weich und freundlich",
      dark: darkUI("#1e1a24", "#2a2534", "#2a2636", "#b6bfe4", "#e5d6a0"),
      light: lightUI("#fcf8fa", "#f3edf3", "#ffffff", "#7b86c9", "#b39450", "#3a3340"),
      blocks: [
        { l: "#ffe9ee", f: "#ffd1dc", d: "#d79aa9" },
        { l: "#ffefdd", f: "#ffdac1", d: "#d6a889" },
        { l: "#fffbd8", f: "#fff5ba", d: "#d4c77e" },
        { l: "#d8f4e9", f: "#b5ead7", d: "#7fbca6" },
        { l: "#cef4f3", f: "#a0e7e5", d: "#6cb6b4" },
        { l: "#e0e4f5", f: "#c7ceea", d: "#8f97c0" },
        { l: "#eddff5", f: "#dcc0ea", d: "#a688b8" },
        { l: "#ffe2e9", f: "#ffc2d1", d: "#d18e9f" }
      ]
    },

    sonnenaufgang: {
      name: "Sonnenaufgang", hint: "Warm und weich",
      dark: darkUI("#1b1418", "#2b1e22", "#2a2026", "#e8916d", "#e8b85c"),
      light: lightUI("#fff8f3", "#fbeee5", "#ffffff", "#cf6438", "#ab7d2a", "#3a2a24"),
      blocks: [
        { l: "#ffb0a3", f: "#f0634f", d: "#a63c2d" },
        { l: "#ffc899", f: "#f2924a", d: "#a86128" },
        { l: "#ffdf9e", f: "#f0bb54", d: "#a78033" },
        { l: "#ffd0b8", f: "#f09a72", d: "#a86347" },
        { l: "#f7b4c4", f: "#e0708f", d: "#96455c" },
        { l: "#d7aecd", f: "#b06a9e", d: "#754269" },
        { l: "#f3c8a0", f: "#dd9a55", d: "#956434" },
        { l: "#a9cfc9", f: "#59a49a", d: "#376e66" }
      ]
    },

    wald: {
      name: "Wald", hint: "Erdig und ruhig",
      dark: darkUI("#101710", "#1a2418", "#1b2419", "#82c074", "#d9b96a"),
      light: lightUI("#f5f9f2", "#e9f1e4", "#ffffff", "#4a8c40", "#9d8033", "#22301f"),
      blocks: [
        { l: "#a8d99a", f: "#5da84c", d: "#3b6f2f" },
        { l: "#c6dd96", f: "#94b84a", d: "#617a2c" },
        { l: "#e0d194", f: "#c0a84c", d: "#7d6d2c" },
        { l: "#a0cfb4", f: "#4fa376", d: "#2f6c4b" },
        { l: "#9ec9c9", f: "#4d9a9a", d: "#2f6565" },
        { l: "#d3b79a", f: "#ab7f52", d: "#6f5033" },
        { l: "#c8b8d0", f: "#8f76a3", d: "#5b496b" },
        { l: "#e8b8a0", f: "#cc7f5c", d: "#85503a" }
      ]
    },

    ozean: {
      name: "Ozean", hint: "Kühl und klar",
      dark: darkUI("#0d1620", "#152430", "#16232e", "#58b0c9", "#ddbb78"),
      light: lightUI("#f3f9fc", "#e5f0f6", "#ffffff", "#2d86a2", "#9d7d2c", "#172833"),
      blocks: [
        { l: "#9fd8ea", f: "#4aabcf", d: "#2e7290" },
        { l: "#9ac6e8", f: "#4a86c6", d: "#2d5786" },
        { l: "#a4d9d1", f: "#4faca0", d: "#2f7269" },
        { l: "#b4c9ea", f: "#6a87c9", d: "#425689" },
        { l: "#ead9b0", f: "#cfb163", d: "#8b7438" },
        { l: "#b0c2d4", f: "#6d87a0", d: "#445769" },
        { l: "#c3b4e0", f: "#8674c4", d: "#554785" },
        { l: "#f0b6b6", f: "#d97070", d: "#8f4444" }
      ]
    },

    neon: {
      name: "Neon", hint: "Laut und leuchtend",
      dark: darkUI("#07080f", "#0e1122", "#141833", "#4fe8ff", "#ffd23f"),
      light: lightUI("#f1f2f8", "#e3e6f1", "#ffffff", "#0c9fbd", "#bd8c00", "#14162a"),
      blocks: [
        { l: "#ff8b96", f: "#ff2d55", d: "#a3001f" },
        { l: "#ffbb63", f: "#ff8a00", d: "#a34f00" },
        { l: "#fff07d", f: "#ffd60a", d: "#a38400" },
        { l: "#7dffb0", f: "#00e676", d: "#008f42" },
        { l: "#7df0ff", f: "#00d4ff", d: "#0082a3" },
        { l: "#8f9dff", f: "#3d5afe", d: "#1a2ba3" },
        { l: "#d09bff", f: "#aa00ff", d: "#6600a3" },
        { l: "#ff9bd8", f: "#ff2d95", d: "#a3005a" }
      ]
    }
  };

  /* Hellmodus-Blöcke ableiten: etwas tiefer und satter, damit sie
     auf hellem Grund nicht ausgewaschen wirken */
  Object.values(DEF).forEach(t => {
    t.blocksLight = t.blocks.map(c => ({
      l: sat(shade(c.l, -0.14), 0.1),
      f: sat(shade(c.f, -0.10), 0.12),
      d: sat(shade(c.d, -0.02), 0.08)
    }));
  });

  BS.THEMES = DEF;

  /* --------------------------------------------------------------- Verwaltung */
  BS.Themes = {
    id: "schiefer",
    mode: "dark",          /* "dark" | "light" | "auto" */

    list() {
      return Object.keys(DEF).map(k => ({
        id: k, name: DEF[k].name, hint: DEF[k].hint,
        dark: DEF[k].blocks, light: DEF[k].blocksLight,
        bgDark: DEF[k].dark.bg, bgLight: DEF[k].light.bg
      }));
    },

    prefersLight() {
      try { return window.matchMedia("(prefers-color-scheme: light)").matches; } catch (e) { return false; }
    },
    resolved() { return this.mode === "auto" ? (this.prefersLight() ? "light" : "dark") : this.mode; },
    isLight() { return this.resolved() === "light"; },

    theme() { return DEF[this.id] || DEF.schiefer; },
    ui() { return this.theme()[this.resolved()]; },
    colors() { const t = this.theme(); return this.isLight() ? t.blocksLight : t.blocks; },
    key() { return this.id + "-" + this.resolved(); },

    apply() {
      const u = this.ui(), r = document.documentElement.style;
      const vars = {
        "--bg": u.bg, "--bg2": u.bg2, "--panel": u.panel, "--ink": u.ink, "--dim": u.dim,
        "--acc": u.acc, "--gold": u.gold, "--on-acc": u.onAcc,
        "--soft": u.soft, "--soft-hi": u.softHi, "--line": u.line, "--shadow": u.shadow
      };
      Object.keys(vars).forEach(k => r.setProperty(k, vars[k]));
      document.body.classList.toggle("light", u.light);
      const m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute("content", u.bg);
      if (BS.Render) BS.Render.invalidate();
      if (BS.onThemeChange) BS.onThemeChange();
    },

    set(id, silent) {
      if (DEF[id]) this.id = id;
      this.apply();
      if (!silent && BS.Store) BS.Store.set("theme", this.id);
    },
    setMode(m, silent) {
      if (["dark", "light", "auto"].indexOf(m) >= 0) this.mode = m;
      this.apply();
      if (!silent && BS.Store) BS.Store.set("themeMode", this.mode);
    },

    /* Systemwechsel im Automatikmodus mitbekommen */
    watch() {
      try {
        window.matchMedia("(prefers-color-scheme: light)")
          .addEventListener("change", () => { if (this.mode === "auto") this.apply(); });
      } catch (e) {}
    }
  };
})();
