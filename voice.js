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
    var tag = /fasting/.test(t) ? "fasting"
      : /after/.test(t) ? "after meal"
      : /before/.test(t) ? "before meal" : "";
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
    window.Diabo.save(+v, voiceTag);
    numField.value = "";
    heard.textContent = "";
    tagCtl.set("");
    confirmBox.classList.add("hidden");
    document.getElementById("sheet-voice").classList.add("hidden");
  });
})();
