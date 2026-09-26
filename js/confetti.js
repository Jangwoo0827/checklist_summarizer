(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};

  var DURATION_MS = 2400;
  var FADE_MS = 600;
  var COUNT = 150;
  var EXTRA_COLORS = ["#e8b04b", "#e07a5f", "#6aa9d8", "#b58ad6", "#f2d0a4"];

  // Two bursts from the bottom corners, arcing inward. Skipped under reduced motion.
  function burst() {
    if (root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var doc = root.document;
    var W = root.innerWidth;
    var H = root.innerHeight;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var canvas = doc.createElement("canvas");
    canvas.className = "confetti";
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    doc.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    var accent = getComputedStyle(doc.documentElement).getPropertyValue("--accent").trim() || "#2f5d50";
    var colors = [accent, accent].concat(EXTRA_COLORS);
    var gravity = 0.32 * (H / 800);
    var parts = [];
    for (var i = 0; i < COUNT; i++) {
      var fromLeft = i % 2 === 0;
      var spread = 0.12 + Math.random() * 0.5;
      var angle = -Math.PI / 2 + (fromLeft ? spread : -spread);
      var speed = H * (0.017 + Math.random() * 0.013);
      parts.push({
        x: fromLeft ? W * 0.08 : W * 0.92,
        y: H + 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 5 + Math.random() * 5,
        h: 8 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    var start = null;
    var last = null;
    function frame(t) {
      if (start === null) { start = t; last = t; }
      var elapsed = t - start;
      var step = Math.min((t - last) / 16.67, 3); // frame-rate independent, capped after tab switches
      last = t;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = elapsed > DURATION_MS - FADE_MS ? Math.max(0, (DURATION_MS - elapsed) / FADE_MS) : 1;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.vy += gravity * step;
        p.vx *= Math.pow(0.99, step);
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.rot += p.vr * step;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        // Squash with rotation so pieces read as tumbling paper rather than flat stickers.
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.7)) + 1);
        ctx.restore();
      }
      if (elapsed < DURATION_MS) root.requestAnimationFrame(frame);
      else canvas.remove();
    }
    root.requestAnimationFrame(frame);
  }

  CN.confetti = { burst: burst };
})(window);
