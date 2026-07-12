/**
 * Send2Figma in-page panel (SuperDev-style).
 * Mounted into an open shadow root by panel-boot.js.
 */
(function () {
  // Always refresh API so dock/panel markup stays current after extension reload.
  const ICON = () => chrome.runtime.getURL("icons/icon32.png");
  const ri = (name) => (globalThis.__htfyReicons && globalThis.__htfyReicons[name]) || "";

  function dockItem(action, iconKey, tip, extraClass = "") {
    return `<button type="button" class="htfy-dock-item ${extraClass}" data-action="${action}" aria-label="${tip}">
      ${ri(iconKey)}
      <span class="htfy-dock-tip">${tip}</span>
    </button>`;
  }

  function shellHTML() {
    const icon = ICON();
    return `
<div class="htfy-shell" id="htfyShell" data-h2d-ignore="true">
  <div class="htfy-dock-container">
    <div class="htfy-dock" id="htfyDock">
      <div class="htfy-dock-tools">
        ${dockItem("preset", "monitor", "Presets")}
        ${dockItem("custom", "edit", "Custom width")}
        ${dockItem("select", "select", "Select element")}
        ${dockItem("design", "layers", "Design system")}
        ${dockItem("screenshot", "camera", "Take screenshot")}
      </div>
      <div class="htfy-dock-sep"></div>
      <div class="htfy-dock-system">
        ${dockItem("settings", "settings", "Settings")}
      </div>
    </div>
  </div>

<div class="htfy-panel" id="htfyPanel" data-h2d-ignore="true">
  <div class="htfy-header">
    <div class="htfy-brand">
      <div class="htfy-brand-mark" id="htfyToolIcon" aria-hidden="true">${ri("monitor")}</div>
      <div>
        <div class="htfy-brand-name" id="htfyToolTitle">Presets</div>
        <div class="htfy-brand-sub" id="htfyToolSub">Device width capture</div>
      </div>
    </div>
    <div class="htfy-header-controls">
      <button type="button" class="htfy-icon-btn" id="htfyMinimize" title="Minimize" aria-label="Minimize">${ri("minus")}</button>
      <button type="button" class="htfy-icon-btn" id="htfyClose" title="Close" aria-label="Close">${ri("close")}</button>
    </div>
  </div>
  <div class="htfy-body">
    <div id="authLoading" class="auth-loading hidden"><div class="spinner"></div></div>
    <div id="authView" class="auth-view hidden">
      <div class="htfy-brand-mark" style="margin:0 auto"><img src="${icon}" alt=""></div>
      <h2>Sign in to Send2Figma</h2>
      <p class="sub">Sync your export count and unlock Pro across devices.</p>
      <button id="googleSignIn" class="google-btn" type="button">
        <svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.5-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34 5.1 29.3 3 24 3c-7.4 0-13.8 4.1-17.7 11.7z"/><path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 36.3 26.7 37 24 37c-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.2 40.8 16 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 36 44 30.8 44 24c0-1.4-.1-2.5-.4-3.5z"/></svg>
        Continue with Google
      </button>
      <div id="authError" class="auth-error"></div>
    </div>

    <div id="appView">
      <div class="app-top">
        <div class="user-menu-wrap" style="position:relative">
          <button id="userChip" class="user-chip hidden" type="button">
            <div id="userAvatar" class="user-avatar">?</div>
            <span id="userNameLabel" class="user-name">Account</span>
          </button>
          <div id="userMenu" class="user-menu">
            <div id="userEmailLabel" class="menu-email"></div>
            <button id="managePlanBtn" class="hidden" type="button">Manage subscription</button>
            <button id="billingHistoryBtn" type="button">Billing history</button>
            <button id="signOutBtn" type="button">Sign out</button>
          </div>
        </div>
      </div>
      <div id="billingError" class="auth-error"></div>


      <div id="toolPreset" class="tool-view active" data-tool="preset">
        <p class="tool-lead">Capture at a device preset width.</p>
        <label class="multi-toggle-row">
          <span class="switch"><input type="checkbox" id="multiSizeToggle"><span class="switch-track"><span class="switch-thumb"></span></span></span>
          <span class="multi-toggle-label">Capture multiple sizes</span>
        </label>
        <div class="select-root" id="devicePresetSelect">
          <button type="button" class="select-trigger" id="devicePresetTrigger" aria-haspopup="listbox">
            <span id="devicePresetLabel">iPhone (375px)</span>
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="select-content" id="devicePresetContent" role="listbox">
            <div class="select-item selected" data-value="375" role="option"><span>iPhone (375px)</span><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="select-item" data-value="360" role="option"><span>Android (360px)</span><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="select-item" data-value="768" role="option"><span>iPad (768px)</span><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="select-item" data-value="1440" role="option"><span>Desktop (1440px)</span><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          </div>
          <select id="devicePreset" class="sr-only-select" tabindex="-1" aria-hidden="true">
            <option value="375">iPhone (375px)</option>
            <option value="360">Android (360px)</option>
            <option value="768">iPad (768px)</option>
            <option value="1440">Desktop (1440px)</option>
          </select>
        </div>
        <div id="presetMultiList" class="preset-multi-list hidden">
          <label class="preset-checkbox-row"><input type="checkbox" class="preset-multi-checkbox" value="375" data-label="iPhone (375px)"><span>iPhone (375px)</span></label>
          <label class="preset-checkbox-row"><input type="checkbox" class="preset-multi-checkbox" value="360" data-label="Android (360px)"><span>Android (360px)</span></label>
          <label class="preset-checkbox-row"><input type="checkbox" class="preset-multi-checkbox" value="768" data-label="iPad (768px)"><span>iPad (768px)</span></label>
          <label class="preset-checkbox-row"><input type="checkbox" class="preset-multi-checkbox" value="1440" data-label="Desktop (1440px)"><span>Desktop (1440px)</span></label>
        </div>
      </div>

      <div id="toolCustom" class="tool-view" data-tool="custom">
        <p class="tool-lead">Capture at a custom viewport width.</p>
        <input type="number" id="customWidth" placeholder="Enter width in pixels" value="1200">
      </div>

      <div id="toolSelect" class="tool-view" data-tool="select">
        <p class="tool-lead">Pick one element — it copies to the clipboard automatically, then paste into Figma.</p>
        <button id="startSelection" type="button">Select an element</button>
        <div class="element-preview" id="elementPreview">
          <div class="label">Selected element</div>
          <div class="value" id="selectedElementInfo">None</div>
        </div>
      </div>

      <div id="toolDesign" class="tool-view" data-tool="design">
        <p class="tool-lead">Extract tokens from this page. Export .md for AI, or .json for the Figma plugin.</p>
        <button type="button" id="extractDesignSystem" class="design-extract-btn">Extract from page</button>
        <div id="designSystemEmpty" class="design-empty">
          No tokens yet. Extract from this page — no Figma capture needed.
        </div>
        <div id="designSystemReady" class="design-ready hidden">
          <p id="designSystemSummary" class="design-summary"></p>
          <p id="designSystemMeta" class="design-meta"></p>
          <div class="design-export-row">
            <button type="button" id="exportDesignSystemMain" class="primary-outline">Export .md</button>
            <button type="button" id="exportDesignSystemJson" class="primary-outline">Export .json</button>
          </div>
        </div>
      </div>

      <div id="toolScreenshot" class="tool-view" data-tool="screenshot">
        <p class="tool-lead">Save a PNG of the page — like DevTools Capture screenshot.</p>
        <div class="shot-actions">
          <button type="button" class="design-extract-btn" data-shot="visible">Visible area</button>
          <button type="button" class="primary-outline" data-shot="fullPage">Full page</button>
          <button type="button" class="primary-outline" data-shot="custom">Custom region</button>
        </div>
        <p class="design-meta" style="margin-top:10px">Downloads to your computer. Dock hides while capturing.</p>
      </div>

      <div id="toolSettings" class="tool-view" data-tool="settings">
        <p class="tool-lead">Defaults for capture and MCP.</p>

        <div class="section-label">Capture defaults</div>
        <div class="quality-row" id="settingsQualityRow">
          <label><input type="radio" name="settingsQualityMode" id="settingsQualityEditable" value="editable" checked> Editable</label>
          <label><input type="radio" name="settingsQualityMode" id="settingsQualityExact" value="exact"> Exact</label>
        </div>
        <p class="settings-hint">Used when you open Presets / Custom. You can still switch per capture.</p>
        <label class="multi-toggle-row">
          <span class="switch"><input type="checkbox" id="settingsPreviewToggle" checked><span class="switch-track"><span class="switch-thumb"></span></span></span>
          <span class="multi-toggle-label">Preview before copy</span>
        </label>

        <div class="section-label">Default preset</div>
        <div class="select-root" id="settingsPresetSelect">
          <button type="button" class="select-trigger" id="settingsPresetTrigger" aria-haspopup="listbox">
            <span id="settingsPresetLabel">iPhone (375px)</span>
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="select-content" id="settingsPresetContent" role="listbox">
            <div class="select-item selected" data-value="375" role="option"><span>iPhone (375px)</span><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="select-item" data-value="360" role="option"><span>Android (360px)</span><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="select-item" data-value="768" role="option"><span>iPad (768px)</span><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="select-item" data-value="1440" role="option"><span>Desktop (1440px)</span><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          </div>
          <select id="settingsPreset" class="sr-only-select" tabindex="-1" aria-hidden="true">
            <option value="375">iPhone (375px)</option>
            <option value="360">Android (360px)</option>
            <option value="768">iPad (768px)</option>
            <option value="1440">Desktop (1440px)</option>
          </select>
        </div>

        <div class="section-label">Web Clone MCP</div>
        <p class="settings-hint">Connect Cursor to this tab for inspect / clone without Figma.</p>
        <button type="button" id="openMcpOptions" class="primary-outline settings-full-btn">Open MCP options</button>
      </div>

      <div id="multiGate" class="multi-gate hidden">
        <p>Copied <strong id="multiGateLabel"></strong> — paste into Figma now, then continue for the next size.</p>
        <button id="multiGateContinue" type="button">Continue</button>
      </div>

      <div class="progress-container" style="display:none">
        <div class="progress-bar"><div class="progress-fill"></div></div>
        <div class="progress-rotator"><span id="progressRotatorText" class="progress-rotator-text">Getting ready…</span></div>
        <div class="progress-text">Processing: 0%</div>
      </div>

      <div id="captureOptions" class="capture-options">

      <div class="section-label">Fidelity</div>
      <div class="quality-row" id="qualityModeRow">
        <label><input type="radio" name="qualityMode" id="qualityModeEditable" value="editable" checked> Editable</label>
        <label><input type="radio" name="qualityMode" id="qualityModeExact" value="exact"> Exact</label>
      </div>
      <label class="multi-toggle-row">
        <span class="switch"><input type="checkbox" id="previewToggle" checked><span class="switch-track"><span class="switch-thumb"></span></span></span>
        <span class="multi-toggle-label">Preview before copy</span>
      </label>
      <div class="fidelity-help" id="fidelityHelp">
        <p id="fidelityTip" class="fidelity-tip">Editable keeps more layers editable in Figma. Exact matches the look more closely.</p>
        <button type="button" class="fidelity-why-btn" id="fidelityWhyBtn" aria-expanded="false">Why Exact?</button>
        <ul id="fidelityWhyList" class="fidelity-why-list hidden">
          <li><strong>Editable</strong> — text, shapes, and fills stay as layers you can tweak.</li>
          <li><strong>Exact</strong> — filters, complex shadows, blend modes, canvas, video, and iframes may become <em>images</em> so the paste looks closer to the page.</li>
          <li>After capture you’ll see an <strong>% editable</strong> badge and can highlight rasterized regions on the page.</li>
        </ul>
      </div>

      <div id="fidelityReport" class="fidelity-report hidden" aria-live="polite">
        <div class="fidelity-report-top">
          <span id="fidelityReportLabel" class="fidelity-badge">—</span>
          <span id="fidelityReportMode" class="fidelity-mode-pill">editable</span>
        </div>
        <div class="fidelity-meter" aria-hidden="true"><div id="fidelityMeterFill" class="fidelity-meter-fill" style="width:100%"></div></div>
        <p id="fidelityReportDetail" class="fidelity-report-detail"></p>
        <button type="button" id="highlightRastersBtn" class="fidelity-highlight-btn hidden">Highlight rasters on page</button>
      </div>

      <div id="previewPanel" class="preview-panel">
        <h3 id="previewTitle">Capture ready</h3>
        <ul id="previewWarnings" class="preview-warnings"></ul>
        <div class="preview-actions">
          <button type="button" id="confirmCopy">Copy to clipboard</button>
          <button type="button" id="exportDesignSystem">Export .md</button>
          <button type="button" id="exportDesignSystemJsonPreview">Export .json</button>
          <button type="button" id="discardPreview">Discard</button>
        </div>
      </div>

      <button id="convert" type="button">Send to Figma</button>
      </div>


      <div class="usage-card hidden">
        <div class="usage-top">
          <div class="usage-label">Exports <span id="proBadge" class="pro-badge hidden">PRO</span></div>
          <div id="usageCount" class="usage-count">0 / 10 used</div>
        </div>
        <div id="usageBar" class="usage-bar"><div id="usageFill" class="usage-fill" style="width:0%"></div></div>
        <button id="upgradeBtn" class="upgrade-btn hidden" type="button">Upgrade to Pro</button>
      </div>
    </div>

    <div id="billingHistoryView" class="hidden">
      <button id="billingBackBtn" class="back-btn" type="button">← Back</button>
      <div id="billingHistoryError" class="auth-error"></div>
      <div id="billingHistoryEmpty" class="billing-empty hidden">No payments yet.</div>
      <div id="billingHistoryList" class="billing-table"></div>
    </div>

  </div>
</div>
</div>`;
  }

  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(res || { ok: false, error: "No response" });
        });
      } catch (err) {
        resolve({ ok: false, error: err.message || String(err) });
      }
    });
  }

  function mount(shadowRoot, { onClose } = {}) {
    if (shadowRoot.getElementById("htfyShell")) return shadowRoot.getElementById("htfyPanel");

    const wrap = document.createElement("div");
    wrap.innerHTML = shellHTML();
    const shell = wrap.firstElementChild;
    shadowRoot.appendChild(shell);
    const panel = shadowRoot.getElementById("htfyPanel");

    const $ = (sel) => shadowRoot.querySelector(sel);
    const $$ = (sel) => Array.from(shadowRoot.querySelectorAll(sel));

    let freeLimit = 10;
    let busy = false;
    let lastDesignSystem = null;
    let lastFidelityReport = null;
    let mode = "preset";
    let billingErrTimer = null;

    const authLoading = $("#authLoading");
    const authView = $("#authView");
    const appView = $("#appView");
    const billingHistoryView = $("#billingHistoryView");
    const authError = $("#authError");
    const billingError = $("#billingError");
    const convertBtn = $("#convert");
    const previewToggle = $("#previewToggle");
    const multiGate = $("#multiGate");
    const multiGateLabel = $("#multiGateLabel");
    const multiGateContinue = $("#multiGateContinue");
    const previewPanel = $("#previewPanel");
    const previewTitle = $("#previewTitle");
    const previewWarnings = $("#previewWarnings");
    const progressContainer = $(".progress-container");
    const progressFill = $(".progress-fill");
    const progressText = $(".progress-text");
    const progressRotatorText = $("#progressRotatorText");

    function showView(el) {
      [authLoading, authView, appView, billingHistoryView].forEach((v) => v?.classList.add("hidden"));
      el?.classList.remove("hidden");
    }

    function showBillingError(msg) {
      if (!billingError) return;
      billingError.textContent = msg;
      billingError.classList.add("show");
      clearTimeout(billingErrTimer);
      billingErrTimer = setTimeout(() => billingError.classList.remove("show"), 5000);
    }

    function applyUser(user) {
      if (!user) return;
      const avatar = $("#userAvatar");
      const nameLabel = $("#userNameLabel");
      const emailLabel = $("#userEmailLabel");
      const proBadge = $("#proBadge");
      const usageCount = $("#usageCount");
      const usageFill = $("#usageFill");
      const usageBar = $("#usageBar");
      const upgradeBtn = $("#upgradeBtn");
      const managePlanBtn = $("#managePlanBtn");
      const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
      if (avatar) {
        avatar.textContent = initial;
        if (user.avatarUrl) avatar.innerHTML = `<img src="${user.avatarUrl}" alt="">`;
      }
      if (nameLabel) nameLabel.textContent = user.name || user.email || "Account";
      if (emailLabel) emailLabel.textContent = user.email || "";
      const used = typeof user.exportsUsed === "number" ? user.exportsUsed : 0;
      if (user.isPro) {
        proBadge?.classList.remove("hidden");
        if (usageCount) usageCount.textContent = "Unlimited";
        usageBar?.classList.add("hidden");
        upgradeBtn?.classList.add("hidden");
        managePlanBtn?.classList.remove("hidden");
        if (convertBtn) {
          convertBtn.disabled = false;
          convertBtn.textContent = "Send to Figma";
        }
      } else {
        proBadge?.classList.add("hidden");
        if (usageCount) usageCount.textContent = `${used} / ${freeLimit} used`;
        usageBar?.classList.remove("hidden");
        if (usageFill) usageFill.style.width = Math.min(100, (used / freeLimit) * 100) + "%";
        upgradeBtn?.classList.remove("hidden");
        managePlanBtn?.classList.add("hidden");
        const blocked = used >= freeLimit;
        if (convertBtn) {
          convertBtn.disabled = blocked;
          convertBtn.textContent = blocked ? "Upgrade to continue exporting" : "Send to Figma";
        }
      }
    }

    function showGuestUI() {
      $("#userChip")?.classList.add("hidden");
      $(".usage-card")?.classList.add("hidden");
      if (convertBtn) {
        convertBtn.disabled = false;
        convertBtn.textContent = "Send to Figma";
      }
    }

    const SETTINGS_KEY = "htfy_panel_settings";
    const PRESET_LABELS = {
      375: "iPhone (375px)",
      360: "Android (360px)",
      768: "iPad (768px)",
      1440: "Desktop (1440px)",
    };

    function applyPresetValue(selectEl, labelEl, items, value) {
      const v = String(value);
      if (selectEl) selectEl.value = v;
      if (labelEl) labelEl.textContent = PRESET_LABELS[v] || PRESET_LABELS["375"];
      items?.forEach((item) => item.classList.toggle("selected", item.dataset.value === v));
    }

    async function loadPanelSettings() {
      try {
        const data = await chrome.storage.local.get(SETTINGS_KEY);
        const s = data[SETTINGS_KEY] || {};
        const quality = s.qualityMode === "exact" ? "exact" : "editable";
        const preview = s.previewBeforeCopy !== false;
        const preset = PRESET_LABELS[s.defaultPreset] ? String(s.defaultPreset) : "375";

        const exact = $("#qualityModeExact");
        const editable = $("#qualityModeEditable");
        if (quality === "exact") {
          if (exact) exact.checked = true;
        } else if (editable) editable.checked = true;
        const sExact = $("#settingsQualityExact");
        const sEditable = $("#settingsQualityEditable");
        if (quality === "exact") {
          if (sExact) sExact.checked = true;
        } else if (sEditable) sEditable.checked = true;

        if (previewToggle) previewToggle.checked = preview;
        const sPreview = $("#settingsPreviewToggle");
        if (sPreview) sPreview.checked = preview;

        applyPresetValue(
          $("#devicePreset"),
          $("#devicePresetLabel"),
          $$("#devicePresetContent .select-item"),
          preset
        );
        applyPresetValue(
          $("#settingsPreset"),
          $("#settingsPresetLabel"),
          $$("#settingsPresetContent .select-item"),
          preset
        );
      } catch (_) {}
    }

    async function savePanelSettings(partial) {
      try {
        const data = await chrome.storage.local.get(SETTINGS_KEY);
        const next = { ...(data[SETTINGS_KEY] || {}), ...partial };
        await chrome.storage.local.set({ [SETTINGS_KEY]: next });
      } catch (_) {}
    }

    function qualityMode() {
      return $("#qualityModeExact")?.checked ? "exact" : "editable";
    }

    let progressPct = 0;

    function showProgress(pct, text, isError) {
      if (!progressContainer) return;
      // Monotonic while capturing — never jump backwards (e.g. 30% → Preparing fidelity 25%).
      const next = isError ? pct : Math.max(progressPct, Number(pct) || 0);
      progressPct = isError ? 0 : next;
      progressContainer.style.display = "block";
      if (progressFill) {
        progressFill.style.width = next + "%";
        progressFill.classList.toggle("error", !!isError);
      }
      if (progressText) progressText.textContent = text;
      if (progressRotatorText && text) {
        progressRotatorText.textContent =
          text.replace(/^Processing:\s*\d+%\s*—?\s*/, "") || text;
      }
    }

    function hideProgress(delay = 800) {
      setTimeout(() => {
        if (progressContainer) progressContainer.style.display = "none";
        if (progressFill) {
          progressFill.style.width = "0%";
          progressFill.classList.remove("error");
        }
        progressPct = 0;
        convertBtn?.classList.remove("loading");
        if (convertBtn) convertBtn.disabled = false;
        busy = false;
      }, delay);
    }

    function clearRasterHighlights() {
      document.getElementById("__htfyRasterHighlight")?.remove();
    }

    function highlightRastersOnPage(regions) {
      clearRasterHighlights();
      const list = (regions || []).filter(
        (r) => Number.isFinite(r.docX) && Number.isFinite(r.docY) && r.width > 1 && r.height > 1
      );
      if (!list.length) {
        showBillingError("No raster regions to highlight on this capture.");
        return;
      }
      const root = document.createElement("div");
      root.id = "__htfyRasterHighlight";
      root.setAttribute("data-htfy-chrome", "1");
      root.style.cssText =
        "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none;";
      for (const r of list) {
        const box = document.createElement("div");
        box.style.cssText = [
          "position:absolute",
          `left:${Math.round(r.docX)}px`,
          `top:${Math.round(r.docY)}px`,
          `width:${Math.round(r.width)}px`,
          `height:${Math.round(r.height)}px`,
          "box-sizing:border-box",
          "border:2px solid #ff5c5c",
          "background:rgba(255,92,92,0.12)",
          "border-radius:4px",
          "pointer-events:none",
        ].join(";");
        const tag = document.createElement("span");
        tag.textContent = r.kind || "raster";
        tag.style.cssText =
          "position:absolute;left:0;top:-18px;padding:1px 6px;border-radius:4px;background:#ff5c5c;color:#fff;font:600 10px/16px Epilogue,sans-serif;white-space:nowrap;";
        box.appendChild(tag);
        root.appendChild(box);
      }
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.textContent = "Clear highlights";
      dismiss.setAttribute("data-htfy-chrome", "1");
      dismiss.style.cssText =
        "position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:auto;height:36px;padding:0 14px;border:0;border-radius:8px;background:#111;color:#fff;font:600 12px Epilogue,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35);";
      dismiss.addEventListener("click", () => clearRasterHighlights());
      root.appendChild(dismiss);
      document.documentElement.appendChild(root);
      const first = list[0];
      window.scrollTo({
        top: Math.max(0, first.docY - 48),
        left: Math.max(0, first.docX - 24),
        behavior: "smooth",
      });
    }

    function showFidelityReport(report) {
      const card = $("#fidelityReport");
      if (!card) return;
      lastFidelityReport = report || null;
      if (!report) {
        card.classList.add("hidden");
        clearRasterHighlights();
        return;
      }
      card.classList.remove("hidden");
      const label = $("#fidelityReportLabel");
      const modePill = $("#fidelityReportMode");
      const detail = $("#fidelityReportDetail");
      const fill = $("#fidelityMeterFill");
      const highlightBtn = $("#highlightRastersBtn");
      if (label) label.textContent = report.label || "—";
      if (modePill) {
        modePill.textContent = report.qualityMode === "exact" ? "Exact" : "Editable";
        modePill.dataset.mode = report.qualityMode || "editable";
      }
      if (detail) detail.textContent = report.detail || report.modeHint || "";
      if (fill) {
        const pct = Math.max(0, Math.min(100, Number(report.editablePct) || 0));
        fill.style.width = `${pct}%`;
        fill.dataset.level = pct >= 90 ? "high" : pct >= 70 ? "mid" : "low";
      }
      if (highlightBtn) {
        const canHighlight = Array.isArray(report.regions) && report.regions.some((r) => Number.isFinite(r.docX));
        highlightBtn.classList.toggle("hidden", !canHighlight);
        highlightBtn.textContent =
          report.rasters > 0
            ? `Highlight ${report.rasters} raster${report.rasters === 1 ? "" : "s"} on page`
            : "Highlight rasters on page";
      }
    }

    function showPreview(preview) {
      if (!previewPanel || !preview) return;
      previewPanel.classList.add("show");
      lastDesignSystem = preview.designSystem || null;
      refreshDesignSystemView();
      showFidelityReport(preview.fidelityReport || null);
      if (previewTitle) {
        const fr = preview.fidelityReport;
        previewTitle.textContent = fr?.label
          ? `${preview.title || "Capture ready"} · ${fr.label}`
          : preview.title || "Capture ready";
      }
      if (previewWarnings) {
        previewWarnings.innerHTML = "";
        const list = preview.warnings?.length
          ? preview.warnings
          : ["Looks good — copy and paste into Figma Desktop."];
        for (const w of list) {
          const li = document.createElement("li");
          li.textContent = w;
          previewWarnings.appendChild(li);
        }
      }
      const exportBtn = $("#exportDesignSystem");
      const exportJsonBtn = $("#exportDesignSystemJsonPreview");
      if (exportBtn) exportBtn.style.display = lastDesignSystem ? "" : "none";
      if (exportJsonBtn) exportJsonBtn.style.display = lastDesignSystem ? "" : "none";
    }

    function hidePreview() {
      previewPanel?.classList.remove("show");
    }

    function captureOpts(base = {}) {
      let width = null;
      if (mode === "preset") width = parseInt($("#devicePreset")?.value, 10) || null;
      else if (mode === "custom") width = parseInt($("#customWidth")?.value, 10) || null;
      const heights = { 375: 812, 360: 800, 768: 1024, 1440: 900 };
      const height = width ? heights[width] || 900 : null;
      const mobile = width ? width < 1024 : null;
      return {
        type: "htfy_CAPTURE",
        selector: "body",
        width,
        height,
        mobile,
        qualityMode: qualityMode(),
        preview: !!(previewToggle && previewToggle.checked),
        ...base,
      };
    }

    async function handleCaptureResult(res) {
      if (!res?.ok) {
        showProgress(100, res?.error || "Capture failed", true);
        hideProgress(2800);
        return;
      }
      if (res.user) applyUser(res.user);
      // Preview-before-copy only — do NOT open confirm UI after auto-copy.
      // Opening it reuses a stale IndexedDB preview and can overwrite the clipboard
      // with a previous full-page capture when the user clicks Copy again.
      if (res.needsConfirm && res.preview) {
        showProgress(100, "Ready for preview", false);
        showPreview(res.preview);
        hideProgress(600);
        return;
      }
      hidePreview();
      if (res.preview?.fidelityReport) showFidelityReport(res.preview.fidelityReport);
      const fr = res.preview?.fidelityReport;
      const size =
        res.preview?.summary?.rootSize ||
        (res.preview?.bytes ? `${Math.round(res.preview.bytes / 1024)} KB` : "");
      const label = res.preview?.captureLabel || res.preview?.title || "";
      const fidelityBit = fr?.label ? ` · ${fr.label}` : "";
      showProgress(
        100,
        label
          ? `Copied ${label}${size ? ` · ${size}` : ""}${fidelityBit} — paste in Figma (⌘/Ctrl+V).`
          : `Copied! Paste into Figma Desktop (Cmd/Ctrl+V).${fidelityBit}`,
        false
      );
      hideProgress(2200);
    }

    async function startConvert() {
      if (busy) return;
      hidePreview();
      const multi = $("#multiSizeToggle");

      if (multi?.checked && mode === "preset") {
        const boxes = $$(".preset-multi-checkbox:checked");
        if (!boxes.length) {
          showBillingError("Pick at least one size first.");
          return;
        }
        busy = true;
        convertBtn?.classList.add("loading");
        if (convertBtn) convertBtn.disabled = true;
        const heights = { 375: 812, 360: 800, 768: 1024, 1440: 900 };
        for (let i = 0; i < boxes.length; i++) {
          const w = parseInt(boxes[i].value, 10);
          showProgress(10 + (i / boxes.length) * 80, `Capturing ${boxes[i].dataset.label}…`, false);
          const res = await send({
            type: "htfy_CAPTURE",
            selector: "body",
            width: w,
            height: heights[w] || 900,
            mobile: w < 1024,
            qualityMode: qualityMode(),
            preview: false,
          });
          if (!res?.ok) {
            showProgress(100, res?.error || "Capture failed", true);
            hideProgress(2500);
            return;
          }
          if (res.user) applyUser(res.user);
          if (i < boxes.length - 1 && multiGate && multiGateLabel) {
            multiGateLabel.textContent = boxes[i].dataset.label;
            multiGate.classList.remove("hidden");
            convertBtn?.classList.remove("loading");
            if (convertBtn) convertBtn.disabled = false;
            busy = false;
            await new Promise((resolve) => {
              const once = () => {
                multiGateContinue.removeEventListener("click", once);
                multiGate.classList.add("hidden");
                resolve();
              };
              multiGateContinue.addEventListener("click", once);
            });
            busy = true;
            convertBtn?.classList.add("loading");
            if (convertBtn) convertBtn.disabled = true;
          }
        }
        showProgress(100, "Copied! Paste into Figma Desktop (Cmd/Ctrl+V).", false);
        hideProgress(1200);
        return;
      }

      busy = true;
      convertBtn?.classList.add("loading");
      if (convertBtn) convertBtn.disabled = true;
      progressPct = 0;
      showProgress(8, "Processing: 8% — Starting…", false);

      const base = captureOpts();
      const res = await send(base);
      await handleCaptureResult(res);
    }

    const TOOL_META = {
      preset: { title: "Presets", sub: "Device width capture", mode: "preset", icon: "monitor" },
      custom: { title: "Custom", sub: "Custom viewport width", mode: "custom", icon: "edit" },
      select: { title: "Select", sub: "Capture one element", mode: "selector", icon: "select" },
      design: { title: "Design system", sub: "Export .md + .json", mode: "design", icon: "layers" },
      screenshot: { title: "Screenshot", sub: "Save PNG of the page", mode: "screenshot", icon: "camera" },
      settings: { title: "Settings", sub: "Defaults & MCP", mode: "settings", icon: "settings" },
    };

    function refreshDesignSystemView() {
      const empty = $("#designSystemEmpty");
      const ready = $("#designSystemReady");
      const summary = $("#designSystemSummary");
      const meta = $("#designSystemMeta");
      const extractBtn = $("#extractDesignSystem");
      if (!lastDesignSystem) {
        empty?.classList.remove("hidden");
        ready?.classList.add("hidden");
        if (extractBtn) extractBtn.textContent = "Extract from page";
        return;
      }
      empty?.classList.add("hidden");
      ready?.classList.remove("hidden");
      const colors = lastDesignSystem.tokens?.colors?.length || lastDesignSystem.colors?.length || 0;
      const fonts =
        lastDesignSystem.tokens?.fontFamilies?.length ||
        lastDesignSystem.tokens?.fonts?.length ||
        lastDesignSystem.fonts?.length ||
        0;
      const comps = lastDesignSystem.components?.length || 0;
      const vars = lastDesignSystem.tokens?.cssVariables?.length || 0;
      if (summary) {
        summary.textContent = vars
          ? `${colors} colors · ${fonts} fonts · ${comps} components · ${vars} CSS vars`
          : `${colors} colors · ${fonts} fonts · ${comps} components`;
      }
      if (meta) {
        const src = lastDesignSystem.source || "This page";
        const when = lastDesignSystem.exportedAt
          ? new Date(lastDesignSystem.exportedAt).toLocaleString()
          : "";
        meta.textContent = when ? `${src} · ${when}` : src;
      }
      if (extractBtn) extractBtn.textContent = "Extract again";
    }

    async function extractDesignSystemFromPage() {
      const btn = $("#extractDesignSystem");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Extracting…";
      }
      showProgress(12, "Scanning page tokens…", false);
      const res = await send({ type: "htfy_EXTRACT_DESIGN_SYSTEM" });
      if (btn) btn.disabled = false;
      if (!res?.ok || !res.designSystem) {
        if (btn) btn.textContent = lastDesignSystem ? "Extract again" : "Extract from page";
        showProgress(100, res?.error || "Extract failed", true);
        hideProgress(2800);
        return;
      }
      lastDesignSystem = res.designSystem;
      refreshDesignSystemView();
      showProgress(100, "Design system ready — export .md or .json.", false);
      hideProgress(1600);
    }

    function setTool(tool) {
      const meta = TOOL_META[tool] || TOOL_META.preset;
      mode = meta.mode;
      const title = $("#htfyToolTitle");
      const sub = $("#htfyToolSub");
      const toolIcon = $("#htfyToolIcon");
      if (title) title.textContent = meta.title;
      if (sub) sub.textContent = meta.sub;
      if (toolIcon) toolIcon.innerHTML = ri(meta.icon) || "";

      $$(".tool-view").forEach((v) => v.classList.toggle("active", v.dataset.tool === tool));
      $$(".htfy-dock-item").forEach((b) => b.classList.toggle("active", b.dataset.action === tool));

      const captureOptsEl = $("#captureOptions");
      const showCapture = tool === "preset" || tool === "custom";
      if (captureOptsEl) captureOptsEl.style.display = showCapture ? "" : "none";
      if (convertBtn) convertBtn.style.display = showCapture ? "" : "none";

      if (tool === "design") refreshDesignSystemView();
    }

    async function takeScreenshot(mode) {
      if (busy) return;
      busy = true;
      showProgress(10, mode === "custom" ? "Select a region…" : "Capturing screenshot…", false);
      try {
        const res = await send({ type: "htfy_SCREENSHOT", mode, format: "png" });
        if (!res?.ok) {
          const cancelled = /cancel/i.test(res?.error || "");
          showProgress(100, res?.error || "Screenshot failed", !cancelled);
          hideProgress(cancelled ? 1200 : 2800);
          return;
        }
        showProgress(100, `Saved ${res.filename || "screenshot.png"}`, false);
        hideProgress(1800);
      } catch (err) {
        showProgress(100, err?.message || "Screenshot failed", true);
        hideProgress(2800);
      }
    }

    function openPanel(tool, opts = {}) {
      panel.classList.add("open");
      panel.classList.remove("minimized");
      showView(appView);
      setTool(tool || "preset");
      if (tool === "select" && opts.startPicker) {
        setTimeout(() => beginPicker(), 80);
      }
    }

    function closePanel() {
      panel.classList.remove("open");
      panel.classList.remove("minimized");
      $$(".htfy-dock-item").forEach((b) => b.classList.remove("active"));
    }

    // Dock actions — each tool opens its own panel view
    $$(".htfy-dock-item").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        // Toggle: clicking active open tool closes panel
        if (panel.classList.contains("open") && btn.classList.contains("active")) {
          closePanel();
          return;
        }
        openPanel(action, { startPicker: action === "select" });
      });
    });

    // Header controls — close panel only (dock stays)
    $("#htfyClose")?.addEventListener("click", () => {
      closePanel();
    });
    $("#htfyMinimize")?.addEventListener("click", () => {
      panel.classList.toggle("minimized");
    });

    // Auth bootstrap — guest-first
    showView(appView);
    showGuestUI();
    loadPanelSettings();
    send({ type: "htfy_AUTH_STATUS" }).then((res) => {
      if (!res?.ok) return;
      if (typeof res.config?.freeExportLimit === "number") freeLimit = res.config.freeExportLimit;
      if (res.isLoggedIn && res.user) {
        $("#userChip")?.classList.remove("hidden");
        $(".usage-card")?.classList.remove("hidden");
        applyUser(res.user);
      } else showGuestUI();
    });

    $("#googleSignIn")?.addEventListener("click", async () => {
      authError?.classList.remove("show");
      $("#googleSignIn")?.classList.add("loading");
      const res = await send({ type: "htfy_AUTH_SIGNIN" });
      $("#googleSignIn")?.classList.remove("loading");
      if (!res?.ok) {
        if (authError) {
          authError.textContent = res?.error || "Sign-in failed.";
          authError.classList.add("show");
        }
        return;
      }
      if (typeof res.config?.freeExportLimit === "number") freeLimit = res.config.freeExportLimit;
      $("#userChip")?.classList.remove("hidden");
      $(".usage-card")?.classList.remove("hidden");
      applyUser(res.user);
      showView(appView);
    });

    const userChip = $("#userChip");
    const userMenu = $("#userMenu");
    userChip?.addEventListener("click", (e) => {
      e.stopPropagation();
      userMenu?.classList.toggle("open");
    });
    shadowRoot.addEventListener("click", (e) => {
      if (!userMenu?.contains(e.target) && e.target !== userChip) userMenu?.classList.remove("open");
      closeSelect();
      closeSettingsSelect();
    });

    $("#signOutBtn")?.addEventListener("click", async () => {
      await send({ type: "htfy_AUTH_SIGNOUT" });
      userMenu?.classList.remove("open");
      showGuestUI();
      showView(appView);
    });

    $("#managePlanBtn")?.addEventListener("click", async () => {
      const btn = $("#managePlanBtn");
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Opening…";
      const res = await send({ type: "htfy_BILLING_PORTAL" });
      btn.disabled = false;
      btn.textContent = prev;
      userMenu?.classList.remove("open");
      if (!res?.ok) showBillingError(res?.error || "Couldn't open billing portal.");
    });

    $("#billingHistoryBtn")?.addEventListener("click", async () => {
      userMenu?.classList.remove("open");
      showView(billingHistoryView);
      const err = $("#billingHistoryError");
      const empty = $("#billingHistoryEmpty");
      const list = $("#billingHistoryList");
      err?.classList.remove("show");
      empty?.classList.add("hidden");
      if (list) {
        list.innerHTML =
          '<div class="billing-row head"><span>Date</span><span class="billing-amount">Amount</span><span class="billing-status">Status</span></div>';
      }
      const res = await send({ type: "htfy_BILLING_HISTORY" });
      if (!res?.ok) {
        if (err) {
          err.textContent = res?.error || "Couldn't load billing history.";
          err.classList.add("show");
        }
        return;
      }
      if (!res.items?.length) {
        empty?.classList.remove("hidden");
        return;
      }
      for (const item of res.items) {
        const paid = item.type === "invoice.paid";
        const row = document.createElement("div");
        row.className = "billing-row";
        const d = new Date(item.created);
        const date = isNaN(d.getTime())
          ? "—"
          : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
        const amount = ((typeof item.amountCents === "number" ? item.amountCents : 0) / 100).toFixed(2);
        const cur = (item.currency || "usd").toLowerCase() === "usd" ? "$" : (item.currency || "").toUpperCase() + " ";
        row.innerHTML = `<span>${date}</span><span class="billing-amount">${cur}${amount}</span><span class="billing-status ${paid ? "paid" : "failed"}">${paid ? "Paid" : "Failed"}</span>`;
        list.appendChild(row);
      }
    });

    $("#billingBackBtn")?.addEventListener("click", () => showView(appView));

    $("#upgradeBtn")?.addEventListener("click", async () => {
      const btn = $("#upgradeBtn");
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Opening checkout…";
      const res = await send({ type: "htfy_BILLING_CHECKOUT" });
      btn.disabled = false;
      btn.textContent = prev;
      if (!res?.ok) showBillingError(res?.error || "Couldn't open checkout.");
    });

    const devicePreset = $("#devicePreset");
    const deviceTrigger = $("#devicePresetTrigger");
    const deviceContent = $("#devicePresetContent");
    const deviceLabel = $("#devicePresetLabel");
    const selectItems = $$("#devicePresetContent .select-item");

    function closeSelect() {
      deviceTrigger?.classList.remove("open");
      deviceContent?.classList.remove("open");
    }

    deviceTrigger?.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !deviceContent?.classList.contains("open");
      closeSelect();
      if (open) {
        deviceTrigger.classList.add("open");
        deviceContent.classList.add("open");
      }
    });
    selectItems.forEach((item) => {
      item.addEventListener("click", () => {
        if (devicePreset) devicePreset.value = item.dataset.value;
        if (deviceLabel) deviceLabel.textContent = item.querySelector("span")?.textContent || "";
        selectItems.forEach((i) => i.classList.remove("selected"));
        item.classList.add("selected");
        closeSelect();
        savePanelSettings({ defaultPreset: item.dataset.value });
        applyPresetValue(
          $("#settingsPreset"),
          $("#settingsPresetLabel"),
          $$("#settingsPresetContent .select-item"),
          item.dataset.value
        );
      });
    });

    const settingsPreset = $("#settingsPreset");
    const settingsPresetTrigger = $("#settingsPresetTrigger");
    const settingsPresetContent = $("#settingsPresetContent");
    const settingsPresetLabel = $("#settingsPresetLabel");
    const settingsPresetItems = $$("#settingsPresetContent .select-item");

    function closeSettingsSelect() {
      settingsPresetTrigger?.classList.remove("open");
      settingsPresetContent?.classList.remove("open");
    }

    settingsPresetTrigger?.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !settingsPresetContent?.classList.contains("open");
      closeSelect();
      closeSettingsSelect();
      if (open) {
        settingsPresetTrigger.classList.add("open");
        settingsPresetContent.classList.add("open");
      }
    });
    settingsPresetItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        applyPresetValue(settingsPreset, settingsPresetLabel, settingsPresetItems, item.dataset.value);
        applyPresetValue($("#devicePreset"), $("#devicePresetLabel"), selectItems, item.dataset.value);
        closeSettingsSelect();
        savePanelSettings({ defaultPreset: item.dataset.value });
      });
    });

    function syncQuality(quality) {
      const exact = quality === "exact";
      const qExact = $("#qualityModeExact");
      const qEdit = $("#qualityModeEditable");
      const sExact = $("#settingsQualityExact");
      const sEdit = $("#settingsQualityEditable");
      if (exact) {
        if (qExact) qExact.checked = true;
        if (sExact) sExact.checked = true;
      } else {
        if (qEdit) qEdit.checked = true;
        if (sEdit) sEdit.checked = true;
      }
      savePanelSettings({ qualityMode: exact ? "exact" : "editable" });
    }

    ["#qualityModeEditable", "#qualityModeExact", "#settingsQualityEditable", "#settingsQualityExact"].forEach(
      (sel) => {
        $(sel)?.addEventListener("change", (e) => {
          if (!e.target.checked) return;
          syncQuality(e.target.value === "exact" ? "exact" : "editable");
        });
      }
    );

    function syncPreview(on) {
      if (previewToggle) previewToggle.checked = on;
      const sPreview = $("#settingsPreviewToggle");
      if (sPreview) sPreview.checked = on;
      savePanelSettings({ previewBeforeCopy: !!on });
    }

    previewToggle?.addEventListener("change", (e) => syncPreview(e.target.checked));
    $("#settingsPreviewToggle")?.addEventListener("change", (e) => syncPreview(e.target.checked));

    $("#openMcpOptions")?.addEventListener("click", () => {
      try {
        chrome.runtime.openOptionsPage();
      } catch (_) {
        showBillingError("Couldn't open options page.");
      }
    });

    $("#multiSizeToggle")?.addEventListener("change", (e) => {
      const on = e.target.checked;
      closeSelect();
      $("#devicePresetSelect")?.classList.toggle("hidden", on);
      $("#presetMultiList")?.classList.toggle("hidden", !on);
    });

    async function beginPicker() {
      const info = $("#selectedElementInfo");
      if (info) info.textContent = "Starting picker…";

      const run = () => {
        if (typeof window.__htfyStartPicker !== "function") return false;
        panel.classList.remove("open");
        // Select = instant copy (no preview gate). Faster paste-into-Figma path.
        window.__htfyStartPicker({
          preview: false,
          qualityMode: qualityMode(),
        });
        if (info) info.textContent = "Hover & click · ↑ parent · ↓ child · Esc cancel";
        showProgress(8, "Pick an element on the page…", false);
        return true;
      };

      if (run()) return;

      const injected = await send({ type: "htfy_INJECT_PICKER" });
      if (!injected?.ok) {
        if (info) info.textContent = injected?.error || "Couldn't load picker on this page.";
        showProgress(100, injected?.error || "Picker inject failed", true);
        hideProgress(2500);
        return;
      }
      if (!run()) {
        if (info) info.textContent = "Picker failed to start. Reload the page and try again.";
        showProgress(100, "Picker failed to start", true);
        hideProgress(2500);
      }
    }

    // Restore UI after element pick + capture
    document.addEventListener("__htfy_picker_done__", async (e) => {
      const detail = e.detail || {};
      const info = $("#selectedElementInfo");
      if (detail.cancelled) {
        if (info) info.textContent = "Selection cancelled";
        openPanel("select");
        hideProgress(400);
        return;
      }
      if (info) info.textContent = detail.label || detail.selector || "Element selected";
      openPanel("select");
      if (detail.result) {
        await handleCaptureResult(detail.result);
        if (detail.result.ok && !detail.result.needsConfirm) {
          if (info) info.textContent = `${detail.label || "Element"} — copied. Paste in Figma (⌘/Ctrl+V).`;
        }
      } else if (detail.ok) {
        showProgress(100, "Copied! Paste into Figma Desktop (Cmd/Ctrl+V).", false);
        hideProgress(1800);
      } else {
        showProgress(100, detail.error || detail.result?.error || "Capture failed", true);
        hideProgress(2800);
      }
    });

    $("#startSelection")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      beginPicker();
    });
    convertBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      startConvert();
    });

    $("#confirmCopy")?.addEventListener("click", async () => {
      const btn = $("#confirmCopy");
      btn.disabled = true;
      btn.textContent = "Copying…";
      const res = await send({ type: "htfy_CONFIRM_COPY" });
      btn.disabled = false;
      btn.textContent = "Copy to clipboard";
      if (res?.ok) {
        hidePreview();
        const fr = lastFidelityReport;
        showProgress(
          100,
          fr?.label
            ? `Copied · ${fr.label} — paste in Figma (⌘/Ctrl+V).`
            : "Copied! Paste into Figma Desktop (Cmd/Ctrl+V).",
          false
        );
        hideProgress(1800);
      } else {
        showProgress(100, res?.error || "Copy failed", true);
        hideProgress(2500);
      }
    });

    $("#discardPreview")?.addEventListener("click", () => {
      send({ type: "htfy_DISCARD_PREVIEW" });
      hidePreview();
      clearRasterHighlights();
    });

    $("#fidelityWhyBtn")?.addEventListener("click", () => {
      const btn = $("#fidelityWhyBtn");
      const list = $("#fidelityWhyList");
      if (!btn || !list) return;
      const open = list.classList.toggle("hidden") === false;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "Hide Why Exact?" : "Why Exact?";
    });

    $("#highlightRastersBtn")?.addEventListener("click", () => {
      highlightRastersOnPage(lastFidelityReport?.regions || []);
    });

    function designSystemSlug() {
      return (
        String(lastDesignSystem?.source || "designsystem")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48) || "designsystem"
      );
    }

    function downloadBlob(filename, contents, mime) {
      const blob = new Blob([contents], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    function downloadDesignSystemMd() {
      if (!lastDesignSystem) {
        showProgress(100, "Extract from page first.", true);
        hideProgress(2000);
        return;
      }
      const md =
        typeof lastDesignSystem.markdown === "string" && lastDesignSystem.markdown.trim()
          ? lastDesignSystem.markdown
          : null;
      if (!md) {
        showProgress(100, "Markdown missing — extract again.", true);
        hideProgress(2500);
        return;
      }
      downloadBlob(`${designSystemSlug()}-designsystem.md`, md, "text/markdown;charset=utf-8");
      showProgress(100, "Downloaded designsystem.md (AI)", false);
      hideProgress(1500);
    }

    function designSystemTokenCount(ds) {
      if (!ds?.tokens) return 0;
      const t = ds.tokens;
      return (
        (t.colors?.length || 0) +
        (t.fonts?.length || 0) +
        (t.fontFamilies?.length || 0) +
        (t.fontSizes?.length || 0) +
        (t.radii?.length || 0) +
        (t.spaces?.length || 0) +
        (ds.components?.length || 0)
      );
    }

    function downloadDesignSystemJson() {
      if (!lastDesignSystem) {
        showProgress(100, "Extract from page first.", true);
        hideProgress(2000);
        return;
      }
      if (designSystemTokenCount(lastDesignSystem) === 0) {
        showProgress(
          100,
          "Tokens empty — use Design system → Extract from page, then Export .json again.",
          true
        );
        hideProgress(3500);
        return;
      }
      const { markdown: _md, format: _fmt, ...rest } = lastDesignSystem;
      const payload = {
        version: rest.version ?? 3,
        source: rest.source,
        exportedAt: rest.exportedAt,
        tokens: rest.tokens || {},
        components: rest.components || [],
        treeSummary: rest.treeSummary ?? null,
      };
      downloadBlob(
        `${designSystemSlug()}-designsystem.json`,
        JSON.stringify(payload, null, 2),
        "application/json;charset=utf-8"
      );
      showProgress(100, "Downloaded designsystem.json (Figma plugin)", false);
      hideProgress(1500);
    }

    $("#extractDesignSystem")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      extractDesignSystemFromPage();
    });
    $("#exportDesignSystem")?.addEventListener("click", downloadDesignSystemMd);
    $("#exportDesignSystemMain")?.addEventListener("click", downloadDesignSystemMd);
    $("#exportDesignSystemJson")?.addEventListener("click", downloadDesignSystemJson);
    $("#exportDesignSystemJsonPreview")?.addEventListener("click", downloadDesignSystemJson);

    $$("[data-shot]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mode = btn.getAttribute("data-shot") || "visible";
        takeScreenshot(mode);
      });
    });

    // Progress from page (relay / fidelity) — DOM event crosses isolated world
    const onDomProgress = (e) => {
      const text = e.detail?.text;
      const isError = !!e.detail?.isError;
      if (text && (text.startsWith("Framing at") || text.startsWith("Emulating"))) {
        showProgress(10, "Processing: 10%", false);
        return;
      }
      if (isError) {
        showProgress(100, text, true);
        hideProgress(4000);
        return;
      }
      const map = {
        "Preparing page…": 20,
        "Preparing fidelity…": 25,
        "Resolving CSS…": 28,
        "CSS resolve slow, continuing…": 30,
        "Recovering styles…": 32,
        "Styles recovery skipped…": 34,
        "Materializing…": 40,
        "Capturing…": 50,
        "Capturing (Exact)…": 50,
        "Fidelity prep timed out — capturing anyway…": 48,
        "Enriching…": 70,
        "Refining assets…": 85,
        "Encoding…": 80,
        "Copied! Paste into Figma Desktop (Cmd/Ctrl+V).": 100,
      };
      // Prefix / partial matches for dynamic toasts
      let pct = map[text];
      if (pct == null && text) {
        if (text.startsWith("Capturing")) pct = 50;
        else if (text.includes("timed out")) pct = 48;
        else if (text.includes("Resolving CSS")) pct = 28;
        else if (text.includes("Recovering")) pct = 32;
        else if (text.includes("Materializing")) pct = 40;
        else pct = Math.max(progressPct, 35);
      }
      showProgress(pct ?? 50, `Processing: ${pct ?? 50}% — ${text}`, false);
    };
    document.addEventListener("__htfy_progress__", onDomProgress);

    const progressListener = (msg) => {
      if (!msg || msg.type !== "htfy_PROGRESS") return;
      onDomProgress({ detail: { text: msg.text, isError: msg.isError } });
    };
    chrome.runtime.onMessage.addListener(progressListener);

    panel.__htfyCleanup = () => {
      try {
        document.removeEventListener("__htfy_progress__", onDomProgress);
        chrome.runtime.onMessage.removeListener(progressListener);
      } catch (_) {}
    };

    return panel;
  }

  function destroy(host) {
    const shadow = host?.shadowRoot;
    const panel = shadow?.getElementById("htfyPanel");
    panel?.__htfyCleanup?.();
    host?.remove();
  }

  globalThis.__htfyPanelApi = { version: 3, mount, destroy, shellHTML };
})();
