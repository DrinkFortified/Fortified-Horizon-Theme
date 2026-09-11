/* Same-page anchor links, scrolled by hand.

   Every "Shop", "Build your bundle" and menu link on the store points at a
   section further down the same page. The browser's own anchor scroll lands
   those in the wrong place, for two reasons that compound on a phone:

     - it scrolls the target to y=0, where a sticky header already sits, so
       the top of the section starts life underneath it
     - it decides where to stop from the layout as it is at the moment of the
       click, while images between here and there are still lazy and occupy
       no height; each one that loads afterwards pushes the target further
       down, and nothing scrolls again to make up for it

   This handles ALL of them in one place, delegated from the document, so a
   button in a section and a link in the menu drawer behave identically. The
   drawer used to carry its own copy of this; one implementation is the point.

   WHAT SCROLLS is not always the window. From 990px up Horizon puts
   `overflow: hidden` on html and body and scrolls `.page-wrapper` instead
   (assets/base.css, assets/scroll-container.js). On that layout
   window.scrollTo is a no-op and window.scrollY is forever 0 — the first
   version of this file did exactly that, which is why every anchor button
   worked on a phone and did nothing on a desktop: the click's default had
   been cancelled and the replacement scroll went to an element that cannot
   move. So the container is looked up per click, the same way the theme's
   own scroll-container.js does it, and every read and write goes through it.

   It steps aside for anything that is not a real anchor: a hash with no
   matching element (#open-bundle, #leadcapture — those are hooks another
   script listens for), a link another handler has already claimed, a
   modifier-click, an off-page link. In every one of those cases the click is
   left exactly as the browser found it. */
(function () {
  if (window.ftdScrollToAnchor) return;

  var SQUEEZE = '(min-width: 990px)';

  /* The element whose scrollTop moves the page: `.page-wrapper` in the
     desktop squeeze layout, the document otherwise. Resolved on every call
     because a resize across 990px swaps it. */
  function scrollContainer() {
    var squeezed = false;
    try { squeezed = window.matchMedia(SQUEEZE).matches; } catch (_) {}
    if (squeezed) {
      var wrapper = document.querySelector('.page-wrapper');
      if (wrapper) return wrapper;
    }
    return document.scrollingElement || document.documentElement;
  }

  function isDocument(container) {
    return container === document.scrollingElement || container === document.documentElement;
  }

  function currentTop(container) {
    return isDocument(container) ? window.scrollY : container.scrollTop;
  }

  var headerOffset = function () {
    var raw = getComputedStyle(document.body).getPropertyValue('--header-height');
    var value = parseFloat(raw);
    return isFinite(value) ? value : 0;
  };

  /* Scroll `target` flush under the sticky header, then hold it there while
     the page settles. Corrections stop the instant the visitor touches the
     scroll themselves — being dragged back to a place you have just scrolled
     away from is worse than the bug. */
  function scrollToAnchor(target, hash) {
    if (!target) return;
    var container = scrollContainer();

    /* Where the target sits inside the container's scrollable content. For
       the document the container's own top is the viewport's top (0); for
       .page-wrapper it is wherever that element starts. */
    var wanted = function () {
      var containerTop = isDocument(container) ? 0 : container.getBoundingClientRect().top;
      var offsetInContainer = target.getBoundingClientRect().top - containerTop + currentTop(container);
      return Math.max(0, offsetInContainer - headerOffset());
    };

    var reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
    container.scrollTo({ top: wanted(), behavior: reduced ? 'auto' : 'smooth' });

    /* Keep the address bar honest without letting the browser scroll again. */
    if (hash) { try { history.replaceState(history.state, '', hash); } catch (_) {} }

    var cancelled = false;
    var names = ['wheel', 'touchstart', 'keydown'];
    var stop = function () {
      cancelled = true;
      for (var i = 0; i < names.length; i++) window.removeEventListener(names[i], stop);
    };
    for (var j = 0; j < names.length; j++) {
      window.addEventListener(names[j], stop, { passive: true, once: true });
    }

    /* Corrections start only once the smooth scroll has had time to finish,
       so they are fixing late layout rather than fighting the animation.
       `behavior: 'auto'` also overrides the `scroll-behavior: smooth` that
       base.css puts on .page-wrapper, so a correction is a snap, not a
       second animation. */
    var attempts = 0;
    var settle = function () {
      if (cancelled) return;
      var want = wanted();
      if (Math.abs(currentTop(container) - want) > 4) container.scrollTo({ top: want, behavior: 'auto' });
      if (++attempts < 6) setTimeout(settle, 180);
      else stop();
    };
    setTimeout(settle, 650);
  }

  /* The element a link points at, when it points somewhere on this page and
     that somewhere exists. Null otherwise — and null means "not ours". */
  function samePageTarget(link) {
    var url;
    try { url = new URL(link.href, window.location.href); } catch (_) { return null; }
    if (url.origin !== window.location.origin) return null;
    if (url.pathname !== window.location.pathname) return null;
    if (!url.hash || url.hash === '#') return null;
    var id;
    try { id = decodeURIComponent(url.hash.slice(1)); } catch (_) { id = url.hash.slice(1); }
    return document.getElementById(id);
  }

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;

    var link = event.target.closest('a[href]');
    if (!link) return;
    if (link.target && link.target !== '_self') return;

    var target = samePageTarget(link);
    if (!target) return;

    event.preventDefault();
    scrollToAnchor(target, link.hash);
  });

  window.ftdScrollToAnchor = scrollToAnchor;
})();
