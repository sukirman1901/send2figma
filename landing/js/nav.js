/* Shared nav + mobile sheet behavior */
(function () {
  var nav = document.querySelector("[data-atlas-nav]");
  if (nav) {
    var dropdowns = Array.prototype.slice.call(nav.querySelectorAll(".atlas-dropdown"));

    function setOpen(dd, open) {
      dd.classList.toggle("is-open", open);
      var trigger = dd.querySelector(".atlas-trigger");
      if (trigger) trigger.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function closeAll(except) {
      dropdowns.forEach(function (dd) {
        if (dd !== except) setOpen(dd, false);
      });
    }

    function blurFocus() {
      var el = document.activeElement;
      if (el && typeof el.blur === "function" && el !== document.body) el.blur();
    }

    dropdowns.forEach(function (dd) {
      var trigger = dd.querySelector(".atlas-trigger");

      dd.addEventListener("pointerenter", function () {
        closeAll(dd);
        setOpen(dd, true);
      });
      dd.addEventListener("pointerleave", function () {
        setOpen(dd, false);
      });

      // Keyboard / click: toggle without relying on :focus-within (keeps panel stuck after hash links)
      if (trigger) {
        trigger.addEventListener("click", function (e) {
          e.preventDefault();
          var willOpen = !dd.classList.contains("is-open");
          closeAll(willOpen ? dd : null);
          setOpen(dd, willOpen);
        });
      }
    });

    nav.querySelectorAll(".atlas-panel__item").forEach(function (link) {
      link.addEventListener("click", function () {
        closeAll();
        blurFocus();
      });
    });

    nav.querySelectorAll(".atlas-link").forEach(function (link) {
      link.addEventListener("pointerenter", function () {
        closeAll();
      });
      link.addEventListener("click", function () {
        closeAll();
        blurFocus();
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeAll();
        blurFocus();
      }
    });

    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target)) {
        closeAll();
      }
    });
  }

  var burger = document.querySelector("[data-atlas-burger]");
  var mobile = document.querySelector("[data-atlas-mobile]");
  if (!burger || !mobile) return;

  function setMobileOpen(open) {
    mobile.hidden = !open;
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.body.classList.toggle("atlas-nav-open", open);
  }

  burger.addEventListener("click", function () {
    setMobileOpen(mobile.hidden);
  });

  mobile.addEventListener("click", function (e) {
    if (e.target === mobile) setMobileOpen(false);
    // Close sheet when following a link (including same-page hashes)
    var link = e.target.closest && e.target.closest("a[href]");
    if (link && mobile.contains(link)) setMobileOpen(false);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !mobile.hidden) setMobileOpen(false);
  });

  window.addEventListener("resize", function () {
    if (window.matchMedia("(min-width: 861px)").matches && !mobile.hidden) {
      setMobileOpen(false);
    }
  });

  document.querySelectorAll("[data-atlas-acc]").forEach(function (acc) {
    var btn = acc.querySelector("[data-atlas-acc-btn]");
    var panel = acc.querySelector("[data-atlas-acc-panel]");
    if (!btn || !panel) return;

    btn.addEventListener("click", function () {
      var willOpen = panel.hidden;
      document.querySelectorAll("[data-atlas-acc]").forEach(function (other) {
        if (other === acc) return;
        other.classList.remove("is-open");
        var oBtn = other.querySelector("[data-atlas-acc-btn]");
        var oPanel = other.querySelector("[data-atlas-acc-panel]");
        if (oBtn) oBtn.setAttribute("aria-expanded", "false");
        if (oPanel) oPanel.hidden = true;
      });
      acc.classList.toggle("is-open", willOpen);
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      panel.hidden = !willOpen;
    });
  });
})();
