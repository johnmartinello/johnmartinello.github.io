(function () {
  if (window.__siteNav) return;
  window.__siteNav = true;
  if (!document.querySelector("main")) return;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  var request = null;
  var ticket = 0;
  var navigating = false;
  var scrollTimer = 0;

  function urlFrom(anchor) {
    try {
      return new URL(anchor.href, location.href);
    } catch (error) {
      return null;
    }
  }

  function shouldIntercept(anchor, event) {
    if (!anchor || event.defaultPrevented || event.button !== 0) return null;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    if (anchor.target && anchor.target !== "_self") return null;
    if (anchor.hasAttribute("download")) return null;
    var raw = anchor.getAttribute("href");
    if (!raw || raw.charAt(0) === "#") return null;
    var url = urlFrom(anchor);
    if (!url || url.origin !== location.origin) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  }

  function rememberScroll() {
    if (navigating) return;
    clearTimeout(scrollTimer);
    history.replaceState(
      { nav: 1, scroll: window.scrollY },
      "",
      location.pathname + location.search + location.hash
    );
  }

  function typesetMath() {
    var main = document.querySelector("main");
    if (!main || !window.MathJax) return Promise.resolve();
    var run = function () {
      if (window.MathJax.typesetPromise) return window.MathJax.typesetPromise([main]);
    };
    if (window.MathJax.startup && window.MathJax.startup.promise) {
      return window.MathJax.startup.promise.then(run);
    }
    return Promise.resolve(run());
  }

  function placeScroll(url, y) {
    if (url.hash.length > 1) {
      var target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, y || 0);
  }

  function visit(url, push, savedY) {
    var mine = ++ticket;
    var controller = new AbortController();
    if (request) request.abort();
    request = controller;
    navigating = true;

    return fetch(url.href, {
      signal: controller.signal,
      headers: { Accept: "text/html" },
    })
      .then(function (response) {
        var finalUrl = new URL(response.url, location.href);
        if (finalUrl.origin !== location.origin) {
          location.href = finalUrl.href;
          return null;
        }
        if (!response.ok && response.status !== 404) throw new Error(String(response.status));
        return response.text().then(function (html) {
          return { html: html, finalUrl: finalUrl };
        });
      })
      .then(function (payload) {
        if (!payload || mine !== ticket) return;
        var doc = new DOMParser().parseFromString(payload.html, "text/html");
        var next = doc.querySelector("main");
        var current = document.querySelector("main");
        if (!next || !current) throw new Error("missing main");
        var dest = payload.finalUrl;
        if (url.hash) dest.hash = url.hash;
        current.replaceWith(next);
        if (doc.title) document.title = doc.title;
        if (window.applySiteLanguage) window.applySiteLanguage();
        if (push) {
          history.pushState(
            { nav: 1, scroll: 0 },
            "",
            dest.pathname + dest.search + dest.hash
          );
        }
        return typesetMath()
          .catch(function () {})
          .then(function () {
            if (mine !== ticket) return;
            placeScroll(dest, push ? 0 : savedY);
            navigating = false;
          });
      })
      .catch(function (error) {
        if (error && error.name === "AbortError") return;
        if (mine !== ticket) return;
        location.href = url.href;
      });
  }

  document.addEventListener("click", function (event) {
    var anchor = event.target.closest ? event.target.closest("a") : null;
    var url = shouldIntercept(anchor, event);
    if (!url) return;
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.hash) return;
      event.preventDefault();
      return;
    }
    event.preventDefault();
    rememberScroll();
    visit(url, true, 0);
  });

  window.addEventListener("popstate", function () {
    var y = history.state && typeof history.state.scroll === "number" ? history.state.scroll : 0;
    visit(new URL(location.href), false, y);
  });

  window.addEventListener(
    "scroll",
    function () {
      if (navigating) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(rememberScroll, 150);
    },
    { passive: true }
  );

  history.replaceState({ nav: 1, scroll: window.scrollY }, "", location.href);
})();
