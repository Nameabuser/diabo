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
  var lastRow=null;
  // Local illumination, component-size row localisation, then deskew/shear.
  // No recognised value or photo coordinates are built into this reader.
  function readMeter(grab,fw,fh,live){
    lastRow=null;
    var src=grab(fw,fh,0),f=Math.min(1,700/Math.max(fw,fh)),w=Math.round(fw*f),h=Math.round(fh*f),g=new Uint8Array(w*h);
    for(var y=0;y<h;y++)for(var x=0;x<w;x++)g[y*w+x]=src[Math.min(fh-1,Math.round(y/f))*fw+Math.min(fw-1,Math.round(x/f))];
    var scale=Math.max(w,h)/700;var votes={},rows={},attempts=[];
    for(var ri=0;ri<3;ri++)for(var ti=0;ti<3;ti++){
      var ink=localInk(g,w,h,Math.max(4,Math.round([14,22,30][ri]*scale)),[6,10,14][ti]),cs=components(ink,w,h),clean=new Uint8Array(w*h);
      var eligible=cs.filter(function(c){return c.w>=2*scale&&c.w<=w*(live?.2:.12)&&c.h>=15*scale&&c.h<=h*(live?.5:.13)&&c.pts.length>=65*scale*scale&&c.pts.length/(c.w*c.h)>.18;});
      var groups=[];
      eligible.forEach(function(seed){var cy=seed.y+seed.h/2;var row=eligible.filter(function(c){return Math.abs(c.y+c.h/2-cy)<Math.max(c.h,seed.h)*.8&&Math.abs(c.x-seed.x)<seed.h*5;});var x0=w,x1=0,y0=h,y1=0;row.forEach(function(c){x0=Math.min(x0,c.x);x1=Math.max(x1,c.x+c.w);y0=Math.min(y0,c.y);y1=Math.max(y1,c.y+c.h);});if(x1-x0>25*scale&&x1-x0<w*.5&&y1-y0>=25*scale&&y1-y0<h*(live?.5:.13))groups.push({x:x0,y:y0,w:x1-x0,h:y1-y0});});
      groups=groups.filter(function(a){return !groups.some(function(b){return b!==a&&b.w>a.w*1.15&&a.x>=b.x-3&&a.x+a.w<=b.x+b.w+3&&Math.abs(a.y+a.h/2-b.y-b.h/2)<b.h*.3;});});groups.sort(function(a,b){return b.h-a.h;});
      groups=groups.filter(function(c,i){return !i||!groups.slice(0,i).some(function(b){return Math.abs(b.x-c.x)<5&&Math.abs(b.y-c.y)<5;});});
      for(var gi=0;gi<groups.length;gi++){
        var c=groups[gi];if(gi>15)break;
        // Guard: ink beside the row that spans most of the digit height may be a lost digit (e.g. a leading 1 split into fragments). Stay blank.
        var lostDigit=false;
        [[c.x-Math.round(c.h*1.4),c.x+1],[c.x+c.w-1,c.x+c.w+Math.round(c.h*1.4)]].forEach(function(sd){
          var n=0,ymin=h,ymax=0;
          cs.forEach(function(k){
            if(k.x<sd[0]||k.x+k.w>sd[1]||k.y<c.y-c.h*.4||k.y+k.h>c.y+c.h*1.4||k.h>c.h*1.3||k.w>c.h)return;
            if(live){ k.pts.forEach(function(p){var y=(p/w)|0;if(y<c.y||y>=c.y+c.h)return;n++;ymin=Math.min(ymin,y);ymax=Math.max(ymax,y+1);}); } else {n+=k.pts.length;if(k.y<ymin)ymin=k.y;if(k.y+k.h>ymax)ymax=k.y+k.h;}
          });
          if(n>=18*scale*scale&&ymax-ymin>=c.h*.45)lostDigit=true;
        });
        if(lostDigit)continue;
        var pad=10,sw=c.w+pad*2,sh=c.h+pad*2,sub=new Uint8Array(sw*sh);
        // Otsu is applied only to the located large digit row, not the room/bezel.
        var crop=new Uint8Array(c.w*c.h);
        for(var yy=0;yy<c.h;yy++)for(var xx=0;xx<c.w;xx++)crop[yy*c.w+xx]=g[(c.y+yy)*w+c.x+xx];
        var thr=otsu(crop)+[0,-4,4][ti];
        for(yy=0;yy<c.h;yy++)for(xx=0;xx<c.w;xx++)sub[(yy+pad)*sw+xx+pad]=crop[yy*c.w+xx]<=thr?1:0;
        for(var ai=0;ai<(live?9:5);ai++)for(var si=0;si<(live?11:3);si++){
          var a=(live?[-12,-9,-6,-3,0,3,6,9,12]:[-6,-3,0,3,6])[ai]*Math.PI/180,shear=(live?[-.32,-.28,-.24,-.20,-.16,-.12,-.08,-.04,0,.04,.08]:[-.16,-.08,0])[si],dst=new Uint8Array(sw*sh),co=Math.cos(a),sn=Math.sin(a);
          for(yy=0;yy<sh;yy++)for(xx=0;xx<sw;xx++){var dx=xx-sw/2,dy=yy-sh/2,sx=Math.round(co*dx+sn*dy+shear*dy+sw/2),sy=Math.round(-sn*dx+co*dy+sh/2);if(sx>=0&&sx<sw&&sy>=0&&sy<sh)dst[yy*sw+xx]=sub[sy*sw+sx];}
          var r=meterRow(dst,sw,sh);
          if(live && r && (c.w/c.h<1.35 || c.w/c.h>2.7))r=null;
          if(r){var v=votes[r.out]||(votes[r.out]={count:0,thresholds:{},radii:{}});v.count++;v.thresholds[ti]=true;v.radii[ri]=true;rows[r.out]={ink:dst,w:sw,h:sh};}
        }
      }
    }
    var keys=Object.keys(votes).sort(function(a,b){return votes[b].count-votes[a].count;});

    if(!keys.length)return '';
    var v=votes[keys[0]],total=0;keys.forEach(function(k){total+=votes[k].count;});
    if(v.count<5||v.count/total<.98||Object.keys(v.thresholds).length<2||Object.keys(v.radii).length<2)return '';
    lastRow=rows[keys[0]];return keys[0];
  }
  function meterRow(ink,w,h){
    var ys=runsFrom(colsumBandTranspose(ink,w,h),1);ys=mergeRuns(ys,5);if(!ys.length)return null;ys.sort(function(a,b){return b[1]-b[0]-(a[1]-a[0]);});
    var y0=ys[0][0],y1=ys[0][1],bh=y1-y0;
    var cs=colsumBand(ink,w,y0,y1),runs=mergeRuns(runsFrom(cs,1),3);
    runs=runs.filter(function(r){return r[1]-r[0]>=3;});
    if(runs.length<2||runs.length>3)return null;
    var out='',rowHeight=bh;
    for(var k=0;k<runs.length;k++){
      var x0=runs[k][0],x1=runs[k][1],bw=x1-x0;var ey0=h,ey1=0;for(var yy=0;yy<h;yy++)for(var xx=x0;xx<x1;xx++)if(ink[yy*w+xx]){ey0=Math.min(ey0,yy);ey1=Math.max(ey1,yy+1);}if(ey1-ey0<12||ey1-ey0<rowHeight*.72)return null;y0=ey0;y1=ey1;bh=y1-y0;
      if(bw<bh*.24){if(bw<bh*.06||bw>bh*.18)return null;out+='1';continue;}
      if(bw/bh<.32||bw/bh>.62)return null;
      function dens(fx0,fx1,fy0,fy1){var hit=0,n=0;for(var y=Math.floor(y0+bh*fy0);y<Math.ceil(y0+bh*fy1);y++)for(var x=Math.floor(x0+bw*fx0);x<Math.ceil(x0+bw*fx1);x++){hit+=ink[y*w+x]||0;n++;}return hit/n;}
      var ds=[dens(.25,.75,0,.13),dens(.72,1,.15,.4),dens(.72,1,.6,.85),dens(.25,.75,.87,1),dens(0,.28,.6,.85),dens(0,.28,.15,.4),dens(.25,.75,.43,.57)],bits=ds.map(function(d){return d>.3?1:0;}),digit=null;
      for(var d in PATS){if(PATS[d].every(function(b,i){return b===bits[i]&&(b?ds[i]>.35:ds[i]<.18);}))digit=d;}
      if(digit===null)return null;out+=digit;
    }
    var n=+out;if(n<20||n>600||out[0]==='0')return null;return {out:out};
  }
  function colsumBandTranspose(ink,w,h){var ys=new Int32Array(h);for(var y=0;y<h;y++)for(var x=0;x<w;x++)ys[y]+=ink[y*w+x];return ys;}


  // Live-camera reader: g is a gray crop that the user framed around the LCD. Scale-normalised, no photo-specific values.
  function readCropSingle(g0,w0,h0,whole){
    lastRow=null;
    if(w0<100||h0<70)return '';
    var W=400,H=Math.max(60,Math.round(h0*W/w0)),g=new Uint8Array(W*H),x,y;
    for(y=0;y<H;y++){var sy=Math.min(h0-1,Math.floor((y+.5)*h0/H));for(x=0;x<W;x++)g[y*W+x]=g0[sy*w0+Math.min(w0-1,Math.floor((x+.5)*w0/W))];}
    // Step 1: find the light LCD plate (largest bright blob), step 2: threshold only inside it.
    var t1=otsu(g),mask=new Uint8Array(W*H),k;
    for(k=0;k<g.length;k++)mask[k]=g[k]>t1?1:0;
    var plates=components(mask,W,H).sort(function(a,b){return b.pts.length-a.pts.length;});
    if(!whole&&(!plates.length||plates[0].w<W*.25||plates[0].h<H*.25))return '';
    var P=whole?{x:0,y:0,w:W,h:H}:plates[0],ix=whole?0:Math.round(P.x+P.w*.03),iy=whole?0:Math.round(P.y+P.h*.03),iw=whole?W:Math.round(P.w*.94),ih=whole?H:Math.round(P.h*.94);
    var cg=new Uint8Array(iw*ih);
    for(y=0;y<ih;y++)for(x=0;x<iw;x++)cg[y*iw+x]=g[(iy+y)*W+ix+x];
    var votes={},rows={},total=0,W0=W,H0=H;W=iw;H=ih;
    for(var ti=0;ti<4;ti++){
      var thr=otsu(cg)+[0,-8,8,16][ti],ink=new Uint8Array(W*H);
      for(var i=0;i<cg.length;i++)ink[i]=cg[i]<=thr?1:0;
      removeBorderInk(ink,W,H);
      // Keep only stroke-sized pieces (drops MEM, mg/dL, time digits), then take the tallest band of rows with ink.
      var minpts=Math.max(40,.0025*W*H),keep=new Uint8Array(W*H),nkeep=0;
      components(ink,W,H).forEach(function(c){if((c.pts.length>=minpts||(c.h>=H*.2&&c.pts.length>=40))&&c.h<H*.98&&c.w<W*.6){c.pts.forEach(function(j){keep[j]=1;});nkeep++;}});
      if(!nkeep)continue;
      var rs=new Int32Array(H);
      for(y=0;y<H;y++)for(x=0;x<W;x++)if(keep[y*W+x])rs[y]++;
      var bands=mergeRuns(runsFrom(rs,0),Math.max(6,Math.round(H*.04))).sort(function(p,q){return (q[1]-q[0])-(p[1]-p[0]);});
      if(!bands.length||bands[0][1]-bands[0][0]<H*.22)continue;
      var y0=bands[0][0],y1=bands[0][1],x0=0,x1=W,pad=10,sw=W+pad*2,sh=y1-y0+pad*2,sub=new Uint8Array(sw*sh);
      for(y=y0;y<y1;y++)for(x=0;x<W;x++)if(ink[y*W+x])sub[(y-y0+pad)*sw+x+pad]=1;
      // Guard: stroke-sized ink beside the digit row that we threw away could be a lost digit. Then do not vote.
      var kx0=W,kx1=0,bh0=y1-y0;
      for(y=y0;y<y1;y++)for(x=0;x<W;x++)if(keep[y*W+x]){if(x<kx0)kx0=x;if(x>kx1)kx1=x;}
      var lost=false;
      components(ink,W,H).forEach(function(c){
        if(keep[c.pts[0]])return;
        var cyc=c.y+c.h/2;
        if(c.pts.length>=30&&c.h>=bh0*.14&&cyc>y0&&cyc<y1&&(c.x+c.w<kx0||c.x>kx1)&&c.x+c.w>kx0-bh0*.9&&c.x<kx1+bh0*.9)lost=true;
      });
      if(lost)continue;
      for(var ai=0;ai<5;ai++)for(var si=0;si<3;si++){
        var a=[-6,-3,0,3,6][ai]*Math.PI/180,shear=[-.16,-.08,0][si],dst=new Uint8Array(sw*sh),co=Math.cos(a),sn=Math.sin(a);
        for(y=0;y<sh;y++)for(x=0;x<sw;x++){var dx=x-sw/2,dy=y-sh/2,sx=Math.round(co*dx+sn*dy+shear*dy+sw/2),sy2=Math.round(-sn*dx+co*dy+sh/2);if(sx>=0&&sx<sw&&sy2>=0&&sy2<sh)dst[y*sw+x]=sub[sy2*sw+sx];}
        var r=meterRow(dst,sw,sh);
        if(r){var v=votes[r.out]||(votes[r.out]={count:0,t:{}});v.count++;v.t[ti]=true;rows[r.out]={ink:dst,w:sw,h:sh};total++;}
      }
    }
    var keys=Object.keys(votes).sort(function(a,b){return votes[b].count-votes[a].count;});
    if(!keys.length)return '';
    var v0=votes[keys[0]];
    if(v0.count<4||v0.count/total<.95||Object.keys(v0.t).length<2)return '';
    lastRow=rows[keys[0]];return keys[0];
  }
 function readCrop(g,w,h){
    // The framing box may contain a darker LCD beside a bright bezel. Try the
    // entire framed screen too, but reject disagreement between complete reads.
    var a=readCropSingle(g,w,h,false),ar=lastRow;
    var b=readCropSingle(g,w,h,true),br=lastRow;
    if(a&&b&&a!==b){lastRow=null;return '';}
    // Wide-scene localisation cannot prove that a missing leading digit is
    // empty LCD space. Only use complete three-digit rows in this fallback;
    // two-digit readings still require the framed-LCD reader above.
    var c=readMeter(function(){return g;},w,h,true),cr=lastRow;
    if(c.length!==3)c="";
    if(c&&((a&&a!==c)||(b&&b!==c))){lastRow=null;return "";}
    lastRow=c?cr:(a?ar:br);return c||a||b;
  }
 return {readCrop:readCrop,read:readMeter,getRow:function(){return lastRow;}};
});
