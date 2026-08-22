/* ftd-selector-d.js - the inline section's surface for Product Selector D.

   The runtime lives in ftd-selector-d-core.js. This file only drains the
   section's config queue (window.__ftdDQueue, pushed by the section's inline
   script) and hands each config to it. The inline section passes no surface
   hooks: it is the default the core is written against. */
(function () {
  function boot() {
    var q = window.__ftdDQueue || [];
    while (q.length) {
      var c = q.shift();
      try { window.__ftdDRun(c, null); } catch (e) { console.error('ftd-selector-d.js', e); }
    }
  }

  window.__ftdDMain = function () {
    /* The core may not have parsed yet — a section and a block do not load in
       a guaranteed order. Hand ourselves to the core's pending list and let
       it flush us the moment it is ready. */
    if (!window.__ftdDRun) {
      (window.__ftdDCorePending = window.__ftdDCorePending || []).push(boot);
      return;
    }
    boot();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.__ftdDMain);
  else window.__ftdDMain();
})();
