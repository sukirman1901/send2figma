/**
 * Inject / toggle Send2Figma dock + panel on the active page.
 * Runs in the extension isolated world (has chrome.* APIs).
 */
(function () {
  const HOST_ID = "htfyRoot";

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    const existing = host?.shadowRoot?.getElementById("htfyShell");
    // Remount if dock is outdated (missing Presets tool)
    if (existing && !host.shadowRoot.querySelector('.htfy-dock-item[data-action="preset"]')) {
      existing.__htfyCleanup?.();
      host.remove();
      host = null;
      try {
        delete globalThis.__htfyPanelApi;
      } catch (_) {
        globalThis.__htfyPanelApi = null;
      }
    }
    if (host?.shadowRoot?.getElementById("htfyShell")) return host;

    host?.remove();
    host = document.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("data-h2d-ignore", "true");
    host.setAttribute("data-htfy-chrome", "1");
    host.style.cssText =
      "all:initial;position:fixed;z-index:2147483646;top:0;left:0;width:0;height:0;pointer-events:none;";
    (document.documentElement || document.body).appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("ui/panel.css");
    shadow.appendChild(link);

    const api = globalThis.__htfyPanelApi;
    if (!api?.mount) {
      console.error("[Send2Figma] panel.js not loaded");
      return host;
    }
    api.mount(shadow, {
      onClose: () => {
        // Hide entire chrome (dock + panel)
        host.style.display = "none";
        host.dataset.htfyOpen = "0";
      },
    });
    host.dataset.htfyOpen = "1";
    return host;
  }

  function toggle() {
    let host = document.getElementById(HOST_ID);
    if (!host?.shadowRoot?.getElementById("htfyShell")) {
      host = ensureHost();
      host.style.display = "";
      host.dataset.htfyOpen = "1";
      return { open: true };
    }
    const open = host.dataset.htfyOpen !== "0" && host.style.display !== "none";
    if (open) {
      host.style.display = "none";
      host.dataset.htfyOpen = "0";
      return { open: false };
    }
    host.style.display = "";
    host.dataset.htfyOpen = "1";
    return { open: true };
  }

  globalThis.__htfyTogglePanel = toggle;
  return toggle();
})();
