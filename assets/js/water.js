(function () {
  var canvas = document.getElementById("water");
  if (!canvas) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  var CELL = 13;
  var STEP_MS = 1000 / 60;
  var MAX_STEPS = 4;
  var FRAME_GAP = 30;
  var READ_RADIUS = 18;
  var CREST_N = 12;
  var MIX_N = 8;
  var SPLASH_N = 5;
  var CREST_MAX = 1.25;
  var GLYPHS = ["·", "~", "≈"];
  var CREST_SCALE = (CREST_N - 1) / CREST_MAX;
  var MIX_SCALE = MIX_N - 1;
  var SPLASH_SCALE = SPLASH_N - 1;
  var ALPHA_N = 32;
  var ALPHA_SCALE = (ALPHA_N - 1) / 0.62;

  var HASH = new Float32Array(256 * 256);
  for (var hy = 0; hy < 256; hy++) {
    for (var hx = 0; hx < 256; hx++) {
      var n = Math.imul(hx, 374761393) + Math.imul(hy, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      HASH[hy * 256 + hx] = ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }
  }

  var cols = 0;
  var rows = 0;
  var dpr = 0;
  var raf = 0;
  var last = 0;
  var lastRender = 0;
  var accum = 0;
  var time = 0;
  var running = false;
  var resizePending = false;
  var maskDirty = true;
  var maskScheduled = false;
  var ripples = [];
  var ambientTimer = 0;
  var warp = new Float32Array(0);
  var warpNext = new Float32Array(0);
  var energy = new Float32Array(0);
  var hold = new Float32Array(0);
  var readMask = new Float32Array(0);
  var pack = new Uint32Array(0);
  var packBucket = new Uint8Array(0);
  var packOrder = new Uint32Array(0);
  var alphaCount = new Int32Array(ALPHA_N);
  var alphaStart = new Int32Array(ALPHA_N);
  var alphaCursor = new Int32Array(ALPHA_N);
  var atlas = null;
  var spriteSize = CELL;
  var textRange = document.createRange();

  function hash(ix, iy) {
    return HASH[(iy & 255) * 256 + (ix & 255)];
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

  function channel(value) {
    if (value < 0) return 0;
    if (value > 255) return 255;
    return Math.round(value);
  }

  function buildAtlas() {
    if (!dpr) return;
    spriteSize = CELL * dpr;
    var sheet = document.createElement("canvas");
    sheet.width = Math.ceil(GLYPHS.length * CREST_N * spriteSize);
    sheet.height = Math.ceil(SPLASH_N * MIX_N * spriteSize);
    var actx = sheet.getContext("2d");
    if (!actx) return;
    actx.clearRect(0, 0, sheet.width, sheet.height);
    actx.font = "500 " + 13 * dpr + "px ui-monospace, Cascadia Mono, Segoe UI Mono, monospace";
    actx.textAlign = "center";
    actx.textBaseline = "middle";

    for (var si = 0; si < SPLASH_N; si++) {
      var splash = si / SPLASH_SCALE;
      for (var mi = 0; mi < MIX_N; mi++) {
        var mix = mi / MIX_SCALE;
        var sy = (si * MIX_N + mi) * spriteSize + spriteSize * 0.5;
        for (var ci = 0; ci < CREST_N; ci++) {
          var crest = (ci / (CREST_N - 1)) * CREST_MAX;
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
          actx.fillStyle =
            "rgb(" + channel(red) + "," + channel(green) + "," + channel(blue) + ")";
          for (var g = 0; g < GLYPHS.length; g++) {
            actx.fillText(
              GLYPHS[g],
              (g * CREST_N + ci) * spriteSize + spriteSize * 0.5,
              sy
            );
          }
        }
      }
    }
    atlas = sheet;
  }

  function applyResize() {
    resizePending = false;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (w < 1 || h < 1) return false;
    var nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    var nextCols = Math.max(2, Math.ceil(w / CELL));
    var nextRows = Math.max(2, Math.ceil(h / CELL));
    var nextW = Math.max(1, Math.floor(w * nextDpr));
    var nextH = Math.max(1, Math.floor(h * nextDpr));
    if (
      nextCols === cols &&
      nextRows === rows &&
      nextDpr === dpr &&
      canvas.width === nextW &&
      canvas.height === nextH
    ) {
      return false;
    }
    var dprChanged = nextDpr !== dpr || !atlas;
    dpr = nextDpr;
    canvas.width = nextW;
    canvas.height = nextH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (dprChanged) buildAtlas();
    if (nextCols !== cols || nextRows !== rows) {
      cols = nextCols;
      rows = nextRows;
      var count = cols * rows;
      warp = new Float32Array(count);
      warpNext = new Float32Array(count);
      energy = new Float32Array(count);
      readMask = new Float32Array(count);
      hold = new Float32Array(count);
      pack = new Uint32Array(count);
      packBucket = new Uint8Array(count);
      packOrder = new Uint32Array(count);
      for (var y = 0; y < rows; y++) {
        var row = y * cols;
        for (var x = 0; x < cols; x++) hold[row + x] = 0.9 + hash(x, y) * 0.03;
      }
    }
    maskDirty = true;
    return true;
  }

  function paint() {
    if (resizePending) applyResize();
    if (maskDirty) rebuildMask();
    draw();
  }

  function requestResize() {
    resizePending = true;
    markMask();
  }

  function paintBox(l, t, r, b) {
    var x0 = Math.floor((l - READ_RADIUS) / CELL);
    var y0 = Math.floor((t - READ_RADIUS) / CELL);
    var x1 = Math.floor((r + READ_RADIUS) / CELL);
    var y1 = Math.floor((b + READ_RADIUS) / CELL);
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= cols) x1 = cols - 1;
    if (y1 >= rows) y1 = rows - 1;
    for (var y = y0; y <= y1; y++) {
      var py = (y + 0.5) * CELL;
      var row = y * cols;
      for (var x = x0; x <= x1; x++) {
        var px = (x + 0.5) * CELL;
        var dx = px < l ? l - px : px > r ? px - r : 0;
        var dy = py < t ? t - py : py > b ? py - b : 0;
        var dist = dx === 0 && dy === 0 ? 0 : Math.sqrt(dx * dx + dy * dy);
        var near = dist / READ_RADIUS;
        if (near >= 1) continue;
        var i = row + x;
        if (near < readMask[i]) readMask[i] = near;
      }
    }
  }

  function rebuildMask() {
    maskDirty = false;
    if (!readMask.length) return;
    readMask.fill(1);
    var viewH = canvas.clientHeight;
    var roots = document.querySelectorAll("header, main, footer");
    for (var r = 0; r < roots.length; r++) {
      var walker = document.createTreeWalker(roots[r], NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (!node.textContent || !node.textContent.trim()) continue;
        textRange.selectNodeContents(node);
        var rects = textRange.getClientRects();
        for (var i = 0; i < rects.length; i++) {
          var rect = rects[i];
          if (rect.width < 2 || rect.height < 2) continue;
          if (rect.bottom < -20 || rect.top > viewH + 20) continue;
          paintBox(rect.left - 3, rect.top - 1, rect.right + 3, rect.bottom + 1);
        }
      }
    }
  }

  function markMask() {
    maskDirty = true;
    if (running || maskScheduled) return;
    maskScheduled = true;
    requestAnimationFrame(function () {
      maskScheduled = false;
      if (!running) paint();
    });
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
        var value = (sum / count) * hold[i];
        warpNext[i] = value < 0.012 ? 0 : value;
      }
    }
    var swap = warp;
    warp = warpNext;
    warpNext = swap;
  }

  function stepSim() {
    for (var i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += STEP_MS / 1000;
      if (ripples[i].age > 5.2) ripples.splice(i, 1);
    }
    imprint();
    settle();
    time += STEP_MS / 1000;
  }

  function draw() {
    var viewW = canvas.clientWidth;
    var viewH = canvas.clientHeight;
    if (viewW < 1 || viewH < 1) return;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#141311";
    ctx.fillRect(0, 0, viewW, viewH);
    if (!atlas) return;

    var field = warp;
    var hits = energy;
    var mask = readMask;
    var t = time;
    var size = spriteSize;
    var sheet = atlas;
    var packN = 0;

    for (var y = 0; y < rows; y++) {
      var py = (y + 0.5) * CELL;
      if (py > viewH) break;
      var row = y * cols;
      for (var x = 0; x < cols; x++) {
        var px = (x + 0.5) * CELL;
        if (px > viewW) break;
        var i = row + x;
        var swell = field[i];
        var hit = hits[i];
        var n1 = fbm(x * 0.055 + t * 0.04 + swell * 0.9, y * 0.045 - t * 0.025);
        var n2 = fbm(x * 0.04 + n1 * 3.4 + swell * 1.8, y * 0.08 + n1 * 1.6 + t * 0.035);
        var wave = Math.sin(n1 * 7.2 + n2 * 4.4 + y * 0.1 + t * 0.42 + swell * 0.35);
        var crest = 0;
        if (wave > 0.22) {
          var chop = fbm(x * 0.16 + 2.4, y * 0.14 - t * 0.05 + n2);
          if (chop > 0.2) {
            crest = Math.pow((wave - 0.22) / 0.78, 1.15) * (0.4 + chop * 0.85);
          }
        }
        if (crest < 0.16 && hit < 0.08 && swell < 0.16) continue;

        var tide = fbm(x * 0.018 + 5.4, y * 0.016 - t * 0.01);
        var mix = fade(tide);
        var splashAmt = hit < 1 ? hit : 1;
        var edge = crest / 0.85;
        if (edge > 1) edge = 1;
        if (edge < 0) edge = 0;
        edge = fade(edge);
        var alpha = 0.05 + edge * 0.4 + splashAmt * 0.38 + swell * 0.08;
        if (alpha > 0.62) alpha = 0.62;
        var speak = mask[i];
        if (speak < 1) {
          alpha *= 0.5 + 0.5 * speak;
          if (alpha < 0.05) continue;
          alpha *= 0.62 + 0.38 * speak;
        }

        var glyph = 0;
        if (hit > 0.4 || crest > 0.82) glyph = 2;
        else if (hit > 0.1 || crest > 0.4) glyph = 1;
        var crestIndex = crest * CREST_SCALE + 0.5;
        if (crestIndex < 0) crestIndex = 0;
        if (crestIndex > CREST_N - 1) crestIndex = CREST_N - 1;
        var mixIndex = mix * MIX_SCALE + 0.5;
        if (mixIndex > MIX_N - 1) mixIndex = MIX_N - 1;
        var splashIndex = splashAmt <= 0.05 ? 0 : splashAmt * SPLASH_SCALE + 0.5;
        if (splashIndex > SPLASH_N - 1) splashIndex = SPLASH_N - 1;
        var bucket = alpha * ALPHA_SCALE + 0.5;
        if (bucket > ALPHA_N - 1) bucket = ALPHA_N - 1;

        packBucket[packN] = bucket;
        pack[packN] =
          (splashIndex | 0) |
          ((mixIndex | 0) << 3) |
          ((crestIndex | 0) << 6) |
          (glyph << 10) |
          (y << 12) |
          (x << 22);
        packN++;
      }
    }

    alphaCount.fill(0);
    for (var p = 0; p < packN; p++) alphaCount[packBucket[p]]++;
    var packed = 0;
    for (var b = 0; b < ALPHA_N; b++) {
      alphaStart[b] = packed;
      alphaCursor[b] = packed;
      packed += alphaCount[b];
    }
    for (var p = 0; p < packN; p++) {
      var b = packBucket[p];
      packOrder[alphaCursor[b]++] = pack[p];
    }
    for (var b = 0; b < ALPHA_N; b++) {
      var end = alphaStart[b] + alphaCount[b];
      if (alphaStart[b] === end) continue;
      ctx.globalAlpha = b / ALPHA_SCALE;
      for (var p = alphaStart[b]; p < end; p++) {
        var bits = packOrder[p];
        ctx.drawImage(
          sheet,
          (((bits >>> 10) & 3) * CREST_N + ((bits >>> 6) & 15)) * size,
          ((bits & 7) * MIX_N + ((bits >>> 3) & 7)) * size,
          size,
          size,
          (bits >>> 22) * CELL,
          ((bits >>> 12) & 1023) * CELL,
          CELL,
          CELL
        );
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    if (!running) return;
    if (reduced.matches) {
      stop();
      paint();
      return;
    }
    var mustDraw = false;
    if (resizePending) mustDraw = applyResize();
    var dt = now - last;
    last = now;
    if (dt > 100) dt = 100;
    if (dt < 0) dt = 0;
    accum += dt;
    var steps = 0;
    while (accum >= STEP_MS && steps < MAX_STEPS) {
      stepSim();
      accum -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS) accum = 0;
    if (mustDraw || now - lastRender >= FRAME_GAP) {
      if (maskDirty) rebuildMask();
      draw();
      lastRender = now;
    }
    if (!running) return;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced.matches) return;
    running = true;
    last = performance.now();
    accum = 0;
    lastRender = 0;
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

  window.addEventListener("resize", requestResize);
  window.addEventListener("scroll", markMask, { passive: true });
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
      paint();
    } else {
      start();
      scheduleAmbient();
    }
  });
  if (window.MutationObserver) {
    new MutationObserver(markMask).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  if (window.ResizeObserver) {
    new ResizeObserver(requestResize).observe(canvas);
    new ResizeObserver(markMask).observe(document.body);
  }
  if (document.fonts) {
    var refreshGlyphs = function () {
      buildAtlas();
      markMask();
    };
    document.fonts.addEventListener("loadingdone", refreshGlyphs);
    document.fonts.ready.then(refreshGlyphs);
  }

  resizePending = true;
  if (reduced.matches) markMask();
  else {
    start();
    scheduleAmbient();
  }
})();
