/**
 * Element picker — runs in the extension isolated world (same as panel UI).
 * Call window.__htfyStartPicker({ preview, qualityMode }) from the panel.
 *
 * Always rebinds __htfyStartPicker so extension reloads pick up fixes without a full tab refresh.
 */
(() => {
  const PICK_ATTR = "data-h2d-pick";

  function isOurUi(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      if (el.id === "htfyRoot" || el.id === "__htfy_picker_host__") return true;
      if (el.getAttribute?.("data-h2d-ignore") === "true") return true;
      if (el.closest?.("#htfyRoot, #__htfy_picker_host__, [data-h2d-ignore='true']")) return true;
      const root = el.getRootNode?.();
      if (root && root !== document && root.host) {
        const host = root.host;
        if (
          host.id === "htfyRoot" ||
          host.id === "__htfy_picker_host__" ||
          host.getAttribute?.("data-h2d-ignore") === "true"
        ) {
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el === document.documentElement || el === document.body) return false;
    if (isOurUi(el)) return false;
    try {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 1 && r.height >= 1;
    } catch {
      return false;
    }
  }

  function hitTest(x, y) {
    const stack = document.elementsFromPoint?.(x, y) || [document.elementFromPoint(x, y)];
    for (const el of stack) {
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  /** ArrowUp = parent (refine outward). */
  function parentVisible(el) {
    let p = el?.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      if (isVisible(p)) return p;
      p = p.parentElement;
    }
    return null;
  }

  /** ArrowDown = first visible child (refine inward). */
  function firstVisibleChild(el) {
    if (!el) return null;
    const walk = (node) => {
      for (const child of node.children || []) {
        if (isVisible(child)) return child;
        const deeper = walk(child);
        if (deeper) return deeper;
      }
      return null;
    };
    return walk(el);
  }

  function clearPickMarks() {
    try {
      document.querySelectorAll(`[${PICK_ATTR}]`).forEach((n) => n.removeAttribute(PICK_ATTR));
    } catch (_) {}
  }

  function markForCapture(el) {
    clearPickMarks();
    const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    el.setAttribute(PICK_ATTR, id);
    return `[${PICK_ATTR}="${id}"]`;
  }

  function emitDone(detail) {
    try {
      document.dispatchEvent(new CustomEvent("__htfy_picker_done__", { detail }));
    } catch (_) {}
  }

  window.__htfyStartPicker = function startPicker(opts = {}) {
    // Tear down any previous session
    document.getElementById("__htfy_picker_host__")?.remove();
    if (window.__htfyPickerCleanup) {
      try {
        window.__htfyPickerCleanup();
      } catch (_) {}
      window.__htfyPickerCleanup = null;
    }
    clearPickMarks();

    const uiHost = document.getElementById("htfyRoot");
    const prev = {
      visibility: uiHost?.style.visibility || "",
      pointerEvents: uiHost?.style.pointerEvents || "",
      display: uiHost?.style.display || "",
    };
    if (uiHost) {
      uiHost.style.visibility = "hidden";
      uiHost.style.pointerEvents = "none";
    }

    const host = document.createElement("div");
    host.id = "__htfy_picker_host__";
    host.setAttribute("data-h2d-ignore", "true");
    host.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
    (document.documentElement || document.body).appendChild(host);
    const root = host.attachShadow({ mode: "open" });

    const highlight = document.createElement("div");
    highlight.style.cssText =
      "position:fixed;pointer-events:none;z-index:2;border:2px solid #89fe65;background:rgba(137,254,101,0.12);box-sizing:border-box;display:none;";
    root.appendChild(highlight);

    const tag = document.createElement("div");
    tag.style.cssText =
      "position:fixed;z-index:3;background:#0a0a0a;color:#fff;padding:6px 10px;border-radius:8px;font:12px/1.3 Epilogue,system-ui,sans-serif;pointer-events:none;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid #2a2a2a;display:none;";
    root.appendChild(tag);

    const hint = document.createElement("div");
    hint.textContent = "Click to capture · ↑ parent · ↓ child · Esc cancel";
    hint.style.cssText =
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:4;background:#0a0a0ae6;color:#fff;padding:10px 14px;border-radius:12px;font:600 12px Epilogue,system-ui,sans-serif;border:1px solid rgba(137,254,101,.35);pointer-events:none;backdrop-filter:blur(12px);";
    root.appendChild(hint);

    let current = null;
    let finished = false;
    // Select defaults to instant clipboard write (preview opt-in only).
    const usePreview = opts.preview === true;

    function restoreUi() {
      if (!uiHost) return;
      uiHost.style.visibility = prev.visibility;
      uiHost.style.pointerEvents = prev.pointerEvents;
      uiHost.style.display = prev.display;
    }

    function paint(el) {
      current = el;
      if (!el) {
        highlight.style.display = "none";
        tag.style.display = "none";
        return;
      }
      const r = el.getBoundingClientRect();
      highlight.style.display = "block";
      highlight.style.top = r.top + "px";
      highlight.style.left = r.left + "px";
      highlight.style.width = r.width + "px";
      highlight.style.height = r.height + "px";
      const label = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} · ${Math.round(r.width)}×${Math.round(r.height)}`;
      tag.style.display = "block";
      tag.textContent = label;
      let tx = r.left;
      let ty = r.top - 30;
      if (ty < 8) ty = r.bottom + 8;
      if (tx + 180 > window.innerWidth) tx = window.innerWidth - 190;
      tag.style.left = Math.max(8, tx) + "px";
      tag.style.top = ty + "px";
    }

    function cleanup() {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      restoreUi();
      window.__htfyPickerCleanup = null;
    }
    window.__htfyPickerCleanup = cleanup;

    function onMove(e) {
      const el = hitTest(e.clientX, e.clientY);
      if (!el) return;
      paint(el);
    }

    function onMouseDown(e) {
      if (isOurUi(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }

    function onClick(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (finished) return;

      const el = hitTest(e.clientX, e.clientY) || current;
      if (!el || !isVisible(el)) return;

      finished = true;
      // Stable target for MAIN-world capture (avoids fragile CSS paths).
      const selector = markForCapture(el);
      const label = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}`;
      const size = (() => {
        try {
          const r = el.getBoundingClientRect();
          return `${Math.round(r.width)}×${Math.round(r.height)}`;
        } catch {
          return "";
        }
      })();
      cleanup();

      const payload = {
        type: "htfy_CAPTURE",
        selector,
        captureLabel: size ? `${label} (${size})` : label,
        preview: usePreview,
        qualityMode: opts.qualityMode || "editable",
      };

      try {
        chrome.runtime.sendMessage(payload, (res) => {
          const err = chrome.runtime.lastError?.message;
          // Clean mark after capture attempt (MAIN world may have already read it).
          clearPickMarks();
          emitDone({
            ok: !err && !!(res && res.ok),
            result: res || null,
            error: err || res?.error || null,
            selector,
            label,
          });
        });
      } catch (err) {
        clearPickMarks();
        document.dispatchEvent(
          new CustomEvent("__htfy_capture_selector__", { detail: { selector, label } })
        );
        emitDone({
          ok: false,
          result: null,
          error: err.message || String(err),
          selector,
          label,
        });
      }
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (finished) return;
        finished = true;
        cleanup();
        clearPickMarks();
        emitDone({ ok: false, cancelled: true, result: null });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const p = current ? parentVisible(current) : null;
        if (p) paint(p);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const n = current ? firstVisibleChild(current) : null;
        if (n) paint(n);
        return;
      }
      if (e.key === "Enter" && current) {
        onClick(e);
      }
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  };

  window.__htfyPickerLoaded = true;
})();
