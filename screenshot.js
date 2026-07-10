/**
 * Custom screenshot region picker (isolated world).
 * Returns viewport CSS-pixel rect via Promise.
 */
(function () {
  if (typeof window.__htfyStartScreenshotRegion === "function") return;

  window.__htfyStartScreenshotRegion = function startScreenshotRegion() {
    return new Promise((resolve, reject) => {
      const existing = document.getElementById("__htfy_shot_host__");
      existing?.remove();

      const host = document.createElement("div");
      host.id = "__htfy_shot_host__";
      host.setAttribute("data-h2d-ignore", "true");
      host.setAttribute("data-htfy-chrome", "1");
      host.style.cssText =
        "all:initial;position:fixed;inset:0;z-index:2147483646;cursor:crosshair;";
      const shadow = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = `
        * { box-sizing: border-box; }
        .veil {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.35);
          cursor: crosshair;
        }
        .box {
          position: fixed;
          border: 2px solid #89fe65;
          background: rgba(137,254,101,0.12);
          pointer-events: none;
          display: none;
        }
        .hint {
          position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
          background: #0a0a0ae6; color: #fff; padding: 10px 14px; border-radius: 12px;
          font: 600 12px system-ui, sans-serif; border: 1px solid rgba(137,254,101,.35);
          pointer-events: none; white-space: nowrap;
        }
      `;
      shadow.appendChild(style);

      const veil = document.createElement("div");
      veil.className = "veil";
      const box = document.createElement("div");
      box.className = "box";
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "Drag to select · Esc to cancel";
      shadow.appendChild(veil);
      shadow.appendChild(box);
      shadow.appendChild(hint);
      document.documentElement.appendChild(host);

      // Hide Send2Figma chrome while selecting
      const uiHost = document.getElementById("htfyRoot");
      const prevDisplay = uiHost?.style.display || "";
      if (uiHost) uiHost.style.display = "none";

      let startX = 0;
      let startY = 0;
      let dragging = false;
      let done = false;

      function cleanup() {
        document.removeEventListener("keydown", onKey, true);
        host.remove();
        if (uiHost) uiHost.style.display = prevDisplay;
      }

      function finish(rect) {
        if (done) return;
        done = true;
        cleanup();
        resolve(rect);
      }

      function cancel(err) {
        if (done) return;
        done = true;
        cleanup();
        reject(err || new Error("Cancelled"));
      }

      function onKey(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel(new Error("Cancelled"));
        }
      }

      veil.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        box.style.display = "block";
        box.style.left = startX + "px";
        box.style.top = startY + "px";
        box.style.width = "0px";
        box.style.height = "0px";
      });

      veil.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const x = Math.min(startX, e.clientX);
        const y = Math.min(startY, e.clientY);
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);
        box.style.left = x + "px";
        box.style.top = y + "px";
        box.style.width = w + "px";
        box.style.height = h + "px";
        hint.textContent = `${Math.round(w)} × ${Math.round(h)} · release to capture`;
      });

      veil.addEventListener("mouseup", (e) => {
        if (!dragging) return;
        dragging = false;
        const x = Math.min(startX, e.clientX);
        const y = Math.min(startY, e.clientY);
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);
        if (w < 4 || h < 4) {
          cancel(new Error("Selection too small"));
          return;
        }
        finish({ x, y, width: w, height: h });
      });

      document.addEventListener("keydown", onKey, true);
    });
  };
})();
