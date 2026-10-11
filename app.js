/* Diabo - blood sugar log. Data stays on device (localStorage). */
(function () {
  "use strict";
  var KEY = "diabo-readings-v1";
  var TAGS = ["fasting", "before meal", "after meal"];

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
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
      renderHistory();
    },
    remove: function (id) {
      var list = window.Diabo.load().filter(function (r) { return r.id !== id; });
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
      renderHistory();
    },
    valid: function (v) { return /^\d{2,3}$/.test(String(v)) && +v >= 20 && +v <= 600; }
  };

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
        (r.tag ? '<span class="htag">' + esc(r.tag) + "</span>" : "") +
        '<span class="hwhen">' + fmtWhen(r.ts) + "</span>" +
        '<button class="hdel" data-del="' + esc(r.id) + '" type="button" aria-label="delete">✕</button></li>';
    }).join("");
  }

  function fillTags(container, onPick) {
    container.innerHTML = "";
    var cur = "";
    TAGS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tag";
      b.textContent = t;
      b.addEventListener("click", function () {
        cur = cur === t ? "" : t;
        Array.prototype.forEach.call(container.children, function (c) { c.classList.toggle("on", c.textContent === cur); });
        onPick(cur);
      });
      container.appendChild(b);
    });
    return {
      set: function (t) {
        cur = TAGS.indexOf(t) >= 0 ? t : "";
        Array.prototype.forEach.call(container.children, function (c) { c.classList.toggle("on", c.textContent === cur); });
        onPick(cur);
      }
    };
  }
  window.Diabo.fillTags = fillTags;

  /* sheet switching */
  var sheets = { "m-scan": "sheet-scan", "m-pad": "sheet-pad", "m-voice": "sheet-voice" };
  Object.keys(sheets).forEach(function (btnId) {
    document.getElementById(btnId).addEventListener("click", function () {
      Object.keys(sheets).forEach(function (k) {
        document.getElementById(sheets[k]).classList.toggle("hidden", k !== btnId);
      });
      document.getElementById(sheets[btnId]).scrollIntoView({ behavior: "smooth", block: "nearest" });
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
      document.getElementById("pad-val").textContent = padVal || "0";
      return;
    }
    window.Diabo.save(+padVal, padTag);
    padVal = "";
    document.getElementById("pad-val").textContent = "0";
    document.getElementById("sheet-pad").classList.add("hidden");
  });

  renderHistory();
})();
