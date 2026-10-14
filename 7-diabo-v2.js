/* Diabo - blood sugar log. Data stays on device (localStorage). */
(function () {
  "use strict";
  var KEY = "diabo-readings-v1";
  var lastCreated=0;
  var TAGS = ["fasting", "before meal", "after meal", "midnight"];
  function baseTag(tag){return String(tag||"").split("|date=")[0];}
  function readingDate(r){var m=/\|date=(\d{4}-\d{2}-\d{2})$/.exec(String(r.tag||""));return m?m[1]:"";}
  function readingOrder(a,b){var ad=readingDate(a),bd=readingDate(b),at=ad?new Date(ad+'T00:00:00').getTime():a.ts,bt=bd?new Date(bd+'T00:00:00').getTime():b.ts;return bt-at||Number(String(b.id).split('-')[0])-Number(String(a.id).split('-')[0])||String(b.id).localeCompare(String(a.id));}
  function tagLabel(tag) {
    tag=baseTag(tag);
    return { fasting: "Morning", "before meal": "Afternoon", "after meal": "Evening",
      morning: "Morning", afternoon: "Afternoon", evening: "Evening", midnight: "Midnight" }[tag] || tag;
  }
  function parseTag(text) {
    var t = String(text).toLowerCase();
    return /\bmidnight\b/.test(t) ? "midnight"
      : /\b(morning|fasting)\b/.test(t) ? "fasting"
      : /\b(evening|after)\b/.test(t) ? "after meal"
      : /\b(afternoon|before)\b/.test(t) ? "before meal" : "";
  }

  window.Diabo = {
    load: function () {
      try {
        var r = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(r) ? r.slice().sort(readingOrder) : [];
      } catch (e) { return []; }
    },
    save: function (value, tag, timestamp, replacing) {
      var ts = timestamp === undefined ? Date.now() : timestamp;
      if (!Number.isSafeInteger(ts) || ts <= 0 || ts > Date.now()) return false;
      var list = window.Diabo.load();
      if(replacing)list=list.filter(function(r){return replacing.indexOf(r.id)<0;});
      lastCreated=Math.max(Date.now(),lastCreated+1);
      list.unshift({ id: lastCreated + "-" + Math.floor(Math.random() * 1e6), value: value, tag: tag || "", ts: ts });
      list.sort(readingOrder);
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { window.dispatchEvent(new CustomEvent("diabo-error")); return false; }
      renderHistory();
      window.dispatchEvent(new CustomEvent("diabo-saved"));
      return true;
    },
    remove: function (id) {
      var original = window.Diabo.load();
      var removed = original.find(function (r) { return r.id === id; });
      var list = original.filter(function (r) { return r.id !== id; });
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { window.dispatchEvent(new CustomEvent("diabo-error")); return false; }
      renderHistory();
      window.dispatchEvent(new CustomEvent("diabo-deleted", {detail: removed}));
    },
    restore: function (reading) {
      var list = window.Diabo.load();
      if (!reading || list.some(function(r) { return r.id === reading.id; })) return;
      list.push(reading); list.sort(readingOrder);
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch(e) { window.dispatchEvent(new CustomEvent("diabo-error")); return; }
      renderHistory();
    },
    replaceReadings: function (list) {
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { window.dispatchEvent(new CustomEvent("diabo-error")); return false; }
      renderHistory(); return true;
    },
    valid: function (v) { return /^\d{2,3}$/.test(String(v)) && +v >= 20 && +v <= 600; }
  };

  window.Diabo.tagLabel = tagLabel;
  window.Diabo.baseTag=baseTag;window.Diabo.readingDate=readingDate;window.Diabo.readingOrder=readingOrder;
  window.Diabo.parseTag = parseTag;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtWhen(r) {
    var d = new Date(readingDate(r)?readingDate(r)+"T00:00:00":r.ts), now = new Date();
    var day = d.toDateString() === now.toDateString() ? "Today"
      : d.toDateString() === new Date(now.getTime() - 864e5).toDateString() ? "Yesterday"
      : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    if(readingDate(r))return day;
    var time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    return day + "<br>" + time;
  }

  function renderHistory() {
    window.dispatchEvent(new CustomEvent("diabo-render"));
  }

  var sharedTag = "", tagControls = [];
  function pickTag(t) {sharedTag=t;tagControls.forEach(function(c){c.update(t);});syncDateFields();}
  function fillTags(container, onPick) {
    container.innerHTML = "";
    var cur = "";
    TAGS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tag";
      b.textContent = tagLabel(t);
      b.setAttribute("data-tag", t);
      b.addEventListener("click", function () {
        pickTag(t);
      });
      container.appendChild(b);
    });
    var ctl={update:function(t){cur=TAGS.indexOf(t)>=0?t:"";Array.prototype.forEach.call(container.children,function(c){c.classList.toggle("on",c.getAttribute("data-tag")===cur);c.setAttribute("aria-pressed",String(c.getAttribute("data-tag")===cur));});onPick(cur);},set:pickTag};
    tagControls.push(ctl);ctl.update(sharedTag);return ctl;
  }

  window.Diabo.fillTags = fillTags;

  /* The date draft is for manual entry only. Siri/API saves still default to now. */
  var readingDay='';
  function localDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function syncDateFields(){var today=localDate(new Date());document.querySelectorAll('[data-reading-date]').forEach(function(e){e.value=readingDay;e.max=today;e.min='1970-01-02';});document.querySelectorAll('[data-reading-day]').forEach(function(e){e.setAttribute('aria-pressed',String(readingDay===today));});document.querySelectorAll('[data-date-error]').forEach(function(e){e.classList.add('hidden');});}
  window.Diabo.resetReadingDate=function(){readingDay=localDate(new Date());pickTag('');syncDateFields();};
  document.querySelectorAll('[data-reading-date]').forEach(function(e){e.addEventListener('change',function(){readingDay=e.value;syncDateFields();});});
  document.querySelectorAll('[data-reading-day]').forEach(function(e){e.addEventListener('click',function(){readingDay=localDate(new Date());syncDateFields();});});
  window.Diabo.saveReading=function(value,tag){var d=new Date(readingDay+'T00:00:00'),ts=d.getTime();if(!readingDay||!Number.isSafeInteger(ts)||ts<=0||readingDay>localDate(new Date())||localDate(d)!==readingDay){document.querySelectorAll('.sheet:not(.hidden) [data-date-error]').forEach(function(e){e.textContent='Choose a valid date, not in the future.';e.classList.remove('hidden');e.scrollIntoView({block:'nearest'});});return false;}var day=readingDay;ts=new Date(day+'T00:00:00').getTime();var old=baseTag(tag)&&baseTag(tag)!=='midnight'?window.Diabo.load().filter(function(r){return readingDate(r)===day&&baseTag(r.tag)===baseTag(tag);}):[];var result=window.Diabo.save(value,baseTag(tag)+'|date='+day,ts,old.map(function(r){return r.id;}));if(result&&old.length)window.dispatchEvent(new CustomEvent('diabo-replaced',{detail:{old:old,next:window.Diabo.load().find(function(r){return readingDate(r)===day&&baseTag(r.tag)===baseTag(tag);})}}));return result;};
  
