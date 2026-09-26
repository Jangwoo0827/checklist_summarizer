(function (root) {
  "use strict";
  var CN = root.CN = root.CN || {};
  var util = CN.util;

  var OLLAMA_BASE = "http://localhost:11434";
  var MODEL_KEY = "checklist_note_model_v1";
  // minicpm-v reads dense Korean text far better than llava, which tends to invent content.
  var DEFAULT_MODEL = "minicpm-v";
  // Larger images mostly add latency; this keeps small print legible while cutting upload/encode time.
  var MAX_EDGE_PX = 1600;
  var PROMPT = "이 이미지는 숙제나 할 일 목록이 적힌 사진이야. 이미지에 실제로 적혀 있는 텍스트만 그대로 옮겨 적어줘 — 내용을 지어내거나 추측해서 채우면 안 돼. 위에서 아래 순서 그대로, 원래 적혀 있는 번호나 기호(예: '1.', '1)', '-') 형식을 그대로 유지해서 한 줄에 한 항목씩 옮겨 적어줘. 글자가 흐리거나 잘 안 보이는 부분은 지어내지 말고 그 줄에 '[읽을 수 없음]'이라고 써줘. 목록에 없는 설명, 인사말, 코드블록 표시는 절대 넣지 말고 목록 내용만 출력해줘.";

  function preferredModel() { return util.readString(MODEL_KEY) || DEFAULT_MODEL; }
  function setPreferredModel(name) { util.writeString(MODEL_KEY, name); }

  function timeoutSignal(ms) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, ms);
    return { signal: controller.signal, done: function () { clearTimeout(timer); } };
  }

  // Installed models that accept images. Ollama builds that don't report capabilities are kept.
  function listVisionModels() {
    var t = timeoutSignal(4000);
    return fetch(OLLAMA_BASE + "/api/tags", { signal: t.signal })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        var names = (json.models || []).map(function (m) { return m.name; });
        return Promise.all(names.map(function (name) {
          return fetch(OLLAMA_BASE + "/api/show", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: name }),
            signal: t.signal
          })
            .then(function (res) { return res.ok ? res.json() : null; })
            .catch(function () { return null; })
            .then(function (info) {
              var caps = info && info.capabilities;
              return !caps || caps.indexOf("vision") !== -1 ? name : null;
            });
        }));
      })
      .then(function (names) { return names.filter(Boolean); })
      .finally(t.done);
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error("이미지를 읽지 못했어요.")); };
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("이 이미지 형식은 열 수 없어요. PNG나 JPG로 다시 올려주세요.")); };
      img.src = src;
    });
  }

  // Returns { previewUrl, base64 } with the image downscaled and re-encoded when that helps.
  function prepareImage(file) {
    return readAsDataURL(file).then(function (dataUrl) {
      return loadImage(dataUrl).then(function (img) {
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        var scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h));
        if (scale === 1 && /^image\/(png|jpeg)$/.test(file.type)) {
          return { previewUrl: dataUrl, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
        }
        var canvas = root.document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        var ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#ffffff"; // transparent areas would otherwise turn black in JPEG
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var jpeg = canvas.toDataURL("image/jpeg", 0.92);
        return { previewUrl: dataUrl, base64: jpeg.slice(jpeg.indexOf(",") + 1) };
      });
    });
  }

  function friendlyModelError(message, model) {
    if (/not found/i.test(message)) {
      return new Error("'" + model + "' 모델이 없어요. 터미널에서 'ollama pull " + model + "' 로 먼저 받아주세요.");
    }
    return new Error(message);
  }

  function cleanup(text) {
    return text.replace(/^\s*```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
  }

  // Streams the transcription. onText receives the accumulated text as it grows.
  function recognize(opts) {
    var started = Date.now();
    var text = "";
    return fetch(OLLAMA_BASE + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify({
        model: opts.model,
        stream: true,
        keep_alive: "15m", // keep the model loaded so the next photo skips the load time
        options: { temperature: 0 },
        messages: [{ role: "user", content: PROMPT, images: [opts.base64] }]
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          throw friendlyModelError(json.error || ("Ollama 응답 " + res.status), opts.model);
        });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      function handleLine(line) {
        if (!line.trim()) return;
        var msg = JSON.parse(line);
        if (msg.error) throw friendlyModelError(msg.error, opts.model);
        var piece = msg.message && msg.message.content;
        if (piece) {
          text += piece;
          if (opts.onText) opts.onText(text);
        }
      }

      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) {
            handleLine(buffer);
            return;
          }
          buffer += decoder.decode(chunk.value, { stream: true });
          var lines = buffer.split("\n");
          buffer = lines.pop();
          lines.forEach(handleLine);
          return pump();
        });
      }

      return pump().then(function () {
        return { text: cleanup(text), seconds: (Date.now() - started) / 1000 };
      });
    }).catch(function (err) {
      err.partialText = cleanup(text);
      throw err;
    });
  }

  CN.ocr = {
    DEFAULT_MODEL: DEFAULT_MODEL,
    preferredModel: preferredModel,
    setPreferredModel: setPreferredModel,
    listVisionModels: listVisionModels,
    prepareImage: prepareImage,
    recognize: recognize
  };
})(window);
