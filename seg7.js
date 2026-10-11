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
    var ds = [dens(.25,.75,0,.08), dens(.88,1,.14,.42), dens(.88,1,.58,.86), dens(.25,.75,.92,1), dens(0,.12,.58,.86), dens(0,.12,.14,.42), dens(.25,.75,.46,.54)];
    var tot = 0, hit = 0;
    for (var y = Math.max(0, y0 | 0); y < Math.min(hh, y1 | 0); y++) { var base = y * w; for (var x = Math.max(0, x0 | 0); x < Math.min(w, x1 | 0); x++) { tot++; hit += ink[base + x]; } }
    var fill = tot ? hit / tot : 0;
    if (fill > 0.68 || fill < 0.08) return [null, 9];
    var bestD = null, bestS = 9, secondS = 9;
    for (var dig in PATS) {
      var p = PATS[dig], s = 0;
      for (var i = 0; i < 7; i++) s += p[i] ? (1 - ds[i]) : ds[i];
      if (s < bestS) { secondS = bestS; bestS = s; bestD = dig; } else if (s < secondS) secondS = s;
    }
    return [bestD, bestS, secondS - bestS];
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
      /* Large main digits, never the longer/smaller clock or memory row. */
      if (row.length < 2 || row.length > 3) continue;
      var score = c[4] / h;
      for (j = 0; j < row.length; j++) score += row[j][4] / h / 100;
      if (!bestRow || score > bestRow.score) bestRow = { score: score, row: row };
    }
    if (!bestRow) return { out: "", valid: 0, ssum: 9 };
    var rowC = bestRow.row;
    var ry0 = 1e9, ry1 = 0, rx0 = 1e9, rx1 = 0;
    for (i = 0; i < rowC.length; i++) { ry0 = Math.min(ry0, rowC[i][2]); ry1 = Math.max(ry1, rowC[i][3]); rx0 = Math.min(rx0, rowC[i][0]); rx1 = Math.max(rx1, rowC[i][1]); }
    var bandH = ry1 - ry0, est = bandH / 1.9;
    var cs = colsumBand(ink, w, Math.max(0, ry0 - ((bandH * 0.15) | 0)), Math.min(h, ry1 + ((bandH * 0.15) | 0)));
    var cth = Math.max(1, (bandH * 0.02) | 0);
    runs = mergeRuns(runsFrom(cs, cth), est * 0.12);
    var cells = [];
    for (i = 0; i < runs.length; i++) {
      if (runs[i][1] < rx0 - w * 0.01 || runs[i][0] > rx1 + w * 0.01) continue;
      if (runs[i][1] - runs[i][0] < bandH * 0.06) continue;
      cells = cells.concat(splitWide(cs, runs[i][0], runs[i][1], est, cth));
    }
    var out = "", valid = 0, ssum = 0, maxScore = 0, minMargin = 9;
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
        if (d) opts.push([sc + 0.6, d, r[2] || 0]);
        if (r2[0]) opts.push([r2[1], r2[0], r2[2] || 0]);
        if (r3[0]) opts.push([r3[1], r3[0], r3[2] || 0]);
        if (opts.length) { opts.sort(function (a, b) { return a[0] - b[0]; }); sc = opts[0][0]; d = opts[0][1]; r[2] = opts[0][2]; }
      }
      maxScore = Math.max(maxScore, sc); minMargin = Math.min(minMargin, r[2] || 0);
      if (d && sc < 1.15 && (r[2] || 0) >= 0.45) { out += d; valid++; ssum += sc; } else { out += "?"; ssum += 3; }
    }
    return { out: out, valid: valid, ssum: ssum, ink: ink, w: w, h: h, maxScore: maxScore, minMargin: minMargin, height: bandH / h, cells: cells.length };
  }
  function runDetect(g, w, h) {
    var thr = otsu(g), results = [], dark, ink, i, r;
    for (dark = 1; dark >= 0; dark--) {
      ink = new Uint8Array(g.length);
      for (i = 0; i < g.length; i++) ink[i] = ((g[i] <= thr) === !!dark) ? 1 : 0;
      // Separate LCD rows before column grouping so memory/time cannot join main digits.
      var clean = ink.slice(); removeBorderInk(clean, w, h); filterComponents(clean, w, h);
      var ys = new Int32Array(h);
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) ys[yy] += clean[yy * w + xx];
      var bands = mergeRuns(runsFrom(ys, Math.max(2, w * .004)), Math.max(3, h * .025));
      bands.sort(function(a,b){ return (b[1]-b[0])-(a[1]-a[0]); });
      r = { out: "", valid: 0, ssum: 9 };
      for (var bi = 0; bi < bands.length; bi++) {
        var band = bands[bi], bh = band[1] - band[0];
        if (bh < h * .14) continue;
        // Once a large row is found, never substitute a smaller clock/memory row.
        if (bi && bh < (bands[0][1] - bands[0][0]) * .7) break;
        var pad = Math.max(3, Math.round(bh * .12)), hh = bh + pad * 2, sub = new Uint8Array(w * hh);
        for (yy = 0; yy < bh; yy++) sub.set(clean.subarray((band[0]+yy)*w,(band[0]+yy+1)*w),(yy+pad)*w);
        var trial = detect(sub, w, hh); trial.height = bh / h;
        if (trial.valid > r.valid || (trial.valid === r.valid && trial.ssum < r.ssum)) r = trial;
      }
      var qm = (r.out.split("?").length - 1);
      results.push({ valid: r.valid, negq: -qm, negS: -r.ssum, out: r.out, row: r.ink?{ink:r.ink,w:r.w,h:r.h}:null, height: r.height || 0, maxScore: r.maxScore || 9, minMargin: r.minMargin || 0 });
    }
    results.sort(function (a, b) { return b.valid - a.valid || b.negq - a.negq || b.negS - a.negS; });
    return results[0];
  }

  function components(ink,w,h) {
    var seen=new Uint8Array(ink.length),out=[];
    for(var i=0;i<ink.length;i++) {
      if(!ink[i]||seen[i])continue;
      var todo=[i],pts=[],x0=w,y0=h,x1=0,y1=0;seen[i]=1;
      while(todo.length){var j=todo.pop(),x=j%w,y=(j/w)|0;pts.push(j);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
        for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){var xx=x+dx,yy=y+dy,k=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&!seen[k]&&ink[k]){seen[k]=1;todo.push(k);}}
      }
      out.push({x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,pts:pts});
    }
    return out;
  }
  function localInk(g,w,h,r,threshold){
    // Integral box mean removes uneven LCD illumination without inventing segments.
    var stride=w+1,sum=new Float64Array(stride*(h+1));
    for(var y=0;y<h;y++){var row=0;for(var x=0;x<w;x++){row+=g[y*w+x];sum[(y+1)*stride+x+1]=sum[y*stride+x+1]+row;}}
    var ink=new Uint8Array(g.length);
    for(y=0;y<h;y++)for(x=0;x<w;x++){var x0=Math.max(0,x-r),x1=Math.min(w,x+r+1),y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);var avg=(sum[y1*stride+x1]-sum[y0*stride+x1]-sum[y1*stride+x0]+sum[y0*stride+x0])/((x1-x0)*(y1-y0));ink[y*w+x]=avg-g[y*w+x]>threshold?1:0;}
    return ink;
  }
  function adaptiveRows(g,w,h,r,threshold){
    var ink=localInk(g,w,h,r,threshold),cs=components(ink,w,h),clean=new Uint8Array(g.length),scale=Math.max(w,h)/374;
    // Reject the bezel, hand, text baseline and tiny memory/time segments.
    cs.forEach(function(c){if(c.w>=2*scale&&c.w<=30*scale&&c.h>=10*scale&&c.h<=60*scale&&c.pts.length>=12*scale*scale&&c.pts.length/(c.w*c.h)>.18)c.pts.forEach(function(i){clean[i]=1;});});
    var expanded=new Uint8Array(clean.length),gap=Math.max(2,Math.round(4*scale));
    for(var i=0;i<clean.length;i++)if(clean[i]){var x=i%w,y=(i/w)|0;for(var yy=Math.max(0,y-gap);yy<=Math.min(h-1,y+gap);yy++)for(var xx=Math.max(0,x-gap);xx<=Math.min(w-1,x+gap);xx++)expanded[yy*w+xx]=1;}
    var groups=components(expanded,w,h),results=[];
    groups.forEach(function(c){if(c.w<35*scale||c.w>120*scale||c.h<25*scale||c.h>70*scale)return;var pad=Math.round(5*scale),sw=c.w+pad*2,sh=c.h+pad*2,sub=new Uint8Array(sw*sh);for(var yy=0;yy<c.h;yy++)for(var xx=0;xx<c.w;xx++)sub[(yy+pad)*sw+xx+pad]=clean[(yy+c.y)*w+xx+c.x];var d=detect(sub,sw,sh);if(/^[0-9]{2,3}$/.test(d.out)&&d.valid===d.out.length&&d.maxScore<=1.15&&d.minMargin>=.6)results.push({out:d.out,height:c.h,score:d.maxScore,ink:sub,w:sw,h:sh});});
    results.sort(function(a,b){return b.height-a.height;});
    if(!results.length)return null;
    // Competing similarly sized readings are not a reason to guess.
    for(i=1;i<results.length;i++)if(results[i].height>=results[0].height*.7&&results[i].out!==results[0].out)return null;
    return results[0];
  }
  var lastRow=null;
  function readAdaptive(grab,fw,fh){lastRow=null;
    var votes={},bestRows={},angs=[-4,0,4],radii=[6,10,14,20],thresholds=[5,9,13],scale=Math.max(fw,fh)/374;
    for(var ai=0;ai<angs.length;ai++) {var source=grab(fw,fh,angs[ai]), factor=Math.min(1,374/Math.max(fw,fh)),w=Math.round(fw*factor),h=Math.round(fh*factor),g=new Uint8Array(w*h);for(var yy=0;yy<h;yy++)for(var xx=0;xx<w;xx++)g[yy*w+xx]=source[Math.min(fh-1,Math.round(yy/factor))*fw+Math.min(fw-1,Math.round(xx/factor))];scale=Math.max(w,h)/374;for(var ri=0;ri<radii.length;ri++)for(var ti=0;ti<thresholds.length;ti++){var r=adaptiveRows(g,w,h,Math.max(3,Math.round(radii[ri]*scale)),thresholds[ti]);if(r){var v=votes[r.out]||(votes[r.out]={count:0,angles:{},thresholds:{}});v.count++;v.angles[ai]=true;v.thresholds[ti]=true;if(!bestRows[r.out]||r.score<bestRows[r.out].score)bestRows[r.out]=r;}}}
    var keys=Object.keys(votes).sort(function(a,b){return votes[b].count-votes[a].count;});if(!keys.length)return "";var v=votes[keys[0]],total=0;keys.forEach(function(k){total+=votes[k].count;});if(v.count/total<.85)return "";for(var ki=1;ki<keys.length;ki++)if(votes[keys[ki]].count>=2)return "";if(v.count>=4&&Object.keys(v.angles).length>=2&&Object.keys(v.thresholds).length>=2){lastRow=bestRows[keys[0]];return keys[0];}return "";
  }

  /* Conservative consensus: a valid glucose value is not proof of a valid read.
     Never return partial digits or a single lucky crop. Uncertain photos stay blank. */
  function readLegacy(grab, fw, fh) {
    var votes = {}, rows = {}, candidates = [], fracs = [1, .75, .55, .4], angs = [-12,-8.5,-8.1,-8,-7.9,-7.5,-4.5,-4.1,-4,-3.9,-3.5,-.5,-.1,0,.1,.5,3.5,3.9,4,4.1,4.5,7.5,7.9,8,8.1,8.5,12];
    for (var fi = 0; fi < fracs.length; fi++) {
      var cw = Math.max(1, (fw * fracs[fi]) | 0), ch = Math.max(1, (fh * fracs[fi]) | 0);
      for (var ai = 0; ai < angs.length; ai++) {
        var pixels = grab(cw, ch, angs[ai]), bright = 0;
        for (var gi = 0; gi < pixels.length; gi++) if (pixels[gi] >= 250) bright++;
        // Clipped highlights can erase a leading digit. Do not infer through glare.
        if (bright / pixels.length > .005) continue;
        var r = runDetect(pixels, cw, ch);
        if (!/^[0-9]{2,3}$/.test(r.out) || r.negq !== 0 || r.valid !== r.out.length || r.maxScore > .95 || r.minMargin < .45 || r.height < .16) continue;
        candidates.push(r.out);rows[r.out]=r.row;
        var v = votes[r.out] || (votes[r.out] = { count: 0, crops: {} });
        v.count++; v.crops[fi] = true;
      }
    }
    var keys = Object.keys(votes);
    if (keys.length !== 1) return "";
    var v = votes[keys[0]];
    if(v.count >= 4 && Object.keys(v.crops).length >= 2){lastRow=rows[keys[0]];return keys[0];}return "";
  }
  function read(grab,fw,fh){var a=readAdaptive(grab,fw,fh);if(a)return a;var f=Math.min(1,480/Math.max(fw,fh)),w=Math.round(fw*f),h=Math.round(fh*f);function small(cw,ch,ang){var sw=Math.max(1,Math.round(cw/f)),sh=Math.max(1,Math.round(ch/f)),src=grab(sw,sh,ang),out=new Uint8Array(cw*ch);for(var y=0;y<ch;y++)for(var x=0;x<cw;x++)out[y*cw+x]=src[Math.min(sh-1,Math.round(y/f))*sw+Math.min(sw-1,Math.round(x/f))];return out;}return readLegacy(small,w,h);}
  return { read: read, readAdaptive: readAdaptive, getRow: function(){return lastRow;}, runDetect: runDetect, detect: detect, otsu: otsu };
});
