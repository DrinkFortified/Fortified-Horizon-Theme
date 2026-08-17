/* ftd-selector-gold.js - the inline section's surface for Selector Gold.

   Forked from ftd-selector-d.js alongside the runtime, so Gold shares no
   globals with Selector D. That matters: both selectors can render on the
   same page, and while they were sharing __ftdDRun the core that parsed first
   would drive both — Gold would have been run by D's runtime, losing every
   Gold-only flag and putting the Review step back.

   The runtime lives in ftd-selector-gold-core.js. This file only drains the
   section's config queue (window.__ftdGoldQueue, pushed by the section's
   inline script) and hands each config to it. The inline section passes no
   surface hooks: it is the default the core is written against. */
(function () {
  function boot() {
    var q = window.__ftdGoldQueue || [];
    while (q.length) {
      var c = q.shift();
      try { window.__ftdGoldRun(c, null); } catch (e) { console.error('ftd-selector-gold.js', e); }
    }
  }

  window.__ftdGoldMain = function () {
    /* The core may not have parsed yet — a section and a block do not load in
       a guaranteed order. Hand ourselves to the core's pending list and let
       it flush us the moment it is ready. */
    if (!window.__ftdGoldRun) {
      (window.__ftdGoldCorePending = window.__ftdGoldCorePending || []).push(boot);
      return;
    }
    boot();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.__ftdGoldMain);
  else window.__ftdGoldMain();
})();
