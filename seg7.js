/* Diabo 7-segment LCD reader core - pure functions, no DOM. UMD for browser + node tests. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Seg7 = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function otsu(g) {
    var hist = new Array(256).fill(0), i;
    for (i = 0; i < g.length; i++) hist[g[i]]++;
    var total = g.length, sum = 0;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, best = 0, thr = 127;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB, mF = (sum - sumB) / wF;
      var v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = i; }
    }
    return thr;
  }
  function removeBorderInk(ink, w, h) {
    var seen = new Uint8Array(w * h), stack = [], i;
    for (var x = 0; x < w; x++) { i = x; if (ink[i] && !seen[i]) stack.push(i); i = (h - 1) * w + x; if (ink[i] && !seen[i]) stack.push(i); }
    for (var y = 0; y < h; y++) { i = y * w; if (ink[i] && !seen[i]) stack.push(i); i = y * w + w - 1; if (ink[i] && !seen[i]) stack.push(i); }
    while (stack.length) {
      i = stack.pop();
      if (seen[i] || !ink[i]) continue;
      seen[i] = 1; ink[i] = 0;
      y = (i / w) | 0; x = i % w;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w);
      if (y < h - 1) stack.push(i + w);
    }
  }
  function filterComponents(ink, w, h) {
    var seen = new Uint8Array(w * h), lim = 0.20 * w * h;
    for (var start = 0; start < w * h; start++) {
      if (seen[start] || !ink[start]) continue;
      var stack = [start]; seen[start] = 1;
      var comp = [];
      while (stack.length) {
        var i = stack.pop(); comp.push(i);
        var y = (i / w) | 0, x = i % w;
        var nb = [i - 1, i + 1, i - w, i + w];
        for (var k = 0; k < 4; k++) {
          var j = nb[k];
          if (j >= 0 && j < w * h && !seen[j] && ink[j] && Math.abs(j % w - x) <= 1) { seen[j] = 1; stack.push(j); }
        }
      }
      var minx = w, maxx = 0, miny = h, maxy = 0;
      for (k = 0; k < comp.length; k++) {
        x = comp[k] % w; y = (comp[k] / w) | 0;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
      var bw = maxx - minx + 1, bh = maxy - miny + 1;
      if (comp.length > lim || (bw > 0.45 * w && bh > 0.45 * h)) {
        for (k = 0; k < comp.length; k++) ink[comp[k]] = 0;
      }
    }
  }
  function colsumBand(ink, w, y0, y1) {
    var cs = new Int32Array(w);
    for (var y = y0; y < y1; y++) { var base = y * w; for (var x = 0; x < w; x++) if (ink[base + x]) cs[x]++; }
    return cs;
  }
  function runsFrom(cs, cth) {
    var runs = [], x = 0, w = cs.length;
    while (x < w) {
      if (cs[x] > cth) { var a = x; while (x < w && cs[x] > cth) x++; runs.push([a, x]); }
      else x++;
    }
    return runs;
  }
  function mergeRuns(runs, gap) {
    var m = [];
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      if (m.length && r[0] - m[m.length - 1][1] < gap) m[m.length - 1][1] = r[1];
      else m.push([r[0], r[1]]);
    }
    return m;
  }
  function yextent(ink, w, h, x0, x1) {
    var ys = [];
    for (var x = x0; x < x1; x += 2) for (var y = 0; y < h; y++) if (ink[y * w + x]) ys.push(y);
    if (ys.length < 10) return null;
    ys.sort(function (a, b) { return a - b; });
    return [ys[(ys.length / 50) | 0], ys[ys.length - 1 - ((ys.length / 50) | 0)] + 1];
  }
  function splitWide(cs, x0, x1, est, cth) {
    var width = x1 - x0;
    if (width <= est * 1.45) return [[x0, x1]];
    var m0 = (x0 + width * 0.15) | 0, m1 = (x1 - width * 0.15) | 0, best = null, x = m0;
    while (x < m1) {
      if (cs[x] <= cth) { var a = x; while (x < m1 && cs[x] <= cth) x++; if (!best || x - a > best[1] - best[0]) best = [a, x]; }
      else x++;
    }
    if (best && best[1] - best[0] >= est * 0.12) {
      var mid = (best[0] + best[1]) >> 1;
      return splitWide(cs, x0, mid, est, cth).concat(splitWide(cs, mid, x1, est, cth));
    }
    var k = Math.max(2, Math.round(width / (est * 1.15))), step = width / k, out = [];
    for (var i = 0; i < k; i++) out.push([(x0 + i * step) | 0, (x0 + (i + 1) * step) | 0]);
    return out;
  }
  var PATS = { "0": [1,1,1,1,1,1,0], "1": [0,1,1,0,0,0,0], "2": [1,1,0,1,1,0,1], "3": [1,1,1,1,0,0,1], "4": [0,1,1,0,0,1,1], "5": [1,0,1,1,0,1,1], "6": [1,0,1,1,1,1,1], "7": [1,1,1,0,0,0,0], "8": [1,1,1,1,1,1,1], "9": [1,1,1,1,0,1,1] };
  function decode(ink, w, hh, x0, x1, y0, y1) {
    var bw = x1 - x0, bh = y1 - y0;
    if (bw < 3 || bh < 6) return [null, 9];
    function dens(fx0, fx1, fy0, fy1) {
      var xa = (x0 + bw * fx0) | 0, xb = (x0 + bw * fx1) | 0, ya = (y0 + bh * fy0) | 0, yb = (y0 + bh * fy1) | 0;
      var tot = 0, hit = 0;
      for (var y = Math.max(0, ya); y < Math.min(hh, yb); y++) { var base = y * w; for (var x = Math.max(0, xa); x < Math.min(w, xb); x++) { tot++; hit += ink[base + x]; } }
      return tot ? hit / tot : 0;
    }
    var ds = [dens(.25,.75,.02,.12), dens(.82,.98,.14,.42), dens(.82,.98,.58,.86), dens(.25,.75,.88,.98), dens(.02,.18,.58,.86), dens(.02,.18,.14,.42), dens(.25,.75,.44,.56)];
    var tot = 0, hit = 0;
    for (var y = Math.max(0, y0 | 0); y < Math.min(hh, y1 | 0); y++) { var base = y * w; for (var x = Math.max(0, x0 | 0); x < Math.min(w, x1 | 0); x++) { tot++; hit += ink[base + x]; } }
    var fill = tot ? hit / tot : 0;
    if (fill > 0.68 || fill < 0.08) return [null, 9];
    var bestD = null, bestS = 9;
    for (var dig in PATS) {
      var p = PATS[dig], s = 0;
      for (var i = 0; i < 7; i++) s += p[i] ? (1 - ds[i]) : ds[i];
      if (s < bestS) { bestS = s; bestD = dig; }
    }
    return [bestD, bestS];
  }
  function detect(ink0, w, h) {
    var ink = ink0.slice();
    removeBorderInk(ink, w, h);
    filterComponents(ink, w, h);
    var runs = mergeRuns(runsFrom(colsumBand(ink, w, 0, h), Math.max(2, (h * 0.015) | 0)), w * 0.006);
    var cands = [], i, ext;
    for (i = 0; i < runs.length; i++) {
      ext = yextent(ink, w, h, runs[i][0], runs[i][1]);
      if (!ext) continue;
      var bh = ext[1] - ext[0], bw = runs[i][1] - runs[i][0];
      if (bh < h * 0.10 || bw > w * 0.5 || bh / bw < 0.5) continue;
      cands.push([runs[i][0], runs[i][1], ext[0], ext[1], bh]);
    }
    if (!cands.length) return { out: "", valid: 0, ssum: 9 };
    cands.sort(function (a, b) { return b[4] - a[4]; });
    var used = {}, bestRow = null;
    for (i = 0; i < cands.length; i++) {
      if (used[i]) continue;
      var c = cands[i], cy = (c[2] + c[3]) / 2, row = [];
      for (var j = 0; j < cands.length; j++) {
        var c2 = cands[j];
        if (Math.abs((c2[2] + c2[3]) / 2 - cy) < c[4] * 0.5 && c2[4] / c[4] > 0.55 && c2[4] / c[4] < 1.8) { row.push(c2); used[j] = 1; }
      }
      var score = row.length * 5;
      for (j = 0; j < row.length; j++) score += row[j][4] / h;
      if (!bestRow || score > bestRow.score) bestRow = { score: score, row: row };
    }
    var rowC = bestRow.row;
    var ry0 = 1e9, ry1 = 0, rx0 = 1e9, rx1 = 0;
    for (i = 0; i < rowC.length; i++) { ry0 = Math.min(ry0, rowC[i][2]); ry1 = Math.max(ry1, rowC[i][3]); rx0 = Math.min(rx0, rowC[i][0]); rx1 = Math.max(rx1, rowC[i][1]); }
    var bandH = ry1 - ry0, est = bandH / 1.9;
    var cs = colsumBand(ink, w, Math.max(0, ry0 - ((bandH * 0.15) | 0)), Math.min(h, ry1 + ((bandH * 0.15) | 0)));
    var cth = Math.max(2, (bandH * 0.06) | 0);
    runs = mergeRuns(runsFrom(cs, cth), est * 0.12);
    var cells = [];
    for (i = 0; i < runs.length; i++) {
      if (runs[i][1] < rx0 - w * 0.01 || runs[i][0] > rx1 + w * 0.01) continue;
      if (runs[i][1] - runs[i][0] < bandH * 0.06) continue;
      cells = cells.concat(splitWide(cs, runs[i][0], runs[i][1], est, cth));
    }
    var out = "", valid = 0, ssum = 0;
    for (i = 0; i < cells.length; i++) {
      var x0 = cells[i][0], x1 = cells[i][1];
      ext = yextent(ink, w, h, x0, x1);
      var y0, y1;
      if (ext && ext[1] - ext[0] >= bandH * 0.5) { y0 = ext[0]; y1 = ext[1]; } else { y0 = ry0; y1 = ry1; }
      var r = decode(ink, w, h, x0, x1, y0, y1), d = r[0], sc = r[1];
      if (x1 - x0 < (y1 - y0) / 2.6) {
        var bw2 = (y1 - y0) / 1.9;
        var r2 = decode(ink, w, h, Math.max(0, (x1 - bw2) | 0), x1, y0, y1);
        var r3 = decode(ink, w, h, x0, Math.min(w, (x0 + bw2) | 0), y0, y1);
        var opts = [];
        if (d) opts.push([sc + 0.6, d]);
        if (r2[0]) opts.push([r2[1], r2[0]]);
        if (r3[0]) opts.push([r3[1], r3[0]]);
        if (opts.length) { opts.sort(function (a, b) { return a[0] - b[0]; }); sc = opts[0][0]; d = opts[0][1]; }
      }
      if (d && sc < 3.0) { out += d; valid++; ssum += sc; } else { out += "?"; ssum += 3; }
    }
    return { out: out, valid: valid, ssum: ssum };
  }
  function runDetect(g, w, h) {
    var thr = otsu(g), results = [], dark, ink, i, r;
    for (dark = 1; dark >= 0; dark--) {
      ink = new Uint8Array(g.length);
      for (i = 0; i < g.length; i++) ink[i] = ((g[i] < thr) === !!dark) ? 1 : 0;
      r = detect(ink, w, h);
      var qm = (r.out.split("?").length - 1);
      results.push({ valid: r.valid, negq: -qm, negS: -r.ssum, out: r.out });
    }
    results.sort(function (a, b) { return b.valid - a.valid || b.negq - a.negq || b.negS - a.negS; });
    return results[0];
  }

  /* read(grab, fw, fh): grab(cw,ch,angDeg) -> Uint8Array gray. Returns digit string or "". */
  function read(grab, fw, fh) {
    var best = { valid: 0, negq: -99, negS: -99, out: "" };
    var fracs = [1.0, 0.75, 0.55, 0.4], angs = [-8, -4, 0, 4, 8];
    for (var fi = 0; fi < fracs.length; fi++) {
      var cw = Math.max(1, (fw * fracs[fi]) | 0), ch = Math.max(1, (fh * fracs[fi]) | 0);
      for (var ai = 0; ai < angs.length; ai++) {
        var g = grab(cw, ch, angs[ai]);
        var r = runDetect(g, cw, ch);
        if (r.valid > best.valid || (r.valid === best.valid && (r.negq > best.negq || (r.negq === best.negq && r.negS > best.negS)))) best = r;
        if (r.valid >= 2 && r.negq === 0 && -r.negS / r.valid < 1.0) return best.out;
      }
    }
    return best.valid > 0 ? best.out : "";
  }
  return { read: read, runDetect: runDetect, detect: detect, otsu: otsu };
});
