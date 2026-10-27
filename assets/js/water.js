(function () {
  var canvas = document.getElementById("water");
  if (!canvas) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var CELL = 13;
  var cols = 0;
  var rows = 0;
  var dpr = 1;
  var raf = 0;
  var last = 0;
  var time = 0;
  var running = false;
  var ripples = [];
  var ambientTimer = 0;
  var warp = new Float32Array(0);
  var warpNext = new Float32Array(0);
  var energy = new Float32Array(0);
  var textBoxes = [];

  function hash(ix, iy) {
    var n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function fade(t) {
    return t * t * (3 - 2 * t);
  }

  function noise(x, y) {
    var x0 = Math.floor(x);
    var y0 = Math.floor(y);
    var tx = fade(x - x0);
    var ty = fade(y - y0);
    var a = hash(x0, y0);
    var b = hash(x0 + 1, y0);
    var c = hash(x0, y0 + 1);
    var d = hash(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }

  function fbm(x, y) {
    return noise(x, y) * 0.65 + noise(x * 2.05 + 4.2, y * 2.05 - 1.7) * 0.35;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.max(2, Math.ceil(w / CELL));
    rows = Math.max(2, Math.ceil(h / CELL));
    var n = cols * rows;
    warp = new Float32Array(n);
    warpNext = new Float32Array(n);
    energy = new Float32Array(n);
  }

  function splash(px, py, power) {
    ripples.push({
      x: px,
      y: py,
      age: 0,
      power: power,
      seed: Math.random() * Math.PI * 2,
      reach: 420 + Math.random() * 340,
      accel: 0.09 + Math.random() * 0.1,
      stretch: 0.94 + Math.random() * 0.1,
    });
    if (ripples.length > 14) ripples.shift();
    start();
  }

  function stamp(px, py, amount) {
    if (amount <= 0.02) return;
    var cx = px / CELL;
    var cy = py / CELL;
    var x0 = Math.max(0, Math.floor(cx) - 1);
    var y0 = Math.max(0, Math.floor(cy) - 1);
    var x1 = Math.min(cols - 1, x0 + 2);
    var y1 = Math.min(rows - 1, y0 + 2);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x + 0.5 - cx;
        var dy = y + 0.5 - cy;
        var fall = 1 - Math.sqrt(dx * dx + dy * dy) / 1.15;
        if (fall <= 0) continue;
        var i = y * cols + x;
        var hit = amount * fall;
        if (hit > energy[i]) energy[i] = hit;
        warp[i] += hit * 0.45;
      }
    }
  }

  function imprint() {
    energy.fill(0);
    for (var r = 0; r < ripples.length; r++) {
      var ripple = ripples[r];
      var growth = 1 - Math.exp(-ripple.age * ripple.accel);
      var fadeOut = Math.exp(-ripple.age * 0.55) * ripple.power;
      if (fadeOut < 0.04) continue;
      var steps = 36 + Math.floor(growth * 48);
      for (var s = 0; s < steps; s++) {
        var ang = (s / steps) * Math.PI * 2;
        var wobble = 1 + Math.sin(ang * 3 + ripple.seed) * 0.06;
        var radius = ripple.reach * growth * wobble;
        var ca = Math.cos(ang);
        var sa = Math.sin(ang) * ripple.stretch;
        var fx = ripple.x + ca * radius;
        var fy = ripple.y + sa * radius;
        var sea = fbm(fx * 0.02 + ripple.seed, fy * 0.02) - 0.5;
        var chaos = sea * growth * 18;
        stamp(fx + ca * chaos, fy + sa * chaos, fadeOut);
      }
    }
  }

  function settle() {
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        var sum = warp[i];
        var count = 1;
        if (x > 0) {
          sum += warp[i - 1];
          count++;
        }
        if (x < cols - 1) {
          sum += warp[i + 1];
          count++;
        }
        if (y > 0) {
          sum += warp[i - cols];
          count++;
        }
        if (y < rows - 1) {
          sum += warp[i + cols];
          count++;
        }
        var hold = 0.9 + hash(x, y) * 0.03;
        var value = (sum / count) * hold;
        warpNext[i] = value < 0.012 ? 0 : value;
      }
    }
    var swap = warp;
    warp = warpNext;
    warpNext = swap;
  }

  function measureText() {
    textBoxes = [];
    var roots = document.querySelectorAll("header, main, footer");
    for (var r = 0; r < roots.length; r++) {
      var walker = document.createTreeWalker(roots[r], NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (!node.textContent || !node.textContent.trim()) continue;
        var range = document.createRange();
        range.selectNodeContents(node);
        var rects = range.getClientRects();
        for (var i = 0; i < rects.length; i++) {
          var rect = rects[i];
          if (rect.width < 2 || rect.height < 2) continue;
          if (rect.bottom < -20 || rect.top > window.innerHeight + 20) continue;
          textBoxes.push({
            l: rect.left - 3,
            t: rect.top - 1,
            r: rect.right + 3,
            b: rect.bottom + 1,
          });
        }
      }
    }
  }

  function readingEase(px, py) {
    var nearest = 1;
    for (var i = 0; i < textBoxes.length; i++) {
      var box = textBoxes[i];
      var dx = px < box.l ? box.l - px : px > box.r ? px - box.r : 0;
      var dy = py < box.t ? box.t - py : py > box.b ? py - box.b : 0;
      var dist = dx === 0 && dy === 0 ? 0 : Math.sqrt(dx * dx + dy * dy);
      var fade = dist / 18;
      if (fade < nearest) nearest = fade;
      if (nearest === 0) return 0;
    }
    return nearest > 1 ? 1 : nearest;
  }

  function channel(value) {
    if (value < 0) return 0;
    if (value > 255) return 255;
    return Math.round(value);
  }

  function draw() {
    var viewW = window.innerWidth;
    var viewH = window.innerHeight;
    ctx.fillStyle = "#141311";
    ctx.fillRect(0, 0, viewW, viewH);
    measureText();
    ctx.font = "500 13px ui-monospace, Cascadia Mono, Segoe UI Mono, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (var y = 0; y < rows; y++) {
      var py = (y + 0.5) * CELL;
      if (py > viewH) break;
      for (var x = 0; x < cols; x++) {
        var px = (x + 0.5) * CELL;
        if (px > viewW) break;
        var i = y * cols + x;
        var swell = warp[i];
        var hit = energy[i];
        var n1 = fbm(x * 0.055 + time * 0.04 + swell * 0.9, y * 0.045 - time * 0.025);
        var n2 = fbm(x * 0.04 + n1 * 3.4 + swell * 1.8, y * 0.08 + n1 * 1.6 + time * 0.035);
        var chop = fbm(x * 0.16 + 2.4, y * 0.14 - time * 0.05 + n2);
        var wave = Math.sin(n1 * 7.2 + n2 * 4.4 + y * 0.1 + time * 0.42 + swell * 0.35);
        var crest = 0;
        if (wave > 0.22 && chop > 0.2) {
          crest = Math.pow((wave - 0.22) / 0.78, 1.15) * (0.4 + chop * 0.85);
        }
        if (crest < 0.16 && hit < 0.08 && swell < 0.16) continue;

        var glyph = "·";
        if (hit > 0.4 || crest > 0.82) glyph = "≈";
        else if (hit > 0.1 || crest > 0.4) glyph = "~";

        var tide = fbm(x * 0.018 + 5.4, y * 0.016 - time * 0.01);
        var mix = fade(tide);
        var splash = Math.min(1, hit);
        var greenR = 16 + crest * 14;
        var greenG = 92 + crest * 70;
        var greenB = 58 + crest * 18;
        var blueR = 22 + crest * 12;
        var blueG = 96 + crest * 36;
        var blueB = 150 + crest * 80;
        var red = greenR + (blueR - greenR) * mix;
        var green = greenG + (blueG - greenG) * mix;
        var blue = greenB + (blueB - greenB) * mix;
        if (splash > 0.05) {
          var splashR = 20 + mix * 18;
          var splashG = 164 - mix * 24;
          var splashB = 110 + mix * 100;
          red = red * (1 - splash) + splashR * splash;
          green = green * (1 - splash) + splashG * splash;
          blue = blue * (1 - splash) + splashB * splash;
        }
        var edge = fade(Math.min(1, crest / 0.85));
        var alpha = Math.min(0.62, 0.05 + edge * 0.4 + splash * 0.38 + swell * 0.08);
        var speak = readingEase(px, py);
        if (speak < 1) {
          var kept = 0.62 + 0.38 * speak;
          red *= kept;
          green *= kept;
          blue *= kept;
          alpha *= 0.5 + 0.5 * speak;
        }
        if (alpha < 0.05) continue;
        ctx.fillStyle =
          "rgba(" +
          channel(red) +
          "," +
          channel(green) +
          "," +
          channel(blue) +
          "," +
          alpha.toFixed(3) +
          ")";
        ctx.fillText(glyph, px, py);
      }
    }
  }

  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    time += dt;
    for (var i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += dt;
      if (ripples[i].age > 5.2) ripples.splice(i, 1);
    }
    if (!reduced.matches) {
      imprint();
      settle();
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(ambientTimer);
    ambientTimer = 0;
  }

  function scheduleAmbient() {
    clearTimeout(ambientTimer);
    if (reduced.matches || document.hidden) return;
    ambientTimer = setTimeout(function () {
      splash(
        CELL + Math.random() * Math.max(CELL, window.innerWidth - CELL * 2),
        CELL + Math.random() * Math.max(CELL, window.innerHeight - CELL * 2),
        0.75 + Math.random() * 0.45
      );
      scheduleAmbient();
    }, 2800 + Math.random() * 2600);
  }

  window.addEventListener("resize", resize);
  window.addEventListener(
    "pointerdown",
    function (event) {
      if (reduced.matches) return;
      splash(event.clientX, event.clientY, 1.35 + Math.random() * 0.4);
    },
    { passive: true }
  );
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else {
      start();
      scheduleAmbient();
    }
  });
  reduced.addEventListener("change", function () {
    if (reduced.matches) {
      stop();
      draw();
    } else {
      start();
      scheduleAmbient();
    }
  });

  resize();
  if (reduced.matches) draw();
  else {
    start();
    scheduleAmbient();
  }
})();
