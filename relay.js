window.__htfyRelayInjected ||
  ((window.__htfyRelayInjected = true),
  document.addEventListener("__htfy_progress__", (e) => {
    try {
      chrome.runtime.sendMessage({
        type: "htfy_PROGRESS",
        text: e.detail.text,
        isError: !!e.detail.isError,
      });
    } catch (_) {}
  }),
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.type !== "__htfy_css_resolve__") return;
    chrome.runtime.sendMessage({ type: "htfy_RESOLVE_CSS", sheets: data.sheets || [] }, (res) => {
      window.postMessage(
        {
          type: "__htfy_css_resolved__",
          id: data.id,
          cssText: (res && res.cssText) || "",
          ok: !!(res && res.ok),
        },
        "*"
      );
    });
  }),
  document.addEventListener("__htfy_capture_selector__", (e) => {
    try {
      chrome.runtime.sendMessage({ type: "htfy_CAPTURE", selector: e.detail.selector });
    } catch (_) {}
  }));
