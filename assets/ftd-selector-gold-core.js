/* ftd-selector-gold-core.js - the Selector Gold runtime.

   Forked from ftd-selector-d-core.js so Gold can be changed without touching
   anything Selector D or its slide-over load. Those two keep the D core and
   are not affected by edits here. The fork is deliberate: Gold-only behaviour
   was previously carried in the shared core behind opt-in flags, which meant
   Gold work kept landing in a file D depends on.

   Gold's behaviour is switched on from the section's config block:
     LIVE_SUMMARY      aside shows the order on every step
     SKIP_REVIEW       two steps only, no Review
     ADVANCE_ON_PLAN   picking a plan moves straight to the flavours
     CTA_ADDS_TO_CART  final button adds to cart instead of going to checkout

   Gold writes the same cart lines as Selector D (CART_OWNER below), so cart
   rules still apply to both — that tag is what the cart snippet keys off.

   surface is optional and lets a caller extend the runtime without forking
   it. Both hooks are called with the api object built at the bottom:
     surface.init(api)             wire up surface-specific UI, once, at boot
     surface.onReturnToReview(api) the customer came back from /checkout and
                                   the build is non-empty; default scrolls the
                                   wizard into view. */
(function () {
  if (window.__ftdGoldRun) return;   /* Gold's own guard — namespaced so D's core cannot claim it */

  function run(C, surface) {
  var SID = C.SID;
  /* Opt-in: keep the order summary painted on every step, for surfaces that
     show it permanently instead of only on Review. Absent for Selector D,
     so its behaviour is unchanged. */
  var LIVE_SUMMARY = !!C.LIVE_SUMMARY;
  /* Opt-in: no Review step — the aside already shows the order, so Bundle is
     the last step and its button goes straight to checkout. */
  var SKIP_REVIEW = !!C.SKIP_REVIEW;
  /* Opt-in: picking a plan moves straight on to the flavours on every screen
     size, not just mobile. */
  var ADVANCE_ON_PLAN = !!C.ADVANCE_ON_PLAN;
  /* Opt-in: the final button adds to cart instead of leaving for /checkout.
     Either way it is the press that commits the build; this only changes what
     happens next — open the cart drawer and stay put, or leave for checkout.
     Absent for Selector D, which still checks out. */
  var CTA_ADDS_TO_CART = !!C.CTA_ADDS_TO_CART;
  var root = document.getElementById('ftdc-' + SID);
  if (!root) return;
  var BUNDLE_COUNT = parseInt(C.BUNDLE_COUNT, 10) || 3;
  /* Pouches needed to earn the free creatine. Must match the "Buy N" side
     of the 3PackFree automatic discount in Shopify. */
  var GIFT_MIN = parseInt(C.GIFT_MIN, 10) || 3;
  var STEPS_ORDER_FULL = ['plans', 'products', 'review'];
  var RETURN_FLAG_KEY = 'ftdcReturnToReview';
  var state = { step: 'plans', plan: 'quarterly', selections: {} };
  var PLAN_NAMES = C.PLAN_NAMES;
  /* Editable step->CTA copy for the bottom action bar (was hardcoded, so
     merchant edits to these settings were silently ignored). */
  var BAR_LABELS = C.BAR_LABELS;

  /* Loop bundle mode (quarterly only). When fully configured, the pouches
     are registered with Loop's Create Bundle Transaction API and the cart
     gets pouch lines stamped with one shared loopBundleGuid so the customer
     can edit the whole bundle in Loop's portal later. */
  var LOOP_BUNDLE = C.LOOP_BUNDLE;
  var LOOP_BUNDLE_ON = !!(LOOP_BUNDLE.enabled && LOOP_BUNDLE.bundleId && LOOP_BUNDLE.apiSellingPlanId);
  function $(s, c) { return (c || root).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || root).querySelectorAll(s)); }
  function fmtMoney(c) { return '$' + (Math.max(0, c) / 100).toFixed(2); }
  function txt(sel) { var e = $(sel); return e ? e.textContent.trim() : ''; }
  /* Money written for humans ("$12.00") back to cents. Add-on prices are
     merchant-typed strings rather than variant prices, so reading them back is
     the only way the total can agree with the row the customer is looking at. */
  function parseMoney(s) {
    if (!s) return 0;
    var m = String(s).replace(/[^0-9.,]/g, '');
    if (!m) return 0;
    /* Last separator wins as the decimal point; anything earlier is grouping. */
    var cut = Math.max(m.lastIndexOf('.'), m.lastIndexOf(','));
    var whole = m, frac = '';
    if (cut > -1 && m.length - cut - 1 <= 2) { whole = m.slice(0, cut); frac = m.slice(cut + 1); }
    whole = whole.replace(/[.,]/g, '');
    return (parseInt(whole || '0', 10) * 100) + parseInt((frac + '00').slice(0, 2), 10);
  }

  /* The priced add-ons currently on the order, in the order they are shown.
     ONE source of truth: compute() and renderReview() both read this, so the
     summary rows and the total cannot disagree — they did, because compute()
     only ever summed the pouches and silently ignored the creatine the
     customer had just been charged for in the row above it. */
  function activeAddons() {
    var out = [];
    if (!Object.keys(state.selections).length && state.plan !== 'onetime') return out;
    var card = $('[data-creatine-card]');
    var imgEl = card ? card.querySelector('img') : null;
    var img = imgEl ? (imgEl.currentSrc || imgEl.getAttribute('src') || '') : '';

    if (giftQualifies()) {
      /* Quoted at the promise, because this is a quote. The gift is zeroed by
         a Shopify automatic discount, and nothing on the page can know whether
         that fired until the order is actually in the cart — which the drawer
         then shows, priced for real, a second after Add to Cart. */
      out.push({
        name: 'Creatine',
        note: 'Free with your first order',
        priceText: 'FREE',
        cents: 0,
        savedCents: parseMoney(txt('[data-creatine-was]')),
        free: true, imgSrc: img
      });
    }

    /* Quarterly's discounted second unit. */
    var cr2a = $('[data-creatine2-input]');
    if (state.plan === 'quarterly' && cr2a && cr2a.checked) {
      var p2a = parseMoney(txt('[data-creatine2-price]'));
      out.push({
        name: txt('[data-creatine2-title]') || '2nd Creatine', note: '',
        priceText: txt('[data-creatine2-price]'), cents: p2a,
        savedCents: Math.max(0, parseMoney(txt('[data-creatine2-was]')) - p2a),
        free: false, imgSrc: img
      });
    }

    /* Bought units are their own row, listed whether or not a gift is also
       on the order — they are a separate cart line. */
    var qty = creatineQty();
    if (qty > 0) {
      /* The card carries one-time pricing; the switch row carries the
         subscription's. Read whichever is actually on screen. */
      var priceSel = state.plan === 'onetime' ? '[data-creatine-price]' : '[data-upsell-creatine] .ftdc__upsell-price';
      var wasSel   = state.plan === 'onetime' ? '[data-creatine-was]'   : '[data-upsell-creatine] .ftdc__upsell-was';
      /* Merchant-typed marketing prices, same as the gift row above: a quote
         of what the configured discounts should deliver, not a reading of a
         cart line. The cart is the authority and answers a moment later. */
      var unit = parseMoney(txt(priceSel));
      var unitWas = parseMoney(txt(wasSel));
      out.push({
        name: txt('[data-creatine-title]') || 'Creatine',
        note: '',
        priceText: fmtMoney(unit * qty), cents: unit * qty,
        savedCents: Math.max(0, (unitWas - unit) * qty),
        qty: qty,
        free: false, imgSrc: img
      });
    }
    return out;
  }

  /* ============================================================
     DRAFT, THEN COMMIT

     The build lives here, in the page, and reaches the cart exactly once —
     when the customer presses Add to Cart.

     It used to be the other way round: every click wrote to the cart and the
     cart was read back as the source of truth. That is what made switching
     plans fragile. A switch had to migrate lines, which meant one add plus a
     removal per line, fired back to back at endpoints Shopify throttles; and
     because the removals are chained behind the add — deliberately, so a
     cancelled navigation cannot empty someone's cart — a single failed add
     left the new plan unsent AND the old lines standing, with nothing said to
     the customer and no path back. Which is exactly what it did.

     Drafting locally removes the whole class of problem. Switching plans now
     writes nothing at all. And because a commit only ever ADDS, a cart can
     hold a one-time order and a subscription side by side: build one, add it,
     build the next, add that too.

     What still belongs to the cart: lines we have already committed. We do
     not track or re-own them — the cart drawer edits them like any other
     line. The one exception is the free creatine, which is only free while
     the bundle that earned it is still there; see sweepUnearnedGift().
     ============================================================ */
  var CART_SEL = '_sel';
  var CART_OWNER = 'ftdc-d'; /* shared by every Product Selector D surface so the section + slide-over read/write the same cart lines */

  /* Cart endpoints answer with JSON, but a redirect, a challenge page or a
     routing miss answers with HTML — and .json() on that throws the opaque
     "Unexpected token '<'" the customer sees at checkout. Read as text and
     name the endpoint so failures are diagnosable. */
  /* Shopify throttles the cart endpoints, and it answers a throttled call with
     an HTML error page — which is how a plain rate limit reached the customer
     as "returned 429 (not JSON)". A 429 is "slow down", not "this failed", so
     back off and try again before anyone hears about it. Same for the 5xx
     blips the platform occasionally returns under load. */
  var RETRY_STATUS = { 429: 1, 502: 1, 503: 1, 504: 1 };
  var CART_RETRIES = 3;
  function cartFetch(url, opts, attempt) {
    attempt = attempt || 0;
    return fetch(url, opts).then(function (r) {
      if (RETRY_STATUS[r.status] && attempt < CART_RETRIES) {
        /* Retry-After is in seconds when Shopify sends it; otherwise back off
           exponentially from 400ms. Capped so a wedged store cannot leave the
           button spinning for a minute. */
        var hinted = 0;
        try { hinted = parseFloat((r.headers && r.headers.get && r.headers.get('Retry-After')) || '') || 0; } catch (_) {}
        var waitMs = Math.min(hinted > 0 ? hinted * 1000 : 400 * Math.pow(2, attempt), 5000);
        return new Promise(function (res) { setTimeout(res, waitMs); })
          .then(function () { return cartFetch(url, opts, attempt + 1); });
      }
      return r.text().then(function (t) {
        var body = null;
        if (t) { try { body = JSON.parse(t); } catch (_) { body = null; } }
        if (body === null && t) {
          if (RETRY_STATUS[r.status]) throw new Error('THROTTLED');
          throw new Error('Cart request to ' + url + ' returned ' + r.status + ' (not JSON).');
        }
        if (!r.ok) {
          throw new Error((body && (body.description || body.message)) || ('Cart error ' + r.status + ' at ' + url));
        }
        return body;
      });
    });
  }
  var CART_POST = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } };
  function cartPost(url, payload) {
    /* Any write makes a cached read stale, so drop it before AND after: the
       call itself may race with a read started while it was in flight. */
    cartRead = null;
    return cartFetch(url, { method: CART_POST.method, headers: CART_POST.headers, body: JSON.stringify(payload) })
      .then(function (b) { cartRead = null; return b; },
            function (e) { cartRead = null; throw e; });
  }
  /* Committing reads the cart twice in a row (the Loop patch, then the
     verify), and every read is its own request against a throttled endpoint.
     Reads within the window share one call; any write above invalidates it,
     so this can never serve a stale cart. */
  var cartRead = null, cartReadAt = 0, CART_READ_TTL = 250;
  function getCart() {
    var now = new Date().getTime();
    if (cartRead && (now - cartReadAt) < CART_READ_TTL) return cartRead;
    cartReadAt = now;
    cartRead = cartFetch('/cart.js', { headers: { 'Accept': 'application/json' } })
      .catch(function (e) { cartRead = null; throw e; });
    return cartRead;
  }

  /* Exact line set this builder should own, with identity properties. */
  function desiredItems() {
    var items = [];
    Object.keys(state.selections).forEach(function (k) {
      var s = state.selections[k];
      var props = {}; props[CART_SEL] = CART_OWNER; props._role = 'pouch';
      if (s.fnLabel) props._fn = s.fnLabel;
      if (s.flavorName) props._flavor = s.flavorName;
      var it = { id: parseInt(s.variantId, 10), quantity: s.qty, properties: props };
      if (state.plan === 'monthly') { var pm = parseInt(s.planMonthly, 10); if (pm) it.selling_plan = pm; }
      else if (state.plan === 'quarterly') { var pq = parseInt(s.planQuarterly, 10); if (pq) it.selling_plan = pq; }
      items.push(it);
    });
    /* Two creatine lines, never one. The gift carries _role=creatine and no
       selling plan, which is both how 3PackFree can reach it and how the
       eviction knows it is ours to take back. Anything BOUGHT carries
       _role=creatine-buy, so withdrawing the gift can never remove it — and
       so the two do not collapse into a single cart line, since lineSig()
       keys on role.

       Creatine is still an add-on to a hydration order and is never sent on
       its own; the flavour grid is where a pouch gets chosen. */
    var card = $('[data-creatine-card]');
    /* Creatine is an add-on to a hydration order on a subscription — it must
       not ship alone on a plan whose whole point is the pouches. A one-time
       order is just a shop, so there it can stand by itself. */
    var hasPouches = Object.keys(state.selections).length > 0;
    if (card && (hasPouches || state.plan === 'onetime')) {
      var cv = parseInt(card.dataset.variant, 10);
      if (cv) {
        if (giftQualifies()) {
          var gp = {}; gp[CART_SEL] = CART_OWNER; gp._role = 'creatine';
          gp._upsell = 'creatine-first-order-free';
          items.push({ id: cv, quantity: 1, properties: gp });
        }
        var bought = creatineQty();
        if (bought > 0) {
          var bp = {}; bp[CART_SEL] = CART_OWNER; bp._role = 'creatine-buy';
          var bi = { id: cv, quantity: bought, properties: bp };
          if (state.plan === 'monthly') {
            var pm2 = parseInt(card.dataset.planMonthly, 10);
            if (pm2) bi.selling_plan = pm2;
          } else if (state.plan === 'onetime') {
            bp._upsell = 'creatine-onetime';
          }
          items.push(bi);
        }
      }
    }
    /* Quarterly's discounted second unit: its own line, its own selling plan. */
    var cr2d = $('[data-creatine2-input]');
    var card2d = $('[data-creatine-card]');
    if (state.plan === 'quarterly' && cr2d && cr2d.checked && card2d && Object.keys(state.selections).length > 0) {
      var v2d = parseInt(card2d.dataset.variant, 10);
      var row2d = $('[data-upsell-creatine2]');
      var p50d = row2d ? parseInt(row2d.getAttribute('data-plan-quarterly-50off'), 10) : 0;
      if (v2d && p50d) {
        var cp2d = {}; cp2d[CART_SEL] = CART_OWNER; cp2d._role = 'creatine2';
        items.push({ id: v2d, quantity: 1, selling_plan: p50d, properties: cp2d });
      }
    }
    return items;
  }

  /* Put the finished build into the cart. The only place this file writes
     lines, and it runs only when the customer presses Add to Cart.

     It adds; it never removes. Whatever is already in the cart is someone
     else's — an order they built a minute ago, something from another page —
     and stays exactly as it is.

     One request, so the build lands whole or not at all. /cart/add.js is
     atomic across its items array, which is what we want here: a bundle
     half-added is priced as a bundle and shipped as an accident, whereas a
     clean failure is something the customer can simply press again. */
  function commitToCart() {
    var items = desiredItems();
    if (!items.length) return Promise.reject(new Error('Nothing selected yet.'));
    return cartPost('/cart/add.js', { items: items });
  }

  /* Set a card's quantity and repaint it, without touching the cart. */
  function applyQty(c, n) {
    var v = c.dataset.variantId, a = $('.ftdc__add', c), q = $('.ftdc__qty', c), i = $('.ftdc__qty-input', c);
    state.selections[v] = { qty: n, variantId: v, fnId: c.dataset.fnId, fnLabel: c.dataset.fnLabel, flavorName: c.dataset.flavorName, planMonthly: c.dataset.planMonthly || '', planQuarterly: c.dataset.planQuarterly || '', price: parseInt(c.dataset.variantPrice, 10) || 0, compareAt: parseInt(c.dataset.variantCompare, 10) || 0 };
    c.classList.add('is-selected');
    if (a) a.hidden = true; if (q) q.hidden = false; if (i) i.value = n;
  }
  /* Is this cart's creatine line one WE gave away, or one the customer chose
     to pay for? Only a gift may be taken back out when the build drops under
     the threshold.

     Keying purely on the _upsell stamp was too narrow: we only started
     writing it on 2026-08-18, so every creatine added before that — and every
     one added by the old Loop free-plan route — went unrecognised and sat in
     the cart being charged for. Fall back to the two things that positively
     identify a PAID line instead, and treat anything else as ours:

       - a selling plan means the recurring monthly add-on they opted into
       - _upsell=creatine-onetime is the one-time add-on they opted into

     Erring this way costs us a creatine at worst. Erring the other way
     charges someone $24 for something the page called free. */
  function creatineIsGift(line) {
    if (!line) return false;
    var p = line.properties || {};
    if (p._upsell === 'creatine-first-order-free') return true;
    if (p._upsell === 'creatine-onetime') return false;
    var sa = line.selling_plan_allocation;
    if (sa && sa.selling_plan && sa.selling_plan.id) return false;
    return true;
  }

  /* The free creatine is only free while the bundle that earned it is still
     in the cart. Nothing else here reads the cart any more, but this has to:
     the customer can delete pouches from the cart drawer long after we
     committed them, and a creatine left behind on its own gets charged for at
     $24 on a page that called it free.

     Same for the quarterly second creatine, which exists only as an add-on to
     a bundle. A one-time creatine someone deliberately bought stands alone —
     that is a product they chose, not something we put there.

     Pouches are counted across the whole cart rather than per order, which is
     deliberate: 3PackFree is a cart-level "buy 3 hydration" discount and does
     not care which order they came from, so this must not either. Where it is
     ambiguous it keeps the creatine — the cost of that is one creatine, and
     the cost of the opposite is charging someone $24 for a free item.

     Runs once, on load. It used to run on every cart change, which is how a
     write that kept failing walked the cart endpoints into a 429; there is
     nothing to re-trigger it now. */
  function sweepUnearnedGift() {
    return getCart().then(function (cart) {
      var ours = (cart.items || []).filter(function (l) { return (l.properties || {})[CART_SEL] === CART_OWNER; });
      if (!ours.length) return;
      var pouches = 0;
      ours.forEach(function (l) { if ((l.properties || {})._role === 'pouch') pouches += (l.quantity || 0); });

      var doomed = ours.filter(function (l) {
        var role = (l.properties || {})._role;
        if (role === 'creatine') return pouches < GIFT_MIN && creatineIsGift(l);
        if (role === 'creatine2') return pouches === 0;
        return false;
      });
      if (!doomed.length) return;

      return doomed.reduce(function (chain, l) {
        return chain.then(function () { return cartPost('/cart/change.js', { id: l.key, quantity: 0 }); });
      }, Promise.resolve()).then(function () {
        return getCart().then(function (c) { return announceCartUpdate(c, 'update'); });
      });
    }).catch(function (e) { try { console.warn('[FTDC-D] gift sweep', e); } catch (_) {} });
  }

  /* Loop bundle (Option A): mint a transaction, then stamp _bundleId +
     selling plan onto our quarterly pouch lines already in the cart. */
  function patchLoopBundle() {
    if (!(LOOP_BUNDLE_ON && state.plan === 'quarterly')) return Promise.resolve();
    return getCart().then(function (cart) {
      var key0 = LOOP_BUNDLE.propKey || '_bundleId';
      /* Only lines that have not been grouped yet. A cart can now hold more
         than one quarterly order — build one, add it, build another — and
         re-stamping an earlier one with this transaction's id would fold two
         separate subscriptions into a single bundle. */
      var pouches = (cart.items || []).filter(function (l) {
        var p = l.properties || {};
        return p[CART_SEL] === CART_OWNER && p._role === 'pouch' && !p[key0];
      });
      if (!pouches.length) return;
      var body = { bundleId: parseInt(LOOP_BUNDLE.bundleId, 10), bundleVariantId: parseInt(LOOP_BUNDLE.bundleVariantId, 10) || null, bundleDiscountId: parseInt(LOOP_BUNDLE.bundleDiscountId, 10) || null, sellingPlanId: parseInt(LOOP_BUNDLE.apiSellingPlanId, 10) };
      return fetch('https://bundle.loopwork.co/api/transactions/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error('Loop ' + r.status); return b; }); })
        .then(function (b) {
          var txn = extractBundleTxnId(b); if (!txn) throw new Error('no txn id');
          var key = LOOP_BUNDLE.propKey || '_bundleId';
          var cartPlanId = parseInt(LOOP_BUNDLE.cartSellingPlanId, 10);
          return pouches.reduce(function (chain, l) {
            return chain.then(function () {
              var props = {}; var lp = l.properties || {}; Object.keys(lp).forEach(function (k) { props[k] = lp[k]; });
              props[key] = String(txn); if (LOOP_BUNDLE.bundleName) props.bundleName = LOOP_BUNDLE.bundleName;
              /* quantity is mandatory here: change.js assumes 1 when omitted,
                 which silently collapsed multi-qty lines (2+ of one flavor). */
              var payload = { id: l.key, quantity: l.quantity, properties: props }; if (cartPlanId) payload.selling_plan = cartPlanId;
              return cartPost('/cart/change.js', payload);
            });
          }, Promise.resolve());
        });
    }).catch(function (e) { try { console.warn('[FTDC-D] Loop bundle patch failed, proceeding without grouping:', e); } catch (_) {} });
  }
  /* ---- Talking to the theme's cart UI ----------------------------------

     Horizon 4 retired the cart:refresh / cart:update pair this file was
     written against and moved the whole cart conversation onto Shopify's
     standard events. Nothing listens to cart:refresh any more, which is why
     writing to the cart left the drawer, the bubble and the count showing the
     cart as it was before — only a page load caught them up.

     The one event that matters is shopify:cart:lines-update. It carries a
     promise, and the theme's components hang their work off it:
       cart-drawer-component  auto-opens, but only for action 'add'
       cart-items-component   re-renders the drawer/page contents
       cart-icon, header-actions  update the bubble and the live region

     Resolving with no `sections` is the supported path for a caller outside
     the cart: cart-items-component answers it by re-rendering the section
     from the server itself.

     The event class lives behind the theme's import map. Warm it up front so
     the add-to-cart click does not wait on a network round trip, and fall
     back to a plain event carrying the same fields — every listener in the
     theme reads `action`, `promise` and `target`, nothing more. */
  var STD_CART_EVENT = 'shopify:cart:lines-update';
  var stdEvents = null;
  function standardEvents() {
    if (stdEvents) return stdEvents;
    stdEvents = import('@shopify/events')
      .catch(function () { return import('https://cdn.shopify.com/storefront/standard-events.js'); })
      .catch(function () { return null; });
    return stdEvents;
  }
  standardEvents();

  /* The shape CartLinesUpdateEvent.createCartFromAjaxResponse would give us,
     for when the module could not be loaded. Money is in cents over /cart.js
     and a decimal string in the event payload. */
  function cartSummaryFromAjax(c) {
    var cur = c.currency || 'USD';
    function money(cents) { return ((cents || 0) / 100).toFixed(2); }
    return {
      id: c.token || '',
      totalQuantity: c.item_count || 0,
      cost: { totalAmount: { amount: money(c.total_price), currencyCode: cur } },
      lines: (c.items || []).map(function (l) {
        return { id: l.key, quantity: l.quantity, cost: { totalAmount: { amount: money(l.final_line_price), currencyCode: cur } } };
      }),
      discountCodes: (c.cart_level_discount_applications || []).map(function (d) {
        return { applicable: true, code: d.title || '' };
      })
    };
  }

  /* Announce a cart write to the theme. `action` is 'add' only when the
     customer pressed Add to Cart — that is the flag cart-drawer-component
     reads to decide whether to open itself, so the gift sweep must not claim
     it and pop the drawer open at someone who just loaded the page. */
  function announceCartUpdate(cart, action) {
    return standardEvents().then(function (mod) {
      var Ctor = mod && mod.CartLinesUpdateEvent;
      var ours = (cart.items || []).filter(function (l) { return (l.properties || {})[CART_SEL] === CART_OWNER; });
      var lines = (ours.length ? ours : (cart.items || [])).map(function (l) {
        return action === 'add'
          ? { merchandiseId: String(l.variant_id), quantity: l.quantity }
          : { id: l.key, quantity: l.quantity };
      });
      if (!lines.length) return;

      var resolve;
      var promise = new Promise(function (res) { resolve = res; });
      /* Nothing here rejects, but an unhandled rejection would still surface
         in the console if one ever did. */
      promise.catch(function () {});

      var payload = { action: action, context: 'standard-action', lines: lines, promise: promise };
      var evt;
      try {
        evt = Ctor ? new Ctor(payload) : null;
      } catch (_) { evt = null; }
      if (!evt) {
        evt = new Event(STD_CART_EVENT, { bubbles: true, composed: true });
        Object.keys(payload).forEach(function (k) { evt[k] = payload[k]; });
      }
      /* So our own listener below can tell our echo from a real outside
         change without leaning on the timing guard alone. */
      evt.ftdcFrom = SID;

      var summary;
      try {
        summary = Ctor && Ctor.createCartFromAjaxResponse ? Ctor.createCartFromAjaxResponse(cart) : cartSummaryFromAjax(cart);
      } catch (_) { summary = cartSummaryFromAjax(cart); }

      document.dispatchEvent(evt);
      /* Resolve after dispatch: the listeners hang their work off this promise
         and have to be attached before it settles. */
      resolve({
        cart: summary,
        detail: { items: cart.items || [], itemCount: cart.item_count || 0, source: 'ftd-selector-gold', didError: false }
      });
      return promise;
    }).catch(function (e) { try { console.warn('[FTDC-D] cart announce failed', e); } catch (_) {} });
  }

  /* No listener for cart changes made elsewhere any more. The builder is a
     draft, not a mirror of the cart, so a quantity edited in the drawer is
     simply the customer editing their cart — nothing here needs to follow it,
     and nothing here will contradict it. Every guard that used to referee
     that argument (the in-flight flags, the self-write quiet window, the echo
     suppression) went with it. */


  function sortStagedBlocks() {
    var stage = $('[data-ftdc-stage]');
    if (!stage) return;
    var bullets = $('[data-bullets]');
    var grid = $('[data-grid]');
    var upsells = $('[data-upsells]');
    var announce = $('[data-announce]');
    var moved = { bullet: 0, fn: 0, fnPh: 0, up: 0, ann: 0 };
    $$('[data-slot="announce"]', stage).forEach(function (n) { if (announce) { announce.appendChild(n); moved.ann++; } });
    $$('[data-slot="bullet"]', stage).forEach(function (n) { if (bullets) { bullets.appendChild(n); moved.bullet++; } });
    $$('[data-slot="function"]', stage).forEach(function (n) { if (grid) { grid.appendChild(n); moved.fn++; } });
    $$('[data-slot="function-placeholder"]', stage).forEach(function (n) { if (grid) { grid.appendChild(n); moved.fnPh++; } });
    $$('[data-slot="upsell"]', stage).forEach(function (n) { if (upsells) { upsells.appendChild(n); moved.up++; } });
    /* The creatine block emits two halves: the card is bought from, in the
       flavour grid; the gift row only confirms, in the add-ons list. */
    var addons = $('.ftdc__bundle-addons');
    /* Under the flavour grid, not inside it: the grid lays its children out
       as equal columns, and creatine is an add-on rather than a flavour. */
    var creSlot = $('[data-creatine-slot]');
    $$('[data-slot="creatine-card"]', stage).forEach(function (n) { if (creSlot) { creSlot.appendChild(n); } });
    $$('[data-slot="creatine-included"]', stage).forEach(function (n) { if (addons) { addons.appendChild(n); } });
    $$('[data-slot="creatine-addon"]', stage).forEach(function (n) { if (addons) { addons.appendChild(n); } });
    $$('[data-slot="creatine-addon2"]', stage).forEach(function (n) { if (addons) { addons.appendChild(n); } });
    if (bullets) bullets.hidden = moved.bullet === 0;
    if (announce) announce.hidden = moved.ann === 0;
    var gridEmpty = $('[data-grid-empty]');
    if (gridEmpty) gridEmpty.hidden = (moved.fn > 0);
    /* The flavour grid is one row of equal columns, so a card's width is the
       row divided by however many flavours the merchant added. The creatine
       card sits in its own row below and has to match, which CSS alone cannot
       work out from a row it is not in — hand it the count. */
    var cols = moved.fn + moved.fnPh;
    if (root && cols > 0) root.style.setProperty('--ftdcg-cols', cols);
  }
  sortStagedBlocks();

  var plansContainer = $('.ftdc__plans');
  if (plansContainer && plansContainer.dataset.planOrder) {
    plansContainer.dataset.planOrder.split(',').forEach(function (name) {
      var n = name.trim(); if (!n) return;
      var plan = plansContainer.querySelector('[data-plan="' + n + '"]');
      if (plan) plansContainer.appendChild(plan);
    });
  }
  var firstPlan = plansContainer ? plansContainer.querySelector('.ftdc__plan') : null;
  if (firstPlan) {
    $$('.ftdc__plan').forEach(function (p) { p.classList.remove('is-active'); var r = p.querySelector('input'); if (r) r.checked = false; });
    firstPlan.classList.add('is-active');
    var fr = firstPlan.querySelector('input'); if (fr) { fr.checked = true; state.plan = fr.value; }
  }

  function showStep(name, opts) {
    opts = opts || {};
    var shouldScroll = opts.scroll !== false;
    state.step = name;
    root.dataset.activeStep = name;
    /* Hard-hide the sticky bar on Review (it duplicates the step's own
       Checkout button); inline style so no stylesheet can override it. */
    var bar0 = $('[data-bar]'); if (bar0) bar0.style.display = (name === 'review') ? 'none' : '';
    var STEPS_ORDER = SKIP_REVIEW ? ['plans', 'products'] : STEPS_ORDER_FULL;
    var idx = STEPS_ORDER.indexOf(name);
    $$('.ftdc__step').forEach(function (s) { var m = s.dataset.step === name; s.hidden = !m; s.classList.toggle('is-active', m); });
    $$('.ftdc__step-pill').forEach(function (p) {
      var pi = STEPS_ORDER.indexOf(p.dataset.stepPill);
      p.classList.toggle('is-active', pi === idx); p.classList.toggle('is-done', pi < idx);
      /* The trail is styled state only; this is what says "you are here" to a
         screen reader. */
      if (pi === idx) p.setAttribute('aria-current', 'step'); else p.removeAttribute('aria-current');
    });
    if (name === 'review' || LIVE_SUMMARY) renderReview();
    updateBar();
    if (shouldScroll) {
      setTimeout(function () {
        try {
          var panel = root.closest && root.closest('.ftdc-slideover__panel');
          if (panel) { panel.scrollTo({top: 0, behavior: 'smooth'}); }
          else { root.scrollIntoView({behavior: 'smooth', block: 'start'}); }
        } catch (_) {}
      }, 40);
    }
  }

  /* Does this build earn the free creatine? Any subscription plan with at
     least GIFT_MIN pouches — it used to be "quarterly, always", which only
     worked because quarterly was the only plan that could reach three.
     Monthly can now too.

     GIFT_MIN mirrors the "Buy 3" side of the 3PackFree automatic discount in
     Shopify. That discount is what actually makes the line free; this only
     decides when to put the line in the cart. If the two disagree, the
     customer is shown a gift they get charged for, so the setting carries a
     warning to keep them in step. One-time orders are excluded on purpose:
     the ask was subscriptions only. */
  function giftQualifies() {
    return state.plan !== 'onetime' && totalQty() >= GIFT_MIN;
  }

  /* Point the paid creatine row at the current plan's copy and price. The row
     was rendered once from the monthly settings and never changed, so a
     one-time customer saw the monthly price — $12.00 against a one-time price
     of $18.00, a $6 under-quote that activeAddons() then copied into the order
     summary and the total, because it reads these same nodes.

     Quarterly has no paid first-creatine price of its own (addon_*_quarterly
     is the second one, at 50% off), so it falls back to the monthly figures:
     it is a subscription, and the row only appears there mid-build before the
     bundle reaches the gift threshold. */
  function updateAddonPricing() {
    var row = $('[data-creatine-card]');
    if (!row) return;
    var key = state.plan === 'onetime' ? 'onetime' : 'monthly';
    /* `was` deliberately does not inherit: a strike-through is a claim that
       this plan discounts the item, and the monthly claim is not true of a
       one-time order. Everything else falls back happily. */
    var pick = function (name, inherit) {
      var v = row.getAttribute('data-' + name + '-' + key);
      if ((v === null || v === '') && inherit !== false) v = row.getAttribute('data-' + name + '-monthly') || '';
      v = (v || '').trim();
      /* A lone dash is how these settings carry "nothing" — the saved monthly
         description is literally "-", which rendered as a stray hyphen under
         the title. The section already treats it that way for onetime_was. */
      return (v === '-' || v === '—') ? '' : v;
    };
    var set = function (sel, value) {
      var el = $(sel, row);
      if (!el) return;
      el.textContent = value;
      /* An empty description or strike-through price would otherwise leave a
         blank line and a stray gap in the row. */
      el.hidden = !value;
    };
    var price = pick('price');
    var was = pick('was', false);
    /* And a was-price equal to the price is not a discount either, however it
       got there. */
    if (was === price) was = '';
    set('[data-creatine-title]', pick('label'));
    set('[data-creatine-desc]', pick('desc'));
    set('[data-creatine-price]', price);
    set('[data-creatine-was]', was);
  }

  /* Show the gift as an "Included — FREE" row and hide the manual priced
     toggle, which would otherwise contradict it and demand a redundant click.
     Below the threshold the priced toggle comes back. */
  function updateCreatineIncluded() {
    updateAddonPricing();
    updateAddonQtyUI();
    var gift = giftQualifies();
    var onetime = state.plan === 'onetime';
    var el = $('[data-creatine-included]');
    if (el) el.hidden = !gift;
    /* The card is the one-time storefront for creatine; subscriptions get the
       switch instead, and only while they have not already earned the gift. */
    var card = $('[data-creatine-card]');
    if (card) card.hidden = !onetime;
    var slot = $('[data-creatine-slot]');
    if (slot) slot.hidden = !onetime;
    var payRow = $('[data-upsell-creatine]');
    if (payRow) payRow.hidden = onetime || gift;
    /* The first one is the gift, so the discounted second only makes sense
       once the bundle has earned it. */
    var row2 = $('[data-upsell-creatine2]');
    if (row2) row2.hidden = !(gift && state.plan === 'quarterly');
  }
  /* How many creatines a one-time order is buying. Subscriptions take one per
     shipment and the gift is a single unit, so this only applies to onetime. */
  var addonQty = 0;

  /* THE number of creatines on the order. Everything — the cart payload, the
     summary row, the total — goes through here, so the three cannot disagree
     the way the add-on price and the total once did. */
  /* How many creatines the customer is BUYING. The gift is counted
     separately and shipped as its own cart line — see desiredItems(). They
     used to share one checkbox, which is why the row kept having to flip
     between "Add Creatine" and "Included — FREE". */
  function creatineQty() {
    /* One-time buys by the unit from the card. A subscription add-on is not a
       quantity you pick — it is one per shipment — so there it is the switch. */
    if (state.plan === 'onetime') return Math.max(0, addonQty);
    var cr = $('[data-creatine-input]');
    return (cr && cr.checked) ? 1 : 0;
  }

  /* Swap the on/off switch for a stepper on one-time, and keep the two in
     step: the checkbox stays the "is it on the order" flag that the rest of
     the runtime already keys off, the stepper only decides how many. */
  /* The card behaves like a flavour card: an Add button until you have one,
     a stepper after that. */
  function updateAddonQtyUI() {
    var card = $('[data-creatine-card]');
    if (!card) return;
    var qty = creatineQty();
    var add = $('[data-creatine-add]', card), box = $('[data-creatine-qty]', card);
    var input = $('[data-creatine-qty-input]', card);
    if (add) add.hidden = qty > 0;
    if (box) box.hidden = qty === 0;
    if (input && String(input.value) !== String(qty)) input.value = qty;
    card.classList.toggle('is-selected', qty > 0);
  }

  function setAddonQty(n) {
    addonQty = Math.max(0, Math.floor(n) || 0);
    updateAddonQtyUI(); updateBar();
  }

  var upsellAutoScrolled = false;

  $$('input[name="ftdc-plan-' + SID + '"]').forEach(function (r) {
    r.addEventListener('change', function () {
      state.plan = r.value;
      $$('.ftdc__plan').forEach(function (p) { p.classList.remove('is-active'); });
      var l = r.closest('.ftdc__plan'); if (l) l.classList.add('is-active');
      /* Keep the flavours already chosen and trim them to what the new plan
         allows, rather than emptying the build. The upgrade nudge now sits
         beside a half-built bundle on the Bundle step, and wiping every
         selection the moment it is pressed would mean the prompt to save 20%
         quietly costs the customer their work. */
      reclampSelections();
      upsellAutoScrolled = false;
      /* The add-on choice does not survive a plan switch: each plan prices it
         differently. updateCreatineIncluded() re-forces it on for quarterly;
         other plans start unchecked until set. */
      addonQty = 0;
      var cr0 = $('[data-creatine-input]'); if (cr0) cr0.checked = false;
      var cr20 = $('[data-creatine2-input]'); if (cr20) cr20.checked = false;
      updateBar(); updateProgress(); updateCreatineIncluded();
      /* Auto-advance to the Bundle step so the customer doesn't have to
         scroll back and press Continue. Only from the plan step: switching
         plans from the aside nudge is already on Bundle, and re-entering it
         would yank the page back to the top mid-build. */
      if (state.step === 'plans' &&
          (ADVANCE_ON_PLAN || (window.matchMedia && window.matchMedia('(max-width: 749px)').matches))) {
        setTimeout(function () { showStep('products'); }, 240);
      }
    });
  });
  updateCreatineIncluded();

  function reset(c) {
    c.classList.remove('is-selected');
    var a = $('.ftdc__add', c), q = $('.ftdc__qty', c), i = $('.ftdc__qty-input', c);
    if (a) a.hidden = false; if (q) q.hidden = true; if (i) i.value = 0;
  }
  /* Fit the current selections into the new plan's ceiling: quarterly takes
     BUNDLE_COUNT pouches; monthly and one-time take as many as you like.
     Trims from the end so the earliest choices survive, then repaints every
     card from whatever state survived. */
  function reclampSelections() {
    var cap = bundleSize();
    if (cap) {
      var running = 0;
      Object.keys(state.selections).forEach(function (k) {
        var allowed = Math.max(0, Math.min(state.selections[k].qty, cap - running));
        running += allowed;
        if (allowed === 0) delete state.selections[k];
        else state.selections[k].qty = allowed;
      });
    }
    $$('.ftdc__card').forEach(function (c) {
      var s = state.selections[c.dataset.variantId];
      if (s) applyQty(c, s.qty); else reset(c);
    });
  }
  function setQty(c, n) {
    n = Math.max(0, Math.floor(n));
    if (state.plan === 'quarterly') {
      var others = totalQty() - (state.selections[c.dataset.variantId] ? state.selections[c.dataset.variantId].qty : 0);
      n = Math.min(n, Math.max(0, BUNDLE_COUNT - others));
    }
    /* Monthly used to be exactly one pouch, and picking a second flavour
       REPLACED the first rather than adding to it. It now takes as many as
       the customer wants, like a one-time order — the difference is only that
       every line carries that variant's monthly selling plan, so the whole
       lot renews together. Only quarterly is still capped, because the
       3-pouch bundle is the offer. */
    var v = c.dataset.variantId, a = $('.ftdc__add', c), q = $('.ftdc__qty', c), i = $('.ftdc__qty-input', c);
    if (n === 0) {
      delete state.selections[v]; c.classList.remove('is-selected');
      if (a) a.hidden = false; if (q) q.hidden = true; if (i) i.value = 0;
    } else {
      state.selections[v] = { qty: n, variantId: v, fnId: c.dataset.fnId, fnLabel: c.dataset.fnLabel, flavorName: c.dataset.flavorName, planMonthly: c.dataset.planMonthly || '', planQuarterly: c.dataset.planQuarterly || '', price: parseInt(c.dataset.variantPrice, 10) || 0, compareAt: parseInt(c.dataset.variantCompare, 10) || 0 };
      c.classList.add('is-selected');
      if (a) a.hidden = true; if (q) q.hidden = false; if (i) i.value = n;
    }
    updateProgress(); updateCreatineIncluded(); updateBar();
    /* Quarterly bundle just filled up for the first time this visit — ease
       the customer down to the add-ons instead of leaving it to scroll. */
    if (state.plan === 'quarterly' && !upsellAutoScrolled && totalQty() === BUNDLE_COUNT) {
      upsellAutoScrolled = true;
      var addons = $('.ftdc__bundle-addons');
      if (addons) setTimeout(function () { addons.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 220);
    }
  }

  $$('.ftdc__card[data-slot="function"]').forEach(function (c) {
    c.addEventListener('click', function (e) {
      var b = e.target.closest('[data-card-action]'); if (!b) return;
      var i = $('.ftdc__qty-input', c), cur = parseInt(i ? i.value : 0, 10) || 0;
      if (b.dataset.cardAction === 'add') setQty(c, 1);
      else if (b.dataset.cardAction === 'inc') setQty(c, cur + 1);
      else if (b.dataset.cardAction === 'dec') setQty(c, cur - 1);
    });
    var i = $('.ftdc__qty-input', c);
    if (i) i.addEventListener('change', function () { setQty(c, parseInt(i.value, 10) || 0); });
  });

  function totalQty() { var n = 0; Object.keys(state.selections).forEach(function (k) { n += state.selections[k].qty; }); return n; }
  /* The number of pouches a plan requires, or 0 for "as many as you like".
     Monthly returned 1 here, which is what drove the "1 of 1 selected"
     progress, the exactly-one continue rule, and the trim on plan switch. */
  function bundleSize() { return state.plan === 'quarterly' ? BUNDLE_COUNT : 0; }
  function updateProgress() {
    var n = totalQty(), s = bundleSize(), pt = $('[data-progress-text]'), pf = $('[data-progress-fill]');
    var track = $('[data-progress-track]');
    if (pt && pf) {
      if (s) { pt.textContent = n + ' of ' + s + ' selected'; pf.style.width = Math.min(100, n / s * 100) + '%'; }
      else   { pt.textContent = n ? (n + (n === 1 ? ' pouch' : ' pouches') + ' selected') : 'Choose your pouches'; pf.style.width = '0%'; }
    }
    /* A one-time order has no fixed size, so there is nothing to fill toward.
       The bar used to jump to 100% on the first pouch and sit there, reading
       "complete" at every quantity — hide it rather than lie. */
    if (track) track.hidden = !s;
  }
  function compute() {
    var mu = (C.MONTHLY_PCT / 100);
    var qu = (C.QUARTERLY_PCT / 100);
    var mul = state.plan === 'monthly' ? mu : state.plan === 'quarterly' ? qu : 1;
    var t = 0, sa = 0;
    Object.keys(state.selections).forEach(function (k) {
      var s = state.selections[k]; var u = s.price * mul; t += u * s.qty;
      var c = s.compareAt > s.price ? s.compareAt : s.price;
      sa += Math.max(0, c - u) * s.qty;
    });
    /* Add-ons are part of what the customer pays, so they are part of the
       total. Before this they were listed with a price and then left out of
       the sum, so the order read "$12.00" on one line and a total that did not
       include it two lines below. */
    activeAddons().forEach(function (a) { t += a.cents; sa += a.savedCents || 0; });
    return { total: Math.round(t), saved: Math.round(sa) };
  }
  /* An add-to-cart round trip is in flight. updateBar() runs during that
     window (the cart repaint calls it), so without this it would hand the
     button back mid-flight and let the customer fire a second one. */
  var busy = false;



  function updateBar() {
    var t = compute(), bt = $('[data-bar-total]'), sw = $('[data-bar-saved-wrap]'), sv = $('[data-bar-saved]');
    if (bt) bt.textContent = fmtMoney(t.total);
    if (sw && sv) { if (t.saved > 0) { sw.hidden = false; sv.textContent = fmtMoney(t.saved); } else sw.hidden = true; }
    var lab = $('[data-bar-label]'), r = canProc();
    /* With no Review step, Bundle is the last one, so it carries the final label. */
    var labKey = (SKIP_REVIEW && state.step === 'products') ? 'review' : state.step;
    if (lab) lab.textContent = BAR_LABELS[labKey] || BAR_LABELS[state.step] || BAR_LABELS.plans;
    setAdvanceDisabled(busy || (state.step === 'plans' ? false : !r));
    /* The aside's Add-to-Cart stayed live on every step, so an empty or
       half-filled bundle could be pushed straight into the cart. Gate it on
       the same rule the advance button already used. */
    var ready = r && (totalQty() > 0 || (state.plan === 'onetime' && creatineQty() > 0));
    $$('[data-action="checkout"]').forEach(function (b) { b.disabled = busy || !ready; });
    /* Name the plan above "Your Bundle": on the Bundle step the plan cards
       are off screen, so this is the only place that says which one is
       running. */
    var planBadge = $('[data-bundle-plan]');
    if (planBadge) planBadge.textContent = PLAN_NAMES[state.plan] || '';

    /* Repaint the order on every change. This is now the only thing that
       reflects a click back at the customer — the summary IS the build until
       Add to Cart is pressed — so it has to be immediate. It once waited on a
       cart round trip to repaint, which on a slow store meant seconds of
       looking at an order that was not yours. */
    if (LIVE_SUMMARY) renderReview();
    /* Quarterly + Bundle step: warn when not all 3 slots are filled. */
    var w = $('[data-bar-warning]');
    if (w) {
      if (state.step === 'products' && state.plan === 'quarterly') {
        var rem = BUNDLE_COUNT - totalQty();
        if (rem > 0) {
          w.textContent = 'Add ' + rem + ' more selection' + (rem === 1 ? '' : 's') + ' to continue';
          w.hidden = false;
        } else { w.hidden = true; }
      } else { w.hidden = true; }
    }
  }
  function canProc() {
    if (state.step === 'plans') return !!state.plan;
    if (state.step === 'products') {
      var n = totalQty(), s = bundleSize();
      /* One-time may be creatine and nothing else. */
      if (!s && state.plan === 'onetime') return n > 0 || creatineQty() > 0;
      return s ? n === s : n > 0;
    }
    return true;
  }

  function renderReview() {
    var planEl = $('[data-review-plan]');
    if (planEl) planEl.textContent = PLAN_NAMES[state.plan] || state.plan;
    var lines = $('[data-review-lines]');
    if (lines) {
      lines.innerHTML = '';
      var mul = state.plan === 'monthly'   ? (C.MONTHLY_PCT / 100)
              : state.plan === 'quarterly' ? (C.QUARTERLY_PCT / 100)
              : 1;
      Object.keys(state.selections).forEach(function (k) {
        var s = state.selections[k];
        var name = s.fnLabel || 'Item';
        if (s.flavorName) name += ' — ' + s.flavorName;
        var lineTotal = Math.round(s.price * mul) * s.qty;
        var card = root.querySelector('.ftdc__card[data-variant-id="' + s.variantId + '"]');
        var img  = card ? card.querySelector('img') : null;
        var imgSrc = img ? (img.currentSrc || img.getAttribute('src') || '') : '';
        var li = document.createElement('li');
        li.className = 'ftdc__review-line';
        var thumb = document.createElement('span'); thumb.className = 'ftdc__review-line-thumb';
        if (imgSrc) { var ti = document.createElement('img'); ti.src = imgSrc; ti.alt = ''; ti.loading = 'lazy'; ti.width = 56; ti.height = 56; thumb.appendChild(ti); }
        var n  = document.createElement('span'); n.className = 'ftdc__review-line-name';  n.textContent  = name;
        var q  = document.createElement('span'); q.className = 'ftdc__review-line-qty';   q.textContent  = '× ' + s.qty;
        var p  = document.createElement('span'); p.className = 'ftdc__review-line-price'; p.textContent  = fmtMoney(lineTotal);
        li.appendChild(thumb); li.appendChild(n); li.appendChild(q); li.appendChild(p);
        lines.appendChild(li);
      });
    }
    var extra = $('[data-review-extra]');
    if (extra) {
      extra.innerHTML = '';
      var extras = activeAddons();
      if (extras.length) {
        extra.hidden = false;
        extras.forEach(function (e) {
          var row = document.createElement('div'); row.className = 'ftdc__review-line ftdc__review-line--extra';
          var thumb = document.createElement('span'); thumb.className = 'ftdc__review-line-thumb';
          if (e.imgSrc) { var ti = document.createElement('img'); ti.src = e.imgSrc; ti.alt = ''; ti.loading = 'lazy'; ti.width = 56; ti.height = 56; thumb.appendChild(ti); }
          var n = document.createElement('span'); n.className = 'ftdc__review-line-name'; n.textContent = e.name + (e.note ? ' — ' + e.note : '');
          var p = document.createElement('span'); p.className = 'ftdc__review-line-price' + (e.free ? ' ftdc__review-line-price--free' : ''); p.textContent = e.priceText;
          row.appendChild(thumb); row.appendChild(n);
          /* Match the pouch lines, which carry their own multiplier. */
          if (e.qty > 1) {
            var q = document.createElement('span'); q.className = 'ftdc__review-line-qty'; q.textContent = '\u00d7 ' + e.qty;
            row.appendChild(q);
            row.classList.add('ftdc__review-line--extra-qty');
          }
          row.appendChild(p);
          extra.appendChild(row);
        });
      } else {
        extra.hidden = true;
      }
    }
    var t = compute();
    var rt = $('[data-review-total]');
    var sv = $('[data-review-saved]');
    var sw = $('[data-review-saved-wrap]');
    if (rt) rt.textContent = fmtMoney(t.total);
    if (sv && sw) {
      if (t.saved > 0) { sw.hidden = false; sv.textContent = '\u2212' + fmtMoney(t.saved); }
      else sw.hidden = true;
    }
    /* Original (pre-savings) price row — only shown when there are savings. */
    var ov = $('[data-review-original]'), ow = $('[data-review-original-wrap]');
    if (ov && ow) {
      if (t.saved > 0) { ow.hidden = false; ov.textContent = fmtMoney(t.total + t.saved); }
      else ow.hidden = true;
    }
  }

  $$('[data-step-back]').forEach(function (b) { b.addEventListener('click', function () { showStep(b.dataset.stepBack); }); });
  var actBtns = $$('[data-action="next"]');
  var actBtn = actBtns[0] || null;
  function setAdvanceDisabled(v) { actBtns.forEach(function (b) { b.disabled = v; }); }
  actBtns.forEach(function (btn0) { btn0.addEventListener('click', function () {
    if (state.step === 'plans') showStep('products');
    else if (state.step === 'products') { if (canProc()) { if (SKIP_REVIEW) doCheckout(); else showStep('review'); } }
    else doCheckout();
  }); });
  $$('[data-action="review"]').forEach(function (b) { b.addEventListener('click', function () { if (canProc()) showStep('review'); }); });
  $$('[data-action="checkout"]').forEach(function (b) { b.addEventListener('click', doCheckout); });

  /* Pills: clicking a step pill jumps to that step (any direction). */
  $$('.ftdc__step-pill').forEach(function (p) {
    p.style.cursor = 'pointer';
    p.addEventListener('click', function () { var t = p.dataset.stepPill; if (t) showStep(t); });
    p.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); var t = p.dataset.stepPill; if (t) showStep(t); }
    });
  });

  function buildItems() {
    var items = [];
    Object.keys(state.selections).forEach(function (k) {
      var s = state.selections[k]; var it = { id: parseInt(s.variantId, 10), quantity: s.qty };
      if (state.plan === 'monthly') { var p = parseInt(s.planMonthly, 10); if (p) it.selling_plan = p; }
      else if (state.plan === 'quarterly') {
        var p = parseInt(s.planQuarterly, 10); if (p) it.selling_plan = p;
        /* Marked for Loop bundle grouping; stripped before /cart/add.js. */
        it._bundleable = true;
      }
      items.push(it);
    });
    /* Mirrors desiredItems(): a separate gift line and bought line. */
    var card2 = $('[data-creatine-card]');
    if (card2 && (Object.keys(state.selections).length > 0 || state.plan === 'onetime')) {
      var cv2 = parseInt(card2.dataset.variant, 10);
      if (cv2) {
        if (giftQualifies()) {
          items.push({ id: cv2, quantity: 1, properties: { _upsell: 'creatine-first-order-free' } });
        }
        var bought2 = creatineQty();
        if (bought2 > 0) {
          var bi2 = { id: cv2, quantity: bought2 };
          if (state.plan === 'monthly') {
            var pm3 = parseInt(card2.dataset.planMonthly, 10);
            if (pm3) bi2.selling_plan = pm3;
          } else if (state.plan === 'onetime') {
            bi2.properties = { _upsell: 'creatine-onetime' };
          }
          items.push(bi2);
        }
      }
    }
    var cr2b = $('[data-creatine2-input]');
    var cardb = $('[data-creatine-card]');
    if (state.plan === 'quarterly' && cr2b && cr2b.checked && cardb && Object.keys(state.selections).length > 0) {
      var v2b = parseInt(cardb.dataset.variant, 10);
      var row2b = $('[data-upsell-creatine2]');
      var p50b = row2b ? parseInt(row2b.getAttribute('data-plan-quarterly-50off'), 10) : 0;
      if (v2b && p50b) items.push({ id: v2b, quantity: 1, selling_plan: p50b });
    }
    return items;
  }

  /* Loop's bundle.loopwork.co returns { message, data: { loopBundleGuid } } */
  function extractBundleTxnId(b) {
    var pools = [b, b && b.data, b && b.transaction, b && b.data && b.data.transaction];
    for (var i = 0; i < pools.length; i++) {
      var p = pools[i]; if (!p || typeof p !== 'object') continue;
      var v = (p.data && (p.data.loopBundleGuid || p.data.txnId || p.data.id))
            || p.loopBundleGuid || p.txnId || p.transactionId || p.id;
      if (v) return v;
    }
    return null;
  }
  function loopBundleItems(items) {
    var picks = items.filter(function (it) { return it._bundleable; });
    var rest  = items.filter(function (it) { return !it._bundleable; });
    if (!picks.length) return Promise.resolve(items);
    var body = {
      bundleId:         parseInt(LOOP_BUNDLE.bundleId, 10),
      bundleVariantId:  parseInt(LOOP_BUNDLE.bundleVariantId, 10)  || null,
      bundleDiscountId: parseInt(LOOP_BUNDLE.bundleDiscountId, 10) || null,
      sellingPlanId:    parseInt(LOOP_BUNDLE.apiSellingPlanId, 10)
    };
    return fetch('https://bundle.loopwork.co/api/transactions/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) throw new Error('Loop bundle API ' + r.status + ': ' + ((b && (b.message || b.error)) || ''));
        return b;
      }); })
      .then(function (b) {
        var txn = extractBundleTxnId(b);
        if (!txn) throw new Error('Loop response missing transaction id');
        var cartPlanId = parseInt(LOOP_BUNDLE.cartSellingPlanId, 10);
        var key = LOOP_BUNDLE.propKey || '_bundleId';
        picks.forEach(function (it) {
          it.properties = it.properties || {};
          it.properties[key] = String(txn);
          if (LOOP_BUNDLE.bundleName) it.properties.bundleName = LOOP_BUNDLE.bundleName;
          if (cartPlanId) it.selling_plan = cartPlanId;
        });
        return picks.concat(rest);
      });
  }

  /* Open the theme's cart drawer. Markup nests it as
     <theme-drawer> > <dialog> > <cart-drawer-component>, so the drawer is the
     ancestor of the component, not the other way round. Returns false when the
     theme has no drawer (cart_type is 'page'), so the caller can fall back. */
  function openCartDrawer() {
    var host = document.querySelector('cart-drawer-component');
    var drawer = host && host.closest ? host.closest('theme-drawer') : null;
    if (!drawer || typeof drawer.open !== 'function') return false;
    try { if (!drawer.isOpen) drawer.open(); } catch (_) { return false; }
    return true;
  }

  /* One-time discounts normally ride along on the /discount/<code> redirect to
     checkout. Staying on the page means nothing ever visits that URL, so fetch
     it instead — that still sets the discount on the session. Best effort: a
     failure here must not cost the customer their add. */
  function applyDiscountInPlace(code) {
    if (!code) return Promise.resolve();
    return fetch('/discount/' + encodeURIComponent(code) + '?redirect=/cart.js', {
      credentials: 'same-origin'
    }).catch(function () {});
  }

  /* A browser alert carrying "returned 429 (not JSON)" tells the customer
     nothing they can act on, and blocks the page until they dismiss it. Say
     what happened next to the button they pressed, and only fall back to the
     modal if the section has no place to put the message. */
  function showCartError(e) {
    var raw = (e && e.message) || '';
    var msg = raw === 'THROTTLED' || /\b429\b/.test(raw)
      ? 'The store is busy right now — give it a few seconds and try again.'
      : (raw || 'Something went wrong. Please try again.');
    var box = $('[data-cart-error]');
    if (!box) { alert(msg); return; }
    box.textContent = msg;
    box.hidden = false;
    if (cartErrorTimer) clearTimeout(cartErrorTimer);
    cartErrorTimer = setTimeout(function () { box.hidden = true; }, 8000);
    try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
  }
  var cartErrorTimer = null;

  function doCheckout() {
    if (!canProc()) return;
    if (!totalQty() && !(state.plan === 'onetime' && creatineQty() > 0)) return;
    busy = true;
    setAdvanceDisabled(true); $$('[data-action="checkout"]').forEach(function (b) { b.disabled = true; });
    var dcard = $('[data-creatine-card]');
    var ot = state.plan === 'onetime' && creatineQty() > 0;
    var d = (ot && dcard) ? (dcard.dataset.discountOnetime || '') : '';
    /* The build has not been near the cart until now. Put it in, group the
       quarterly lines into their Loop bundle, then hand it over. */
    commitToCart().then(patchLoopBundle).then(getCart).then(function (cart) {
      var ok = (cart.items || []).some(function (l) { return (l.properties || {})[CART_SEL] === CART_OWNER; });
      if (!ok) throw new Error('Could not add your selections to the cart.');

      if (CTA_ADDS_TO_CART) {
        return applyDiscountInPlace(d).then(function () {
          busy = false;
          /* Clear the builder now that the cart owns this order. Leaving it
             filled invites a second press that silently doubles the order,
             and an empty builder is what makes a second DIFFERENT order
             possible — pick one-time, add it, switch to monthly, build again.
             Both end up in the same cart, because a commit only ever adds. */
          clearDraft();
          /* Announce it as an 'add' — that is what makes the theme repaint the
             drawer with the finished bundle AND open it. openCartDrawer() is
             the backstop for a store with the auto-open setting switched off;
             it no-ops when the announcement already opened the drawer, and
             reports false only when this theme has no drawer at all. */
          return announceCartUpdate(cart, 'add').then(function () {
            if (!openCartDrawer()) window.location.href = '/cart';
          });
        });
      }

      /* Deliberately no history.pushState('/cart') here. Pushing a fake cart
         entry made Back from checkout restore THIS page under the /cart URL,
         so the real cart page became unreachable and customers saw the
         builder's review step instead of their cart. Let the browser keep
         the true history and let /cart be the cart. */
      window.location.href = d ? ('/discount/' + encodeURIComponent(d) + '?redirect=/checkout') : '/checkout';
    }).catch(function (e) {
      busy = false; updateBar();
      showCartError(e);
    });
  }

  /* Empty the builder back to a fresh order form, keeping the plan the
     customer is on so building a second one of the same kind is one click.
     Only ever called after the cart has taken the previous build. */
  function clearDraft() {
    state.selections = {};
    addonQty = 0;
    var c1 = $('[data-creatine-input]'); if (c1) c1.checked = false;
    var c2 = $('[data-creatine2-input]'); if (c2) c2.checked = false;
    $$('.ftdc__card').forEach(reset);
    upsellAutoScrolled = false;
    updateProgress(); updateCreatineIncluded(); updateBar();
    if (LIVE_SUMMARY) renderReview();
  }

  var crAdd = $('[data-creatine-add]');
  if (crAdd) crAdd.addEventListener('click', function () { setAddonQty(1); });
  var crToggle = $('[data-creatine-input]');
  if (crToggle) crToggle.addEventListener('change', function () {
    updateBar();
  });
  var cr2Toggle = $('[data-creatine2-input]');
  if (cr2Toggle) cr2Toggle.addEventListener('change', function () {
    updateBar();
  });
  $$('[data-creatine-qty-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setAddonQty(creatineQty() + (btn.dataset.creatineQtyAction === 'inc' ? 1 : -1));
    });
  });
  var crQtyInput = $('[data-creatine-qty-input]');
  if (crQtyInput) crQtyInput.addEventListener('change', function () { setAddonQty(parseInt(crQtyInput.value, 10)); });

  showStep('plans', {scroll: false}); updateProgress(); updateBar();
  if (LIVE_SUMMARY) renderReview();   /* paint the aside before the first interaction */

  var api = buildApi(C, root, {
    sweepUnearnedGift: sweepUnearnedGift, showStep: showStep, totalQty: totalQty,
    updateBar: updateBar, updateProgress: updateProgress,
    updateCreatineIncluded: updateCreatineIncluded
  });
  if (surface && typeof surface.init === 'function') surface.init(api);

  /* The builder starts empty on every load — it is an order form, not a
     picture of the cart. The one thing it does read the cart for is a free
     creatine whose bundle has since been deleted. */
  sweepUnearnedGift();

  /* A flag used to be stashed here so a return-from-checkout visit could
     land on Review with the build restored from the cart. Nothing restores a
     build any more, so clear any left over from before this shipped. */
  try { sessionStorage.removeItem(RETURN_FLAG_KEY); } catch (_) {}
  }

  /* Everything a surface is allowed to reach. Keep this list small: anything
     added here is API that the shims can depend on. */
  function buildApi(C, root, fns) {
    return {
      C: C, SID: C.SID, root: root,
      sweepUnearnedGift: fns.sweepUnearnedGift,
      showStep: fns.showStep,
      totalQty: fns.totalQty,
      updateBar: fns.updateBar,
      updateProgress: fns.updateProgress,
      updateCreatineIncluded: fns.updateCreatineIncluded
    };
  }

  window.__ftdGoldRun = run;

  /* A shim may have been parsed before this file. Flush whatever it queued,
     then make later pushes run straight away. */
  var pending = window.__ftdGoldCorePending || [];
  window.__ftdGoldCorePending = { push: function (f) { try { f(); } catch (e) { console.error('ftd-selector-gold-core.js', e); } } };
  for (var i = 0; i < pending.length; i++) window.__ftdGoldCorePending.push(pending[i]);
})();
