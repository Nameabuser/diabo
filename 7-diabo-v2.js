/* Diabo - blood sugar log. Data stays on device (localStorage). */
(function () {
  "use strict";
  var KEY = "diabo-readings-v1";
  var TAGS = ["fasting", "before meal", "after meal"];
  function tagLabel(tag) {
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
    save: function (value, tag) {
      var list = window.Diabo.load();
      list.unshift({ id: Date.now() + "-" + Math.floor(Math.random() * 1e6), value: value, tag: tag || "", ts: Date.now() });
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
  window.Diabo.parseTag = parseTag;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtWhen(ts) {
    var d = new Date(ts), now = new Date();
    var day = d.toDateString() === now.toDateString() ? "Today"
      : d.toDateString() === new Date(now.getTime() - 864e5).toDateString() ? "Yesterday"
      : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    var time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    return day + "<br>" + time;
  }

  function renderHistory() {
    var ul = document.getElementById("hist");
    var empty = document.getElementById("hist-empty");
    var list = window.Diabo.load();
    empty.classList.toggle("hidden", list.length > 0);
    ul.innerHTML = list.map(function (r) {
      return '<li><span class="hv">' + esc(r.value) + "<small>mg/dL</small></span>" +
        (r.tag ? '<span class="htag">' + esc(tagLabel(r.tag)) + "</span>" : "") +
        '<span class="hwhen">' + fmtWhen(r.ts) + "</span>" +
        '<button class="hdel" data-del="' + esc(r.id) + '" type="button" aria-label="delete">✕</button></li>';
    }).join("");
    window.dispatchEvent(new CustomEvent("diabo-render"));
  }

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
        cur = cur === t ? "" : t;
        Array.prototype.forEach.call(container.children, function (c) { c.classList.toggle("on", c.getAttribute("data-tag") === cur); });
        onPick(cur);
      });
      container.appendChild(b);
    });
    return {
      set: function (t) {
        cur = TAGS.indexOf(t) >= 0 ? t : "";
        Array.prototype.forEach.call(container.children, function (c) { c.classList.toggle("on", c.getAttribute("data-tag") === cur); });
        onPick(cur);
      }
    };
  }
  window.Diabo.fillTags = fillTags;

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

  document.getElementById("hist").addEventListener("click", function (e) {
    var b = e.target.closest("[data-del]");
    if (b) window.Diabo.remove(b.getAttribute("data-del"));
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
    if (window.Diabo.save(+padVal, padTag) === false) return;
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
function range(){try{var r=JSON.parse(localStorage.getItem('diabo-range-v2'));return r&&r.low>=20&&r.high<=600&&r.low<r.high?r:null;}catch(e){return null;}}
function tone(value){var r=range();return !r?'':value<r.low?'below':value>r.high?'above':'within';}
function status(value){var r=range();return !r?'':value<r.low?' · Below your range':value>r.high?' · Above your range':' · Within your range';}
function render(){
var list=D.load().slice().sort(function(a,b){return b.ts-a.ts;}), now=new Date(), today=list.filter(function(r){return new Date(r.ts).toDateString()===now.toDateString();});
el('last-value').textContent=list.length?list[0].value:'--';el('last-value').className='stat-number '+(list.length?tone(list[0].value):'');
el('last-detail').textContent=list.length?new Date(list[0].ts).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+(list[0].tag?' · '+D.tagLabel(list[0].tag):'')+status(list[0].value):'Your first reading starts here';
el('today-average').textContent=today.length?Math.round(today.reduce(function(s,r){return s+Number(r.value);},0)/today.length):'--';el('today-count').textContent=today.length+' reading'+(today.length===1?'':'s')+' today';
var days=[];for(var i=6;i>=0;i--){var date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);var rows=list.filter(function(r){return new Date(r.ts).toDateString()===date.toDateString();});days.push({date:date,v:rows.length?Math.round(rows.reduce(function(s,r){return s+Number(r.value);},0)/rows.length):null});}
var max=Math.max.apply(null,days.map(function(d){return d.v||0;}))||1;
el('week-chart').innerHTML='<div class="week-bars">'+days.map(function(d){var day=d.date.toLocaleDateString('en-IN',{weekday:'short'});return '<div class="day-bar" aria-label="'+day+': '+(d.v===null?'no readings':d.v+' mg/dL average')+'"><span class="bar-value">'+(d.v===null?'·':d.v)+'</span><div class="bar" style="height:'+(d.v===null?3:Math.max(8,90*d.v/max))+'px;'+(d.v===null?'opacity:.12':'')+'"></div><span class="bar-label">'+day+'</span></div>';}).join('')+'</div>';
el('week-caption').textContent='Daily averages · relative bars from zero · missing days stay blank';
Array.prototype.forEach.call(document.querySelectorAll('#hist li'),function(li,index){var r=list[index];if(r){li.querySelector('.hv').className='hv '+tone(r.value);li.querySelector('[data-del]').setAttribute('aria-label','Delete '+r.value+' reading');}});
}
el('add-reading').addEventListener('click',function(){document.querySelectorAll('.sheet').forEach(function(s){s.classList.add('hidden');});el('sheet-methods').classList.remove('hidden');el('m-pad').focus();});
document.addEventListener('keydown',function(e){if(e.key==='Escape'){document.querySelectorAll('.sheet').forEach(function(s){s.classList.add('hidden');});el('add-reading').focus();}});
window.addEventListener('diabo-render',render);window.addEventListener('diabo-saved',function(){notify('Reading saved',false);el('add-reading').focus();});window.addEventListener('diabo-error',function(){notify('Storage is full or unavailable. Reading was not changed.',false);});window.addEventListener('diabo-deleted',function(e){deleted=e.detail;notify('Reading deleted',true);});el('undo').addEventListener('click',function(){if(deleted){D.restore(deleted);deleted=null;notify('Reading restored',false);}});
var startX=0,startY=0;el('hist').addEventListener('touchstart',function(e){startX=e.changedTouches[0].clientX;startY=e.changedTouches[0].clientY;},{passive:true});el('hist').addEventListener('touchend',function(e){var t=e.changedTouches[0];if(startX-t.clientX>85&&Math.abs(startY-t.clientY)<35){var row=e.target.closest('li');if(row)D.remove(row.querySelector('[data-del]').getAttribute('data-del'));}},{passive:true});
el('range-form').addEventListener('submit',function(e){e.preventDefault();var low=Number(el('range-low').value),high=Number(el('range-high').value);if(low<20||high>600||low>=high){el('range-status').textContent='Choose a lower and upper value from 20 to 600.';return;}try{localStorage.setItem('diabo-range-v2',JSON.stringify({low:low,high:high}));}catch(e){notify('Could not save your range.',false);return;}el('range-status').textContent='Colours use your personal '+low+'–'+high+' mg/dL range.';render();});el('range-clear').addEventListener('click',function(){localStorage.removeItem('diabo-range-v2');el('range-low').value='';el('range-high').value='';el('range-status').textContent='No target range set. Numbers use a neutral colour.';render();});var r=range();if(r){el('range-low').value=r.low;el('range-high').value=r.high;}
var preference='auto';try{preference=localStorage.getItem('diabo-theme-v2')||'auto';}catch(e){}var media=window.matchMedia('(prefers-color-scheme: light)');function theme(){var light=preference==='light'||(preference==='auto'&&media.matches);document.body.classList.toggle('light',light);el('theme-toggle').setAttribute('aria-label','Theme: '+preference+'. Tap to change');document.querySelector('meta[name="theme-color"]').content=light?'#fff8f2':'#1b1319';}el('theme-toggle').addEventListener('click',function(){preference=preference==='auto'?'dark':preference==='dark'?'light':'auto';try{localStorage.setItem('diabo-theme-v2',preference);}catch(e){}theme();notify('Theme: '+preference,false);});if(media.addEventListener)media.addEventListener('change',theme);theme();render();
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
    if (window.Diabo.save(+v, scanTag) === false) return;
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
      tagCtl.set(p.tag);
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
    if (window.Diabo.save(+v, voiceTag) === false) return;
    numField.value = "";
    heard.textContent = "";
    tagCtl.set("");
    confirmBox.classList.add("hidden");
    document.getElementById("sheet-voice").classList.add("hidden");
  });
})();
