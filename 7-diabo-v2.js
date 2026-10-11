/* Diabo - blood sugar log. Data stays on device (localStorage). */
(function () {
  "use strict";
  var KEY = "diabo-readings-v1";
  var TAGS = ["fasting", "before meal", "after meal"];
  function baseTag(tag){return String(tag||"").split("|date=")[0];}
  function readingDate(r){var m=/\|date=(\d{4}-\d{2}-\d{2})$/.exec(String(r.tag||""));return m?m[1]:"";}
  function tagLabel(tag) {
    tag=baseTag(tag);
    return { fasting: "Morning", "before meal": "Afternoon", "after meal": "Evening",
      morning: "Morning", afternoon: "Afternoon", evening: "Evening" }[tag] || tag;
  }
  function parseTag(text) {
    var t = String(text).toLowerCase();
    return /\b(morning|fasting)\b/.test(t) ? "fasting"
      : /\b(evening|after)\b/.test(t) ? "after meal"
      : /\b(afternoon|before)\b/.test(t) ? "before meal" : "";
  }

  window.Diabo = {
    load: function () {
      try {
        var r = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(r) ? r : [];
      } catch (e) { return []; }
    },
    save: function (value, tag, timestamp) {
      var ts = timestamp === undefined ? Date.now() : timestamp;
      if (!Number.isSafeInteger(ts) || ts <= 0 || ts > Date.now()) return false;
      var list = window.Diabo.load();
      list.unshift({ id: Date.now() + "-" + Math.floor(Math.random() * 1e6), value: value, tag: tag || "", ts: ts });
      list.sort(function(a,b) { return b.ts-a.ts; });
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
      list.push(reading); list.sort(function(a,b) { return b.ts-a.ts; });
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
  window.Diabo.baseTag=baseTag;window.Diabo.readingDate=readingDate;
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
  function pickTag(t) {sharedTag=t;tagControls.forEach(function(c){c.update(t);});}
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
        pickTag(cur === t ? "" : t);
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
  window.Diabo.saveReading=function(value,tag){var d=new Date(readingDay+'T00:00:00'),ts=d.getTime();if(!readingDay||!Number.isSafeInteger(ts)||ts<=0||readingDay>localDate(new Date())||localDate(d)!==readingDay){document.querySelectorAll('.sheet:not(.hidden) [data-date-error]').forEach(function(e){e.textContent='Choose a valid date, not in the future.';e.classList.remove('hidden');e.scrollIntoView({block:'nearest'});});return false;}return window.Diabo.save(value,baseTag(tag)+'|date='+readingDay,ts);};
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
var D=window.Diabo, el=function(id){return document.getElementById(id);}, toastTimer, deleted;
function notify(text,undo){clearTimeout(toastTimer);el('toast-text').textContent=text;el('undo').classList.toggle('hidden',!undo);el('toast').classList.remove('hidden');toastTimer=setTimeout(function(){el('toast').classList.add('hidden');deleted=null;},5000);}
function validRange(r){return r&&Number.isFinite(Number(r.low))&&Number.isFinite(Number(r.high))&&Number(r.low)>=20&&Number(r.high)<=600&&Number(r.low)<Number(r.high);}
function ranges(){try{var raw=localStorage.getItem('diabo-ranges-v3');if(raw!==null)return JSON.parse(raw)||{};var old=JSON.parse(localStorage.getItem('diabo-range-v2'));if(validRange(old)){var next={morning:old,other:old};localStorage.setItem('diabo-ranges-v3',JSON.stringify(next));return next;}}catch(e){}return {};}
function rangeFor(reading){var all=ranges(),tag=D.baseTag(reading.tag),r=tag==='fasting'||tag==='morning'?all.morning:tag==='before meal'||tag==='after meal'||tag==='afternoon'||tag==='evening'?all.other:null;return validRange(r)?r:null;}
D.ranges=ranges;D.rangeFor=rangeFor;
function tone(reading){var r=rangeFor(reading);return !r?'':reading.value<r.low?'below':reading.value>r.high?'above':'within';}
function status(reading){var r=rangeFor(reading);return !r?'':reading.value<r.low?' · Below your range':reading.value>r.high?' · Above your range':' · Within your range';}
function render(){
var list=D.load().slice().sort(function(a,b){return b.ts-a.ts;}), now=new Date(), today=list.filter(function(r){return (D.readingDate(r)?new Date(D.readingDate(r)+'T00:00:00'):new Date(r.ts)).toDateString()===now.toDateString();});
el('delete-latest').classList.toggle('hidden',!list.length);
el('last-value').textContent=list.length?list[0].value:'--';el('last-value').className='stat-number '+(list.length?tone(list[0]):'');
el('last-detail').textContent=list.length?(D.readingDate(list[0])?new Date(D.readingDate(list[0])+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'}):new Date(list[0].ts).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}))+(D.baseTag(list[0].tag)?' · '+D.tagLabel(list[0].tag):'')+status(list[0]):'Your first reading starts here';
el('today-average').textContent=today.length?Math.round(today.reduce(function(s,r){return s+Number(r.value);},0)/today.length):'--';el('today-count').textContent=today.length+' reading'+(today.length===1?'':'s')+' today';
if(window.DiaboInsights)window.DiaboInsights.render();

}
el('add-reading').addEventListener('click',function(){D.resetReadingDate();document.querySelectorAll('.sheet').forEach(function(s){s.classList.add('hidden');});el('sheet-methods').classList.remove('hidden');el('m-pad').focus();});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){document.querySelectorAll('.sheet').forEach(function(s){s.classList.add('hidden');});el('add-reading').focus();}});
el('delete-latest').addEventListener('click',function(){var r=D.load().slice().sort(function(a,b){return b.ts-a.ts;})[0];if(!r)return;var when=D.readingDate(r)||new Date(r.ts).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});if(window.confirm('Delete '+r.value+' mg/dL'+(D.baseTag(r.tag)?' · '+D.tagLabel(r.tag):'')+' · '+when+'?'))D.remove(r.id);});
window.addEventListener('diabo-render',render);window.addEventListener('diabo-saved',function(){notify('Reading saved',false);el('add-reading').focus();});window.addEventListener('diabo-error',function(){notify('Storage is full or unavailable. Reading was not changed.',false);});window.addEventListener('diabo-deleted',function(e){deleted=e.detail;notify('Reading deleted',true);});el('undo').addEventListener('click',function(){if(deleted){D.restore(deleted);deleted=null;notify('Reading restored',false);}});

el('range-form').addEventListener('submit',function(e){e.preventDefault();var all={},bad=false;[['morning','range-low','range-high'],['other','range-other-low','range-other-high']].forEach(function(a){var low=el(a[1]).value,high=el(a[2]).value;if(!low&&!high)return;var r={low:Number(low),high:Number(high)};if(!low||!high||!validRange(r)){bad=true;return;}all[a[0]]=r;});if(bad){el('range-status').textContent='Enter both values from 20 to 600 for each range, with lower below upper. Leave both blank to skip a range.';return;}try{localStorage.setItem('diabo-ranges-v3',JSON.stringify(all));localStorage.removeItem('diabo-range-v2');}catch(e){notify('Could not save your ranges.',false);return;}el('range-status').textContent='Saved. Ranges follow the reading tag.';render();});el('range-clear').addEventListener('click',function(){localStorage.removeItem('diabo-range-v2');localStorage.setItem('diabo-ranges-v3','{}');['range-low','range-high','range-other-low','range-other-high'].forEach(function(id){el(id).value='';});el('range-status').textContent='No target ranges set. Readings use a neutral colour.';render();});var saved=ranges();[['morning','range-low','range-high'],['other','range-other-low','range-other-high']].forEach(function(a){var r=saved[a[0]];if(validRange(r)){el(a[1]).value=r.low;el(a[2]).value=r.high;}});
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
    var url = URL.createObjectURL(f);
    img.onload = function () {
      img.classList.remove("hidden");
      confirmBox.classList.add("hidden");
      status.classList.remove("hidden");
      status.textContent = "Reading the number...";
      setTimeout(function () { analyze(img); }, 30);
    };
    img.src = url;
  });

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
    n = (n || "").replace(/\D/g, "");
    if (n && window.Diabo.valid(n)) {
      status.classList.add("hidden");
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
