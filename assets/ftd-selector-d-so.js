/* ftd-selector-d-so.js - the slide-over surface for Product Selector D.

   The runtime lives in ftd-selector-d-core.js. This file drains the block's
   config queue (window.__ftdDSOQueue) and supplies the only behaviour the
   slide-over does not share with the inline section: the dialog itself, the
   triggers that open it, and re-opening it when the customer comes back from
   /checkout. Everything else — plan rules, cart reconcile, review rendering —
   is the core's. */
(function () {
  /* One per rendered slide-over, so each keeps its own dialog in closure. */
  function makeSurface() {
    var openDlg = null;

    return {
      init: function (api) {
        var SID = api.SID;

        /* Portal to <body> so no ancestor's transform/filter/will-change
           traps the dialog inside its stacking context. */
        var dialog = document.getElementById('ftdc-slideover-' + SID);
        if (!dialog) return;
        if (dialog.parentNode !== document.body) document.body.appendChild(dialog);

        var triggers = document.querySelectorAll('[data-ftdc-slideover-open="' + SID + '"]');
        var closers = document.querySelectorAll('[data-ftdc-slideover-close="' + SID + '"]');
        var lastFocus = null;

        openDlg = function () {
          lastFocus = document.activeElement;
          dialog.classList.add('is-open');
          dialog.setAttribute('aria-hidden', 'false');
          document.documentElement.style.overflow = 'hidden';
          var close = dialog.querySelector('.ftdc-slideover__close');
          if (close) setTimeout(function () { close.focus(); }, 80);
        };
        function closeDlg() {
          dialog.classList.remove('is-open');
          dialog.setAttribute('aria-hidden', 'true');
          document.documentElement.style.overflow = '';
          if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
        }

        Array.prototype.forEach.call(triggers, function (t) { t.addEventListener('click', openDlg); });
        Array.prototype.forEach.call(closers, function (c) { c.addEventListener('click', closeDlg); });
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && dialog.classList.contains('is-open')) closeDlg();
        });

        /* Link-based triggers: any <a href="#open-bundle"> on the page opens
           this slide-over. Lets sections that only expose a "button link"
           field (and no blocks / classes) wire up a trigger by setting the
           link value. */
        var TRIGGER_HREF = api.C.TRIGGER_HREF;
        if (TRIGGER_HREF) {
          document.addEventListener('click', function (e) {
            var a = e.target.closest && e.target.closest('a[href]');
            if (!a) return;
            var href = a.getAttribute('href') || '';
            /* Match exact, or trailing-fragment so /any/path#open-bundle also works. */
            var hit = href === TRIGGER_HREF
                   || (TRIGGER_HREF.charAt(0) === '#' && href.slice(-TRIGGER_HREF.length) === TRIGGER_HREF);
            if (!hit) return;
            e.preventDefault();
            openDlg();
          });
        }

        /* Cart-icon trigger: optionally hijack the theme's cart button so it
           opens THIS slide-over to the Review (summary) step instead of the
           native cart drawer / cart page. Because the builder is
           cart-as-state, the Review step IS the cart summary. We listen on
           window in CAPTURE phase so we run before Horizon's document-level
           on:click delegation (component.js binds with {capture:true}) and
           before the <a href="/cart"> navigation, then swallow the event.
           Only active on pages where this slide-over is rendered. */
        var CART_CLICK_ON = api.C.CART_CLICK_ON;
        var CART_CLICK_SEL = api.C.CART_CLICK_SEL;
        if (CART_CLICK_ON && CART_CLICK_SEL) {
          window.addEventListener('click', function (e) {
            if (!e.target || !e.target.closest) return;
            if (e.target.closest('.ftdc-slideover')) return;   /* never hijack clicks inside our own panel */
            if (!e.target.closest(CART_CLICK_SEL)) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            /* Refresh from the live cart, then open to the summary (or the
               first step if the build is empty — an empty summary is
               pointless). */
            api.hydrateFromCart().then(function () {
              api.showStep(api.totalQty() > 0 ? 'review' : 'plans', { scroll: false });
              openDlg();
            });
          }, true);
        }

        /* The ?ftd-cart=1 landing handler is gone along with the theme.liquid
           redirect that produced it. /cart now renders the cart page. */
      },

      /* Back from /checkout with a non-empty build: the core has already put
         the wizard on Review, so just show it. */
      onReturnToReview: function () {
        if (!openDlg) return;
        setTimeout(function () { try { openDlg(); } catch (_) {} }, 60);
      }
    };
  }

  function boot() {
    var q = window.__ftdDSOQueue || [];
    while (q.length) {
      var c = q.shift();
      try { window.__ftdDRun(c, makeSurface()); } catch (e) { console.error('ftd-selector-d-so.js', e); }
    }
  }

  window.__ftdDSOMain = function () {
    /* See ftd-selector-d.js — the core may not have parsed yet. */
    if (!window.__ftdDRun) {
      (window.__ftdDCorePending = window.__ftdDCorePending || []).push(boot);
      return;
    }
    boot();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.__ftdDSOMain);
  else window.__ftdDSOMain();
})();
