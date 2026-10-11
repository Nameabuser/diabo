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
    window.Diabo.save(+v, scanTag);
    numField.value = "";
    tagCtl.set("");
    img.classList.add("hidden");
    confirmBox.classList.add("hidden");
    status.classList.add("hidden");
    input.value = "";
    document.getElementById("sheet-scan").classList.add("hidden");
  });
})();
