/**
 * Page-world: detect section-like blocks for MCP list_sections.
 */
(function () {
  if (typeof window.__htfyDetectSections === "function") return;

  function isOurChrome(el) {
    if (!el || el.nodeType !== 1) return false;
    const id = el.id || "";
    if (id === "htfyRoot" || id.startsWith("__htfy")) return true;
    if (el.getAttribute("data-htfy-chrome") === "1") return true;
    if (el.closest?.("#htfyRoot, [id^='__htfy'], [data-htfy-chrome='1']")) return true;
    return false;
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    return true;
  }

  function cssPath(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.classList?.length) {
        const cls = [...cur.classList]
          .filter((c) => c && !c.startsWith("h2d") && !c.startsWith("htfy") && c.length < 40)
          .slice(0, 2);
        if (cls.length) part += "." + cls.map((c) => CSS.escape(c)).join(".");
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function nameFor(el, roleHint) {
    if (roleHint) return roleHint;
    const tag = el.tagName.toLowerCase();
    const map = {
      header: "Header",
      nav: "Nav",
      main: "Main",
      footer: "Footer",
      aside: "Aside",
      form: "Form",
      section: "Section",
      article: "Article",
    };
    if (map[tag]) return map[tag];
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.slice(0, 40);
    const h = el.querySelector("h1,h2,h3");
    if (h?.textContent?.trim()) return h.textContent.trim().slice(0, 40);
    return tag;
  }

  function roleName(el) {
    const role = el.getAttribute("role");
    const roles = {
      banner: "Header",
      navigation: "Nav",
      main: "Main",
      contentinfo: "Footer",
      complementary: "Aside",
    };
    if (role && roles[role]) return roles[role];
    return null;
  }

  function cardLike(el) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 80 || r.height > window.innerHeight * 0.9) return false;
    const radius = parseFloat(s.borderTopLeftRadius) || 0;
    const hasShadow = s.boxShadow && s.boxShadow !== "none";
    const hasBorder = s.borderTopWidth && s.borderTopWidth !== "0px" && s.borderTopStyle !== "none";
    return radius >= 4 || hasShadow || hasBorder;
  }

  window.__htfyDetectSections = function detectSections() {
    const out = [];
    const seen = new Set();

    function push(el, name, score) {
      if (!el || isOurChrome(el) || !visible(el)) return;
      if (seen.has(el)) return;
      seen.add(el);
      const r = el.getBoundingClientRect();
      const id = `sec_${name.toLowerCase().replace(/\W+/g, "_")}_${out.length}`;
      out.push({
        id,
        name,
        role: el.getAttribute("role") || el.tagName.toLowerCase(),
        selector: cssPath(el),
        rect: {
          x: Math.round(r.left + window.scrollX),
          y: Math.round(r.top + window.scrollY),
          width: Math.round(r.width),
          height: Math.round(r.height),
        },
        score,
      });
    }

    const landmarkSel =
      "header, nav, main, footer, aside, [role='banner'], [role='navigation'], [role='main'], [role='contentinfo'], [role='complementary']";
    document.querySelectorAll(landmarkSel).forEach((el) => {
      push(el, nameFor(el, roleName(el)), 0.95);
    });

    document.querySelectorAll("section, article, form").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 40000) return;
      push(el, nameFor(el, null), 0.8);
    });

    document.querySelectorAll("div, li, article").forEach((el) => {
      if (seen.has(el)) return;
      if (!cardLike(el)) return;
      push(el, "Card", 0.55);
    });

    // Cap + sort
    out.sort((a, b) => b.score - a.score || a.rect.y - b.rect.y);
    return out.slice(0, 40);
  };
})();
