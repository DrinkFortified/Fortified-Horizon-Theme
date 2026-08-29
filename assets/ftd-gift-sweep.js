/* The free creatine is only free while the bundle that earned it is still in
   the cart, and that has to hold on every page carrying a selector — not just
   the homepage.

   The homepage selector has always swept its own lines, but it sweeps them
   from inside its own runtime, which only loads where that section is. Put a
   selector on a product page and there is no sweep at all: the customer drops
   from three pouches to two in the drawer, 3PackFree stops applying, and the
   creatine turns into a $24 charge on a page that called it free.

   This is that same rule as a standalone file, so any page with a selector on
   it can load one. It stands down when the homepage runtime is present rather
   than racing it — two sweeps chasing the same lines would each see the other's
   removal as work still to do.

   Ownership is the property contract both selectors write:
     _sel   'ftdc-d'   this line is ours
     _role  'pouch' | 'creatine' | 'creatine2' | 'creatine-buy'
     _upsell            what kind of creatine, when it is one

   A creatine the customer PAID for is never touched. Erring that way costs a
   creatine; erring the other way charges someone for a free item. */
(function () {
  var SEL = '_sel';
  var OWNER = 'ftdc-d';

  /* Mirrors the "Buy 3" side of the 3PackFree automatic discount. */
  var GIFT_MIN = 3;

  /* A removal that keeps failing is the only way this can spin, so cap it.
     A removal that SUCCEEDS ends it by itself: the line is gone and the next
     pass finds nothing to do. */
  var MAX_WRITES = 4;
  var writes = 0;
  var busy = false;
  var timer = null;

  var EVT = 'shopify:cart:lines-update';

  function root() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  }

  function getCart() {
    return fetch(root() + 'cart.js', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); });
  }

  function removeLine(key) {
    return fetch(root() + 'cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: key, quantity: 0 })
    }).then(function (r) {
      if (!r.ok) throw new Error('cart/change.js ' + r.status);
      return r.json();
    });
  }

  /* Identify the PAID cases positively and treat everything else as ours.
     A selling plan means a recurring add-on they opted into; the one-time
     stamp means the one-off they opted into. Anything else is a gift. */
  function isGift(line) {
    var p = line.properties || {};
    if (p._upsell === 'creatine-first-order-free') return true;
    if (p._upsell === 'creatine-onetime') return false;
    var sa = line.selling_plan_allocation;
    if (sa && sa.selling_plan && sa.selling_plan.id) return false;
    return true;
  }

  /* Tell the theme's cart components what changed, so the drawer repaints
     without the line it just lost. 'update', never 'add' — this must not pop
     the drawer open at someone who is not looking at it. */
  function announce(cart) {
    var resolve;
    var promise = new Promise(function (res) { resolve = res; });
    promise.catch(function () {});

    var evt = new Event(EVT, { bubbles: true, composed: true });
    evt.action = 'update';
    evt.context = 'cart';
    evt.lines = (cart.items || []).map(function (l) {
      return { id: l.key, quantity: l.quantity };
    });
    evt.promise = promise;
    evt.ftdcFrom = 'ftd-gift-sweep';

    var cur = cart.currency || 'USD';
    document.dispatchEvent(evt);
    resolve({
      cart: {
        id: cart.token || '',
        totalQuantity: cart.item_count || 0,
        cost: { totalAmount: { amount: ((cart.total_price || 0) / 100).toFixed(2), currencyCode: cur } },
        lines: (cart.items || []).map(function (l) {
          return { id: l.key, quantity: l.quantity,
            cost: { totalAmount: { amount: ((l.final_line_price || 0) / 100).toFixed(2), currencyCode: cur } } };
        }),
        discountCodes: []
      },
      detail: { items: cart.items || [], itemCount: cart.item_count || 0,
                source: 'ftd-gift-sweep', didError: false }
    });
  }

  function sweep() {
    if (busy || writes >= MAX_WRITES) return Promise.resolve();
    busy = true;
    return getCart().then(function (cart) {
      var ours = (cart.items || []).filter(function (l) {
        return (l.properties || {})[SEL] === OWNER;
      });
      if (!ours.length) return;

      var pouches = 0;
      ours.forEach(function (l) {
        if ((l.properties || {})._role === 'pouch') pouches += (l.quantity || 0);
      });

      /* Both creatines hang off the bundle, so both go when it does. The
         second is half price BECAUSE it rides on a 3-pack. */
      var doomed = ours.filter(function (l) {
        var role = (l.properties || {})._role;
        if (role === 'creatine') return pouches < GIFT_MIN && isGift(l);
        if (role === 'creatine2') return pouches < GIFT_MIN;
        return false;
      });
      if (!doomed.length) return;
      writes++;

      /* Sequential on purpose: Shopify locks the cart per write, so firing
         these together races. */
      return doomed.reduce(function (chain, l) {
        return chain.then(function () { return removeLine(l.key); });
      }, Promise.resolve()).then(getCart).then(announce);
    }).catch(function (e) {
      try { console.warn('[ftd-gift-sweep]', e); } catch (_) {}
    }).then(function () { busy = false; }, function () { busy = false; });
  }

  /* Cart edits arrive in bursts — every tap of the drawer's minus button is
     its own write — so settle before reading. */
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; sweep(); }, 600);
  }

  function onCartChanged(e) {
    /* Our own announcement, and the homepage runtime's, both carry a marker.
       Reacting to those would be chasing our own tail. */
    if (e && e.ftdcFrom) return;
    schedule();
  }

  function start() {
    /* The homepage selector runs this same rule inside its own runtime. Where
       it is loaded, let it own the job. */
    if (window.__ftdGoldRun) return;
    if (window.__ftdGiftSweepStarted) return;
    window.__ftdGiftSweepStarted = true;

    document.addEventListener(EVT, onCartChanged);
    document.addEventListener('cart:update', onCartChanged);
    sweep();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
