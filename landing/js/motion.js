/* Landing-wide motion: section reveals, marquee pause, smooth anchors */
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.toggle("atlas-reduce-motion", reduce);

  var reveals = Array.prototype.slice.call(document.querySelectorAll("[data-atlas-reveal]"));
  var marquees = Array.prototype.slice.call(document.querySelectorAll("[data-atlas-marquee]"));

  function markInView(el) {
    el.classList.add("is-inview");
  }

  if (reduce) {
    reveals.forEach(markInView);
    marquees.forEach(function (el) {
      el.classList.add("is-paused");
    });
  } else if ("IntersectionObserver" in window) {
    var revealIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            markInView(entry.target);
            revealIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    reveals.forEach(function (el) {
      revealIo.observe(el);
    });

    var marqueeIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          entry.target.classList.toggle(
            "is-paused",
            !entry.isIntersecting || document.hidden
          );
        });
      },
      { threshold: 0.05 }
    );
    marquees.forEach(function (el) {
      el.classList.add("is-paused");
      marqueeIo.observe(el);
    });
  } else {
    reveals.forEach(markInView);
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) return;
    marquees.forEach(function (el) {
      el.classList.add("is-paused");
    });
  });

  /* Soft-land hero on first paint if already in view */
  if (!reduce) {
    requestAnimationFrame(function () {
      reveals.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
          markInView(el);
        }
      });
    });
  }

  /* In-page anchors — respect reduced motion via CSS scroll-behavior */
  document.addEventListener("click", function (event) {
    var link = event.target.closest && event.target.closest('a[href^="#"]');
    if (!link) return;
    var id = link.getAttribute("href");
    if (!id || id === "#") return;
    var target = document.querySelector(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    if (history.replaceState) {
      history.replaceState(null, "", id);
    }
  });
})();