var _sr=window.Diabo.saveReading;window.Diabo.saveReading=function(value,tag){if(!baseTag(tag)){var he=document.querySelector('.sheet:not(.hidden) [data-date-error]');if(he){he.textContent='Pick Morning, Afternoon, Evening or Midnight first.';he.classList.remove('hidden');setTimeout(function(){he.classList.add('hidden');},3000);return false;}}return _sr(value,tag);};

  fillTags(document.querySelector('#sheet-methods [data-tags]'),function(){});
  window.Diabo.resetReadingDate();

  /* sheet switching */
  var sheets = { "m-scan": "sheet-scan", "m-pad": "sheet-pad", "m-voice": "sheet-voice" };
  Object.keys(sheets).forEach(function (btnId) {
    document.getElementById(btnId).addEventListener("click", function () {
      document.getElementById("sheet-methods").classList.add("hidden");
      Object.keys(sheets).forEach(function (k) {
        document.getElementById(sheets[k]).classList.toggle("hidden", k !== btnId);
      });
      document.getElementById(sheets[btnId]).querySelector("[data-close]").focus();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
    b.addEventListener("click", function () { b.closest(".sheet").classList.add("hidden"); });
  });

  /* number pad */
  var padVal = "";
  var padTag = "";
  fillTags(document.querySelector("#sheet-pad [data-tags]"), function (t) { padTag = t; });
  var pad = document.getElementById("pad");
  ["1","2","3","4","5","6","7","8","9","⌫","0","C"].forEach(function (k) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = k;
    b.addEventListener("click", function () {
      if (k === "C") padVal = "";
      else if (k === "⌫") padVal = padVal.slice(0, -1);
      else if (padVal.length < 3) padVal += k;
      document.getElementById("pad-val").textContent = padVal || "0";
    });
    pad.appendChild(b);
  });
  document.getElementById("pad-save").addEventListener("click", function () {
    if (!window.Diabo.valid(padVal)) {
      document.getElementById("pad-error").classList.remove("hidden");
      return;
    }
    if (window.Diabo.saveReading(+padVal, padTag) === false) return;
    document.getElementById("pad-error").classList.add("hidden");
    padVal = "";
    document.getElementById("pad-val").textContent = "0";
    document.getElementById("sheet-pad").classList.add("hidden");
  });

  renderHistory();
})();
(function(){
'use strict';
var D=window.Diabo, el=function(id){return document.getElementById(id);}, toastTimer, deleted,replacement;
function notify(text,undo){clearTimeout(toastTimer);el('toast-text').textContent=text;el('undo').classList.toggle('hidden',!undo);el('toast').classList.remove('hidden');toastTimer=setTimeout(function(){el('toast').classList.add('hidden');deleted=null;replacement=null;},5000);}
function validRange(r){return r&&Number.isFinite(Number(r.low))&&Number.isFinite(Number(r.high))&&Number(r.low)>=20&&Number(r.high)<=600&&Number(r.low)<Number(r.high);}
function ranges(){return {morning:{low:80,high:130},other:{low:80,high:180}};}
function rangeFor(reading){var all=ranges(),tag=D.baseTag(reading.tag),r=tag==='fasting'||tag==='morning'?all.morning:tag==='before meal'||tag==='after meal'||tag==='afternoon'||tag==='evening'||tag==='midnight'?all.other:null;return validRange(r)?r:null;}
D.ranges=ranges;D.rangeFor=rangeFor;
function tone(reading){var r=rangeFor(reading);return !r?'':reading.value<r.low?'below':reading.value>r.high?'above':'within';}
function status(reading){var r=rangeFor(reading);return !r?'':reading.value<70?' · Low\u00A0(below\u00A070)':reading.value<r.low?' · Below\u00A0reference':reading.value>r.high?' · Above\u00A0reference':' · Within\u00A0reference';}
function render(){
var list=D.load().slice().sort(D.readingOrder), now=new Date(), today=list.filter(function(r){return (D.readingDate(r)?new Date(D.readingDate(r)+'T00:00:00'):new Date(r.ts)).toDateString()===now.toDateString();});
el('delete-latest').classList.toggle('hidden',!list.length);
el('last-value').textContent=list.length?list[0].value:'--';el('last-value').className='stat-number '+(list.length?tone(list[0]):'');
el('last-detail').textContent=list.length?(D.readingDate(list[0])?new Date(D.readingDate(list[0])+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'}):new Date(list[0].ts).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}))+(D.baseTag(list[0].tag)?' · '+D.tagLabel(list[0].tag):'')+status(list[0]):'Your first reading starts here';
el('today-average').textContent=today.length?Math.round(today.reduce(function(s,r){return s+Number(r.value);},0)/today.length):'--';el('today-count').textContent=today.length+' reading'+(today.length===1?'':'s')+' today';
if(window.DiaboInsights)window.DiaboInsights.render();

}
el('add-reading').addEventListener('click',function(){D.resetReadingDate();document.querySelectorAll('.sheet').forEach(function(s){s.classList.add('hidden');});el('sheet-methods').classList.remove('hidden');el('m-pad').focus();});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){document.querySelectorAll('.sheet').forEach(function(s){s.classList.add('hidden');});el('add-reading').focus();}});
el('delete-latest').addEventListener('click',function(){var r=D.load().slice().sort(D.readingOrder)[0];if(!r)return;D.remove(r.id);});
window.addEventListener('diabo-render',render);window.addEventListener('diabo-saved',function(){replacement=null;el('add-reading').focus();});window.addEventListener('diabo-error',function(){notify('Storage is full or unavailable. Reading was not changed.',false);});window.addEventListener('diabo-deleted',function(){clearTimeout(toastTimer);replacement=null;deleted=null;el('toast').classList.add('hidden');});window.addEventListener('diabo-replaced',function(e){replacement=e.detail;deleted=null;notify('Previous reading replaced',true);});el('undo').addEventListener('click',function(){if(replacement){var prior=replacement;replacement=null;D.remove(prior.next.id);prior.old.forEach(function(r){D.restore(r);});deleted=null;notify('Previous reading restored',false);return;}if(deleted){D.restore(deleted);deleted=null;notify('Reading restored',false);}});

var preference='auto';try{preference=localStorage.getItem('diabo-theme-v2')||'auto';}catch(e){}var media=window.matchMedia('(prefers-color-scheme: light)');function theme(){var light=preference==='light'||(preference==='auto'&&media.matches);document.body.classList.toggle('light',light);el('theme-toggle').setAttribute('aria-label',light?'Switch to dark theme':'Switch to light theme');document.documentElement.classList.toggle('light-ready',light);document.querySelector('meta[name="theme-color"]').content=light?'#fafafa':'#151515';}el('theme-toggle').addEventListener('click',function(){preference=document.body.classList.contains('light')?'dark':'light';try{localStorage.setItem('diabo-theme-v2',preference);}catch(e){}theme();});if(media.addEventListener)media.addEventListener('change',theme);theme();render();
})();
/* Diabo scan: photo -> on-device 7-segment read (seg7.js). Photo never leaves the phone. */
(function () {
  "use strict";
  var input = document.getElementById("scan-input");
  var pick = document.getElementById("scan-pick");
  var status = document.getElementById("scan-status");
  var img = document.getElementById("scan-img");
  var confirmBox = document.getElementById("scan-confirm");
  var numField = document.getElementById("scan-num");
  var saveBtn = document.getElementById("scan-save");
  var scanTag = "";
  var tagCtl = window.Diabo.fillTags(document.querySelector("#sheet-scan [data-tags]"), function (t) { scanTag = t; });

  pick.addEventListener("click", function () { input.click(); });
  input.addEventListener("change", function () {
    var f = input.files && input.files[0];
    if (!f) return;
    numField.value = "";
    confirmBox.classList.add("hidden");
    var url = URL.createObjectURL(f);
    img.onerror = function () { status.classList.remove("hidden"); status.textContent = "Could not open this photo - type the number you see:"; numField.value = ""; confirmBox.classList.remove("hidden"); URL.revokeObjectURL(url); };
    img.onload = function () {
      img.classList.remove("hidden");
      confirmBox.classList.add("hidden");
      numField.value = "";
      status.classList.remove("hidden");
      status.textContent = "Reading the number...";
      setTimeout(function () { analyze(img); }, 30);
    };
    img.src = url;
  });

  /* Live camera: crop the framing box from each video frame, read it, accept after agreeing reads. */
  var cam = document.getElementById("cam"), camWrap = document.getElementById("cam-wrap");
  var camStream = null, camTimer = 0, camFrame = null, camToken = 0, hist = [], camStart = 0;
  var work = document.createElement("canvas"), wctx = work.getContext("2d", { willReadFrequently: true });
  function stopCam() {
    camToken++; clearTimeout(camTimer);
    if(camFrame!==null && cam.cancelVideoFrameCallback){cam.cancelVideoFrameCallback(camFrame);camFrame=null;}
    if (camStream) camStream.getTracks().forEach(function(t){t.stop();});
    camStream=null;
    try { cam.pause(); } catch(e) {}
    cam.srcObject=null;
    camWrap.classList.add("hidden");
  }
  function startCam() {
    stopCam();
    hist = []; numField.value = ""; confirmBox.classList.add("hidden");
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.Seg7 && window.Seg7.readCrop)) {
      status.classList.remove("hidden"); status.textContent = "Camera not available here - choose a photo or type the number."; return;
    }
    var token = ++camToken;
    status.classList.remove("hidden"); status.textContent = "Opening camera...";
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then(function (s) {
      if (token !== camToken) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      camStream = s; cam.srcObject = s; camWrap.classList.remove("hidden");
      // Ask for continuous rear-camera focus when the browser exposes it.
      // Unsupported iPhone constraints are ignored; never block camera startup.
      var track = s.getVideoTracks()[0];
      if (track && track.getCapabilities && track.applyConstraints) {
        try {
          var caps = track.getCapabilities(), advanced = {};
          if (caps.focusMode && caps.focusMode.indexOf("continuous") >= 0) advanced.focusMode = "continuous";
          if (caps.exposureMode && caps.exposureMode.indexOf("continuous") >= 0) advanced.exposureMode = "continuous";
          if (Object.keys(advanced).length) track.applyConstraints({ advanced: [advanced] }).catch(function () {});
        } catch (e) {}
      }
      var p = cam.play(); if (p && p.catch) p.catch(function () {});
      status.textContent = "Fit the meter screen inside the box and hold steady.";
      confirmBox.classList.add("hidden"); camStart = Date.now();
      loop(token);
    }).catch(function () {
      if (token !== camToken) return;
      status.classList.remove("hidden");
      status.textContent = "Camera is off. Allow camera access, choose a photo, or type the number.";
    });
  }
  function frameRead() {
    var vw = cam.videoWidth, vh = cam.videoHeight;
    if (!vw || !vh) return "";
    var cw = camWrap.clientWidth || vw, ch = camWrap.clientHeight || vw, sc = Math.max(cw / vw, ch / vh);
    var bw = cw * 0.8, bh = bw / 1.2, bx = cw * 0.1, by = (ch - bh) / 2;
    var sx = (bx + (vw * sc - cw) / 2) / sc, sy = (by + (vh * sc - ch) / 2) / sc, sw = bw / sc, sh = bh / sc;
    var ow = Math.min(400, Math.round(sw)), oh = Math.round(ow * sh / sw);
    if(work.width!==ow)work.width=ow; if(work.height!==oh)work.height=oh;
    wctx.drawImage(cam, sx, sy, sw, sh, 0, 0, ow, oh);
    var d = wctx.getImageData(0, 0, ow, oh).data, g = new Uint8Array(ow * oh);
    for (var i = 0; i < g.length; i++) g[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
    return window.Seg7.readCrop(g, ow, oh);
  }
  function loop(token) {
    if (token !== camToken) return;
    var n = "";
    try { n = frameRead(); } catch (e) { n = ""; }
    if (!/^[0-9]{2,3}$/.test(n) || !window.Diabo.valid(n)) n = "";
    hist.push(n); if (hist.length > 5) hist.shift();
    var counts = {}, others = 0;
    hist.forEach(function (v) { if (v) counts[v] = (counts[v] || 0) + 1; });
    var keys = Object.keys(counts);
    if (keys.length === 1 && counts[keys[0]] >= 3) {
      var val = keys[0];
      stopCam();
      if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {}
      status.classList.remove("hidden");
      status.textContent = "Read it - check it against your meter before saving.";
      numField.value = val; confirmBox.classList.remove("hidden");
      return;
    }
    if (Date.now() - camStart > 15000) status.textContent = "Still looking. Fill the box with the screen, reduce glare, keep steady.";
    // Read the next fresh frame without the old fixed 150 ms pause. Keep all agreement checks.
    if(cam.requestVideoFrameCallback){camFrame=cam.requestVideoFrameCallback(function(){camFrame=null;loop(token);});}
    else camTimer = setTimeout(function () { loop(token); }, 50);
  }
  document.getElementById("m-scan").addEventListener("click", function () { startCam(); });
  new MutationObserver(function () { if (document.getElementById("sheet-scan").classList.contains("hidden")) stopCam(); })
    .observe(document.getElementById("sheet-scan"), { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", function () { if (document.hidden) stopCam(); });
  window.addEventListener("pagehide",stopCam);
  pick.addEventListener("click", stopCam);

  var fullW = 0, fullH = 0;
  function grabber(image) {
    return function (cw, ch, angDeg) {
      var c = document.createElement("canvas");
      c.width = cw; c.height = ch;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, cw, ch);
      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      if (angDeg) ctx.rotate(angDeg * Math.PI / 180);
      ctx.drawImage(image, -fullW / 2, -fullH / 2, fullW, fullH);
      ctx.restore();
      var d = ctx.getImageData(0, 0, cw, ch).data;
      var g = new Uint8Array(cw * ch);
      for (var i = 0; i < g.length; i++) g[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
      return g;
    };
  }

  function analyze(image) {
    var s = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    fullW = Math.max(1, Math.round(image.naturalWidth * s));
    fullH = Math.max(1, Math.round(image.naturalHeight * s));
    showResult(window.Seg7.read(grabber(image), fullW, fullH));
  }

  function showResult(n) {
    n = String(n || "");
    // Do not turn a partial/ambiguous read such as 1?7 into a different number.
    if (!/^[0-9]{2,3}$/.test(n)) n = "";
    if (n && window.Diabo.valid(n)) {
      status.classList.remove("hidden");
      status.textContent = "Suggested number - check it against your meter before saving.";
      numField.value = n;
    } else {
      status.classList.remove("hidden");
      status.textContent = "Could not read it - type the number you see:";
      numField.value = "";
    }
    confirmBox.classList.remove("hidden");
    numField.focus();
  }

  saveBtn.addEventListener("click", function () {
    var v = numField.value.trim();
    if (!window.Diabo.valid(v)) { numField.focus(); return; }
    if (window.Diabo.saveReading(+v, scanTag) === false) return;
    numField.value = "";
    tagCtl.set("");
    img.classList.add("hidden");
    confirmBox.classList.add("hidden");
    status.classList.add("hidden");
    input.value = "";
    document.getElementById("sheet-scan").classList.add("hidden");
  });
})();
/* Diabo voice entry via Web Speech API, with graceful fallback. */
(function () {
  "use strict";
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var go = document.getElementById("voice-go");
  var status = document.getElementById("voice-status");
  var confirmBox = document.getElementById("voice-confirm");
  var heard = document.getElementById("voice-heard");
  var numField = document.getElementById("voice-num");
  var saveBtn = document.getElementById("voice-save");
  var hint = document.getElementById("voice-hint");
  var voiceTag = "";
  var tagCtl = window.Diabo.fillTags(document.querySelector("#sheet-voice [data-tags]"), function (t) { voiceTag = t; });
  var rec = null, listening = false;

  if (!SR) {
    go.disabled = true;
    go.textContent = "Voice not supported here";
    hint.textContent = "Voice entry is not supported in this browser (iPhone home-screen apps may block it). The number pad works everywhere.";
    return;
  }

  function parse(text) {
    var t = String(text).toLowerCase();
    var m = t.match(/\d{2,3}/);
    var tag = window.Diabo.parseTag(t);
    return { value: m ? m[0] : "", tag: tag };
  }

  go.addEventListener("click", function () {
    if (listening) { try { rec.stop(); } catch (e) {} return; }
    rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = function (ev) {
      var text = ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript || "";
      var p = parse(text);
      heard.textContent = '"' + text + '"';
      numField.value = p.value;
      if(p.tag)tagCtl.set(p.tag);
      confirmBox.classList.remove("hidden");
      status.classList.add("hidden");
    };
    rec.onerror = function (ev) {
      listening = false;
      go.textContent = "Start listening";
      status.classList.remove("hidden");
      status.textContent = ev && ev.error === "not-allowed"
        ? "Microphone permission was denied. Allow it in Settings, or use the number pad."
        : "Voice did not work this time. Try again or use the number pad.";
    };
    rec.onend = function () {
      listening = false;
      go.textContent = "Start listening";
      if (confirmBox.classList.contains("hidden")) status.classList.add("hidden");
    };
    try {
      rec.start();
      listening = true;
      go.textContent = "Stop";
      status.classList.remove("hidden");
      status.textContent = "Listening...";
      confirmBox.classList.add("hidden");
    } catch (e) {
      status.classList.remove("hidden");
      status.textContent = "Voice did not start. Use the number pad instead.";
    }
  });

  saveBtn.addEventListener("click", function () {
    var v = numField.value.trim();
    if (!window.Diabo.valid(v)) { numField.focus(); return; }
    if (window.Diabo.saveReading(+v, voiceTag) === false) return;
    numField.value = "";
    heard.textContent = "";
    tagCtl.set("");
    confirmBox.classList.add("hidden");
    document.getElementById("sheet-voice").classList.add("hidden");
  });
})();

// Retention starts after deferred cloud-sync wrappers are ready.
window.addEventListener('DOMContentLoaded', function () {
/* Keep the last three India-calendar months. Cleanup uses normal sync deletions. */
(function () {
  'use strict';
  var D = window.Diabo;
  if (!D) return;
  var running = false;
  function indiaDay(time) {
    var d = new Date(time + 330 * 60000);
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  }
  function dayKey(parts) {
    return parts[0] + '-' + String(parts[1]).padStart(2, '0') + '-' + String(parts[2]).padStart(2, '0');
  }
  function cutoff(now) {
    var p = indiaDay(now), m = new Date(Date.UTC(p[0], p[1] - 4, 1));
    var last = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
    return dayKey([m.getUTCFullYear(), m.getUTCMonth() + 1, Math.min(p[2], last)]);
  }
  function expired(r, boundary) {
    if (!r || !Number.isSafeInteger(r.ts) || r.ts <= 0) return false;
    var date = D.readingDate(r);
    if (date) {
      var p = date.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
      if (d.getUTCFullYear() !== p[0] || d.getUTCMonth() + 1 !== p[1] || d.getUTCDate() !== p[2]) return false;
    } else date = dayKey(indiaDay(r.ts));
    return date < boundary;
  }
  function prune() {
    if (running) return;
    running = true;
    try {
      var boundary = cutoff(Date.now());
      D.load().forEach(function (r) { if (expired(r, boundary)) D.remove(r.id); });
      // This local migration backup must not retain expired glucose values.
      var key = 'diabo-before-sync-v1', raw = localStorage.getItem(key);
      if (raw !== null) {
        var list = JSON.parse(raw);
        if (Array.isArray(list)) {
          var keep = list.filter(function (r) { return !expired(r, boundary); });
          if (keep.length !== list.length) localStorage.setItem(key, JSON.stringify(keep));
        }
      }
    } catch (e) { console.warn('Diabo retention paused; retry on next open or sync.'); }
    finally { running = false; }
  }
  // Keep the existing sync wrappers. Their deletion markers prevent resurrection.
  ['save', 'restore', 'replaceReadings'].forEach(function (name) {
    var original = D[name];
    D[name] = function () {
      var result = original.apply(D, arguments);
      if (result !== false) prune();
      return result;
    };
  });
  window.addEventListener('diabo-authorized', prune);
  window.addEventListener('online', prune);
  window.addEventListener('pageshow', prune);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) prune(); });
  // Local-only clock checks; no network polling. An open app also ages out readings.
  setInterval(prune, 60000);
  prune();
})();

});
