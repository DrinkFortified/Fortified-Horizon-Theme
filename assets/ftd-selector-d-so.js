/* ftd-selector-d-so.js - runtime extracted from the inline <script> so the browser
   can cache it. All merchant-editable values arrive via the config queue
   (window.__ftdDSOQueue) pushed by the section/block's inline script. */
(function () {
  function run(C) {
  var SID = C.SID;
  var root = document.getElementById('ftdc-' + SID);
  if (!root) return;
  var BUNDLE_COUNT = parseInt(C.BUNDLE_COUNT, 10) || 3;
  var STEPS_ORDER = ['plans', 'products', 'review'];
  var STORAGE_KEY = 'ftdcWizardState_v1';
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

  /* ============================================================
     CART-AS-STATE LAYER (Product Selector D)
     Mirrors the build into the real Shopify cart so it survives refresh
     and stays in sync sitewide. Only touches lines we created (property
     _sel === SID). Loop bundle grouping is applied at checkout (Option A).
     ============================================================ */
  var CART_SEL = '_sel';
  var CART_OWNER = 'ftdc-d'; /* shared by every Product Selector D surface so the section + slide-over read/write the same cart lines (real sitewide sync) */
  var cartTotals = null;     /* {total, saved} from our real cart lines, or null */
  var hydrating = false;     /* suppress writes while painting UI from cart */
  var syncing = false;
  var syncAgain = false;
  var syncTimer = null;

  function getCart() { return fetch('/cart.js', { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); }); }

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
    var cr = $('[data-creatine-input]');
    /* Creatine is an add-on to a hydration order — never send it alone.
       Requires at least one pouch selected in Step 2, regardless of plan. */
    if (cr && cr.checked && Object.keys(state.selections).length > 0) {
      var cv = parseInt(cr.dataset.variant, 10);
      if (cv) {
        var cp = {}; cp[CART_SEL] = CART_OWNER; cp._role = 'creatine';
        var ci = { id: cv, quantity: 1, properties: cp };
        if (state.plan === 'monthly') { var p1 = parseInt(cr.dataset.planMonthly, 10); if (p1) ci.selling_plan = p1; }
        else if (state.plan === 'quarterly') { var p2 = parseInt(cr.dataset.planQuarterlyFree, 10); if (p2) ci.selling_plan = p2; }
        else { cp._upsell = 'creatine-onetime'; }
        items.push(ci);
      }
    }
    return items;
  }

  /* Make the cart match the build: drop our lines, add the desired set. */
  function reconcileCart() {
    if (syncing) { syncAgain = true; return Promise.resolve(); }
    syncing = true;
    var desired = desiredItems();
    return getCart().then(function (cart) {
      var updates = {};
      (cart.items || []).forEach(function (l) { if ((l.properties || {})[CART_SEL] === CART_OWNER) updates[l.key] = 0; });
      var clear = Object.keys(updates).length
        ? fetch('/cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ updates: updates }) }).then(function (r) { return r.json(); })
        : Promise.resolve(cart);
      return clear.then(function () {
        if (!desired.length) return getCart();
        return fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ items: desired }) })
          .then(function (r) { if (!r.ok) return r.json().then(function (b) { throw new Error((b && (b.description || b.message)) || 'Cart error'); }); return r.json(); })
          .then(function () { return getCart(); });
      });
    }).then(function (cart) {
      paintTotalsFromCart(cart); notifyCartChanged();
      syncing = false; if (syncAgain) { syncAgain = false; return reconcileCart(); }
    }).catch(function (e) { syncing = false; try { console.error('[FTDC-D] reconcile', e); } catch (_) {} });
  }
  function scheduleSync() {
    if (hydrating) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncTimer = null; reconcileCart(); }, 450);
  }

  /* Real totals for our lines -> cartTotals (consumed by updateBar/renderReview). */
  function paintTotalsFromCart(cart) {
    if (!cart || !cart.items) return;
    var total = 0, saved = 0, has = false;
    cart.items.forEach(function (l) {
      if ((l.properties || {})[CART_SEL] !== CART_OWNER) return;
      has = true; total += l.final_line_price;
      var orig = (l.original_line_price != null ? l.original_line_price : l.line_price);
      saved += Math.max(0, orig - l.final_line_price);
    });
    cartTotals = has ? { total: total, saved: saved } : null;
    updateBar();
    if (state.step === 'review') renderReview();
  }
  function planFromSellingId(spId) {
    if (!spId) return 'onetime';
    spId = String(spId);
    if (LOOP_BUNDLE.cartSellingPlanId && String(LOOP_BUNDLE.cartSellingPlanId) === spId) return 'quarterly';
    var cards = $$('.ftdc__card');
    for (var i = 0; i < cards.length; i++) {
      if (String(cards[i].dataset.planQuarterly) === spId) return 'quarterly';
      if (String(cards[i].dataset.planMonthly) === spId) return 'monthly';
    }
    return state.plan;
  }
  /* Apply a card qty WITHOUT writing to the cart (hydration only). */
  function applyQty(c, n) {
    var v = c.dataset.variantId, a = $('.ftdc__add', c), q = $('.ftdc__qty', c), i = $('.ftdc__qty-input', c);
    state.selections[v] = { qty: n, variantId: v, fnId: c.dataset.fnId, fnLabel: c.dataset.fnLabel, flavorName: c.dataset.flavorName, planMonthly: c.dataset.planMonthly || '', planQuarterly: c.dataset.planQuarterly || '', price: parseInt(c.dataset.variantPrice, 10) || 0, compareAt: parseInt(c.dataset.variantCompare, 10) || 0 };
    c.classList.add('is-selected');
    if (a) a.hidden = true; if (q) q.hidden = false; if (i) i.value = n;
  }
  /* Rebuild the builder UI from the real cart (load + external changes). */
  function hydrateFromCart() {
    return getCart().then(function (cart) {
      var ours = (cart.items || []).filter(function (l) { return (l.properties || {})[CART_SEL] === CART_OWNER; });
      if (!ours.length) { cartTotals = null; updateBar(); return; }
      hydrating = true;
      var pouch = ours.filter(function (l) { return (l.properties || {})._role === 'pouch'; });
      if (pouch.length) {
        var sa = pouch[0].selling_plan_allocation;
        var spId = sa && sa.selling_plan && sa.selling_plan.id;
        var guess = planFromSellingId(spId);
        var radio = $('input[name="ftdc-plan-' + SID + '"][value="' + guess + '"]');
        if (radio) { radio.checked = true; state.plan = guess; $$('.ftdc__plan').forEach(function (p) { p.classList.remove('is-active'); }); var l = radio.closest('.ftdc__plan'); if (l) l.classList.add('is-active'); }
      }
      state.selections = {};
      $$('.ftdc__card').forEach(reset);
      pouch.forEach(function (l) { var card = root.querySelector('.ftdc__card[data-variant-id="' + l.variant_id + '"]'); if (card) applyQty(card, l.quantity); });
      var cr = $('[data-creatine-input]');
      var hadCreatine = ours.some(function (l) { return (l.properties || {})._role === 'creatine'; });
      if (cr) cr.checked = hadCreatine;
      hydrating = false;
      updateProgress(); updateCreatineIncluded(); paintTotalsFromCart(cart);
      /* Existing quarterly cart from before free creatine was auto-included
         — reconcile once so the promised free item actually lands in cart. */
      if (state.plan === 'quarterly' && !hadCreatine && cr && cr.checked) scheduleSync();
    }).catch(function (e) { hydrating = false; try { console.error('[FTDC-D] hydrate', e); } catch (_) {} });
  }
  /* Loop bundle (Option A): mint a transaction, then stamp _bundleId +
     selling plan onto our quarterly pouch lines already in the cart. */
  function patchLoopBundle() {
    if (!(LOOP_BUNDLE_ON && state.plan === 'quarterly')) return Promise.resolve();
    return getCart().then(function (cart) {
      var pouches = (cart.items || []).filter(function (l) { var p = l.properties || {}; return p[CART_SEL] === CART_OWNER && p._role === 'pouch'; });
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
              var payload = { id: l.key, properties: props }; if (cartPlanId) payload.selling_plan = cartPlanId;
              return fetch('/cart/change.js', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) }).then(function (r) { return r.json(); });
            });
          }, Promise.resolve());
        });
    }).catch(function (e) { try { console.warn('[FTDC-D] Loop bundle patch failed, proceeding without grouping:', e); } catch (_) {} });
  }
  function notifyCartChanged() {
    try { document.dispatchEvent(new CustomEvent('ftdc:cart-changed', { detail: { from: SID } })); } catch (_) {}
    try { document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true })); } catch (_) {}
  }
  document.addEventListener('ftdc:cart-changed', function (e) { if (e && e.detail && e.detail.from === SID) return; hydrateFromCart(); });

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
    if (bullets) bullets.hidden = moved.bullet === 0;
    if (announce) announce.hidden = moved.ann === 0;
    var gridEmpty = $('[data-grid-empty]');
    if (gridEmpty) gridEmpty.hidden = (moved.fn > 0);
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
    var idx = STEPS_ORDER.indexOf(name);
    $$('.ftdc__step').forEach(function (s) { var m = s.dataset.step === name; s.hidden = !m; s.classList.toggle('is-active', m); });
    $$('.ftdc__step-pill').forEach(function (p) { var pi = STEPS_ORDER.indexOf(p.dataset.stepPill); p.classList.toggle('is-active', pi === idx); p.classList.toggle('is-done', pi < idx); });
    if (name === 'review') renderReview();
    updateBar();
    if (shouldScroll) {
      setTimeout(function () {
        try {
          /* In the slide-over, the panel scrolls internally — bring its
             top into view. In the inline section, scroll the page to
             the wizard root instead. */
          var panel = root.closest && root.closest('.ftdc-slideover__panel');
          if (panel) { panel.scrollTo({top: 0, behavior: 'smooth'}); }
          else { root.scrollIntoView({behavior: 'smooth', block: 'start'}); }
        } catch (_) {}
      }, 40);
    }
  }

  /* Quarterly bundles include creatine free — force the toggle on and hide
     the manual "Add Creatine" row (it would otherwise contradict the
     "Included — FREE" banner and require a redundant manual step). Any
     other plan restores the manual, priced toggle. */
  function updateCreatineIncluded() {
    var el = $('[data-creatine-included]');
    var isQuarterly = state.plan === 'quarterly';
    if (el) el.hidden = !isQuarterly;
    var crRow = $('[data-upsell-creatine]');
    if (crRow) crRow.hidden = isQuarterly;
    /* Only ever FORCE the checkbox on for quarterly. Never force it off here
       — this runs after hydrateFromCart too, and a monthly/one-time
       customer who genuinely paid for the add-on would otherwise get it
       silently unchecked (and removed from cart on the next sync). */
    var cr = $('[data-creatine-input]');
    if (cr && isQuarterly) cr.checked = true;
  }

  var upsellAutoScrolled = false;

  $$('input[name="ftdc-plan-' + SID + '"]').forEach(function (r) {
    r.addEventListener('change', function () {
      state.plan = r.value;
      $$('.ftdc__plan').forEach(function (p) { p.classList.remove('is-active'); });
      var l = r.closest('.ftdc__plan'); if (l) l.classList.add('is-active');
      state.selections = {};
      $$('.ftdc__card').forEach(reset);
      upsellAutoScrolled = false;
      /* Reset the add-on choice on every plan switch (selections above also
         reset) — updateCreatineIncluded() will re-force it on if the new
         plan is quarterly; other plans start unchecked until manually set. */
      var cr0 = $('[data-creatine-input]');
      if (cr0) cr0.checked = false;
      updateBar(); updateProgress(); updateCreatineIncluded(); scheduleSync();
      /* Mobile: auto-advance to the Bundle step so the customer doesn't
         have to scroll back up and tap Continue. Brief delay so they see
         the plan card register the selection. Desktop keeps the manual
         Continue flow to avoid a jumpy experience. */
      if (window.matchMedia && window.matchMedia('(max-width: 749px)').matches) {
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
  function setQty(c, n) {
    n = Math.max(0, Math.floor(n));
    if (state.plan === 'quarterly') {
      var others = totalQty() - (state.selections[c.dataset.variantId] ? state.selections[c.dataset.variantId].qty : 0);
      n = Math.min(n, Math.max(0, BUNDLE_COUNT - others));
    }
    var v = c.dataset.variantId, a = $('.ftdc__add', c), q = $('.ftdc__qty', c), i = $('.ftdc__qty-input', c);
    if (n === 0) {
      delete state.selections[v]; c.classList.remove('is-selected');
      if (a) a.hidden = false; if (q) q.hidden = true; if (i) i.value = 0;
    } else {
      state.selections[v] = { qty: n, variantId: v, fnId: c.dataset.fnId, fnLabel: c.dataset.fnLabel, flavorName: c.dataset.flavorName, planMonthly: c.dataset.planMonthly || '', planQuarterly: c.dataset.planQuarterly || '', price: parseInt(c.dataset.variantPrice, 10) || 0, compareAt: parseInt(c.dataset.variantCompare, 10) || 0 };
      c.classList.add('is-selected');
      if (a) a.hidden = true; if (q) q.hidden = false; if (i) i.value = n;
    }
    updateProgress(); updateBar(); scheduleSync();
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
  function bundleSize() { return state.plan === 'quarterly' ? BUNDLE_COUNT : 0; }
  function updateProgress() {
    var n = totalQty(), s = bundleSize(), pt = $('[data-progress-text]'), pf = $('[data-progress-fill]');
    if (!pt || !pf) return;
    if (s) { pt.textContent = n + ' of ' + s + ' selected'; pf.style.width = Math.min(100, n / s * 100) + '%'; }
    else   { pt.textContent = n ? (n + ' selected') : 'Choose your pouches'; pf.style.width = n > 0 ? '100%' : '0%'; }
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
    return { total: Math.round(t), saved: Math.round(sa) };
  }
  function updateBar() {
    var t = (cartTotals || compute()), bt = $('[data-bar-total]'), sw = $('[data-bar-saved-wrap]'), sv = $('[data-bar-saved]');
    if (bt) bt.textContent = fmtMoney(t.total);
    if (sw && sv) { if (t.saved > 0) { sw.hidden = false; sv.textContent = fmtMoney(t.saved); } else sw.hidden = true; }
    var lab = $('[data-bar-label]'), btn = $('.ftdc__bar-action'), r = canProc();
    if (lab) lab.textContent = BAR_LABELS[state.step] || BAR_LABELS.plans;
    if (btn) btn.disabled = state.step === 'plans' ? false : !r;
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
    if (state.step === 'products') { var n = totalQty(), s = bundleSize(); return s ? n === s : n > 0; }
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
        var nameSpan = document.createElement('span'); nameSpan.className = 'ftdc__review-line-name'; nameSpan.textContent = name;
        var qtySpan  = document.createElement('span'); qtySpan.className  = 'ftdc__review-line-qty';  qtySpan.textContent  = '× ' + s.qty;
        var priceSpan= document.createElement('span'); priceSpan.className= 'ftdc__review-line-price';priceSpan.textContent= fmtMoney(lineTotal);
        li.appendChild(thumb); li.appendChild(nameSpan); li.appendChild(qtySpan); li.appendChild(priceSpan);
        lines.appendChild(li);
      });
    }

    var extra = $('[data-review-extra]');
    if (extra) {
      extra.innerHTML = '';
      var extras = [];
      var creatineUpsellImg = (function () {
        var crEl = $('[data-upsell-creatine] .ftdc__upsell-media img') || $('[data-creatine-included] .ftdc__upsell-media img');
        return crEl ? (crEl.currentSrc || crEl.getAttribute('src') || '') : '';
      })();
      var hasSelections = Object.keys(state.selections).length > 0;
      if (state.plan === 'quarterly' && hasSelections) {
        extras.push({ name: 'Creatine', note: 'Included free with your bundle', price: 'FREE', free: true, imgSrc: creatineUpsellImg });
      }
      var cr = $('[data-creatine-input]');
      if (cr && cr.checked && hasSelections) {
        var priceText = '';
        var priceNode = $('[data-creatine-price]');
        if (priceNode) priceText = priceNode.textContent.trim();
        var titleNode = $('[data-creatine-title]');
        var titleText = (titleNode ? titleNode.textContent.trim() : 'Creatine add-on');
        extras.push({ name: titleText, note: '', price: priceText, free: false, imgSrc: creatineUpsellImg });
      }
      if (extras.length) {
        extra.hidden = false;
        extras.forEach(function (e) {
          var row = document.createElement('div'); row.className = 'ftdc__review-line ftdc__review-line--extra';
          var thumb = document.createElement('span'); thumb.className = 'ftdc__review-line-thumb';
          if (e.imgSrc) { var ti = document.createElement('img'); ti.src = e.imgSrc; ti.alt = ''; ti.loading = 'lazy'; ti.width = 56; ti.height = 56; thumb.appendChild(ti); }
          var n = document.createElement('span'); n.className = 'ftdc__review-line-name'; n.textContent = e.name + (e.note ? ' — ' + e.note : '');
          var p = document.createElement('span'); p.className = 'ftdc__review-line-price' + (e.free ? ' ftdc__review-line-price--free' : ''); p.textContent = e.price;
          row.appendChild(thumb); row.appendChild(n); row.appendChild(p);
          extra.appendChild(row);
        });
      } else {
        extra.hidden = true;
      }
    }

    var t = (cartTotals || compute());
    var rt = $('[data-review-total]');
    var sv = $('[data-review-saved]');
    var sw = $('[data-review-saved-wrap]');
    if (rt) rt.textContent = fmtMoney(t.total);
    if (sv && sw) {
      if (t.saved > 0) { sw.hidden = false; sv.textContent = fmtMoney(t.saved); }
      else sw.hidden = true;
    }
  }

  $$('[data-step-back]').forEach(function (b) { b.addEventListener('click', function () { showStep(b.dataset.stepBack); }); });
  var actBtn = $('.ftdc__bar-action');
  if (actBtn) actBtn.addEventListener('click', function () {
    if (state.step === 'plans') showStep('products');
    else if (state.step === 'products') { if (canProc()) showStep('review'); }
    else doCheckout();
  });
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

  /* Persist + restore wizard state. Used to let the customer come back
     from /checkout via the homepage logo and land on the Review step
     with their selections intact. */
  function persistState() {
    try {
      var cr = $('[data-creatine-input]');
      var data = { plan: state.plan, selections: state.selections, creatineChecked: !!(cr && cr.checked), ts: new Date().getTime() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) {}
  }
  function restoreState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !data.plan) return false;
      /* Expire after 7 days. */
      if (data.ts && (new Date().getTime() - data.ts) > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return false;
      }
      state.plan = data.plan;
      state.selections = data.selections || {};
      var radio = root.querySelector('input[name="ftdc-plan-' + SID + '"][value="' + data.plan + '"]');
      if (radio) {
        $$('.ftdc__plan').forEach(function (p) { p.classList.remove('is-active'); });
        var l = radio.closest('.ftdc__plan'); if (l) l.classList.add('is-active');
        radio.checked = true;
      }
      Object.keys(state.selections).forEach(function (v) {
        var sel = state.selections[v];
        var card = root.querySelector('.ftdc__card[data-variant-id="' + v + '"]');
        if (card) {
          card.classList.add('is-selected');
          var a = card.querySelector('.ftdc__add'), q = card.querySelector('.ftdc__qty'), i = card.querySelector('.ftdc__qty-input');
          if (a) a.hidden = true; if (q) q.hidden = false; if (i) i.value = sel.qty;
        }
      });
      if (data.creatineChecked) {
        var cr2 = $('[data-creatine-input]');
        if (cr2) cr2.checked = true;
      }
      return true;
    } catch (_) { return false; }
  }

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
    var cr = $('[data-creatine-input]');
    /* Creatine is an add-on to a hydration order — never send it alone. */
    if (cr && cr.checked && Object.keys(state.selections).length > 0) {
      var cv = parseInt(cr.dataset.variant, 10);
      if (cv) {
        var ci = { id: cv, quantity: 1 };
        if (state.plan === 'monthly') { var p = parseInt(cr.dataset.planMonthly, 10); if (p) ci.selling_plan = p; }
        else if (state.plan === 'quarterly') { var p = parseInt(cr.dataset.planQuarterlyFree, 10); if (p) ci.selling_plan = p; }
        else { ci.properties = { _upsell: 'creatine-onetime' }; }
        items.push(ci);
      }
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

  function doCheckout() {
    if (!canProc()) return;
    if (!totalQty()) return;
    /* Stash a session flag so a return-from-checkout visit lands on Review. */
    persistState();
    try { sessionStorage.setItem(RETURN_FLAG_KEY, '1'); } catch (_) {}
    if (actBtn) actBtn.disabled = true; $$('[data-action="checkout"]').forEach(function (b) { b.disabled = true; });
    var cr = $('[data-creatine-input]');
    var ot = state.plan === 'onetime' && cr && cr.checked;
    var d = ot ? (cr.dataset.discountOnetime || '') : '';
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    /* Cart already holds the build (cart-as-state): ensure synced, apply the
       Loop bundle grouping to our quarterly lines, then go to checkout. */
    reconcileCart().then(patchLoopBundle).then(getCart).then(function (cart) {
      var ok = (cart.items || []).some(function (l) { return (l.properties || {})[CART_SEL] === CART_OWNER; });
      if (!ok) throw new Error('Could not add your selections to the cart.');
      try { history.pushState({}, '', '/cart'); } catch (_) {}
      window.location.href = d ? ('/discount/' + encodeURIComponent(d) + '?redirect=/checkout') : '/checkout';
    }).catch(function (e) {
      if (actBtn) actBtn.disabled = false; $$('[data-action="checkout"]').forEach(function (b) { b.disabled = false; });
      alert((e && e.message) || 'Something went wrong');
    });
  }

  /* Add-on toggle reconciles the cart. */
  var crToggle = $('[data-creatine-input]');
  if (crToggle) crToggle.addEventListener('change', function () { updateBar(); scheduleSync(); });

  showStep('plans', {scroll: false}); updateProgress(); updateBar();

  /* Cart is the source of truth: hydrate the build from the live cart on
     load (survives refresh) and on bfcache restore. If the customer came
     back from /checkout, re-open the slide-over to the Review step. */
  hydrateFromCart().then(function () {
    try {
      if (sessionStorage.getItem(RETURN_FLAG_KEY) === '1') {
        sessionStorage.removeItem(RETURN_FLAG_KEY);
        if (totalQty() > 0) {
          updateProgress(); updateBar(); updateCreatineIncluded();
          showStep('review');
          setTimeout(function () { try { openDlg(); } catch (_) {} }, 60);
        }
      }
    } catch (_) {}
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) hydrateFromCart(); });
  /* Slide-over open/close. Portal to <body> so no ancestor's
     transform/filter/will-change traps the dialog inside its
     stacking context. */
  var dialog = document.getElementById('ftdc-slideover-' + SID);
  if (!dialog) return;
  if (dialog.parentNode !== document.body) document.body.appendChild(dialog);
  var triggers = document.querySelectorAll('[data-ftdc-slideover-open="' + SID + '"]');
  var closers  = document.querySelectorAll('[data-ftdc-slideover-close="' + SID + '"]');
  var lastFocus = null;
  function openDlg() {
    lastFocus = document.activeElement;
    dialog.classList.add('is-open');
    dialog.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    var close = dialog.querySelector('.ftdc-slideover__close');
    if (close) setTimeout(function () { close.focus(); }, 80);
  }
  function closeDlg() {
    dialog.classList.remove('is-open');
    dialog.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }
  Array.prototype.forEach.call(triggers, function (t) { t.addEventListener('click', openDlg); });
  Array.prototype.forEach.call(closers,  function (c) { c.addEventListener('click', closeDlg); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.classList.contains('is-open')) closeDlg();
  });

  /* Link-based triggers: any <a href="#open-bundle"> on the page opens this
     slide-over. Lets sections that only expose a "button link" field (and no
     blocks / classes) wire up a trigger by setting the link value. */
  var TRIGGER_HREF = C.TRIGGER_HREF;
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
     native cart drawer / cart page. Because the builder is cart-as-state,
     the Review step IS the cart summary. We listen on window in CAPTURE
     phase so we run before Horizon's document-level on:click delegation
     (component.js binds with {capture:true}) and before the
     <a href="/cart"> navigation, then swallow the event. Only active on
     pages where this slide-over is rendered. */
  var CART_CLICK_ON = C.CART_CLICK_ON;
  var CART_CLICK_SEL = C.CART_CLICK_SEL;
  if (CART_CLICK_ON && CART_CLICK_SEL) {
    window.addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('.ftdc-slideover')) return;          /* never hijack clicks inside our own panel */
      if (!e.target.closest(CART_CLICK_SEL)) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      /* Refresh from the live cart, then open to the summary (or the first
         step if the build is empty — an empty summary is pointless). */
      hydrateFromCart().then(function () {
        showStep(totalQty() > 0 ? 'review' : 'plans', { scroll: false });
        openDlg();
      });
    }, true);
  }

  /* /cart redirect landing: theme.liquid bounces the cart page to the
     homepage with ?ftd-cart=1 (e.g. browser back from checkout) - open
     straight to the cart summary, then clean the URL. */
  if (/[?&]ftd-cart=1/.test(window.location.search)) {
    try { history.replaceState({}, '', window.location.pathname + window.location.hash); } catch (_) {}
    hydrateFromCart().then(function () {
      showStep(totalQty() > 0 ? 'review' : 'plans', { scroll: false });
      openDlg();
    });
  }
  }
  window.__ftdDSOMain = function () {
    var q = window.__ftdDSOQueue || [];
    while (q.length) { var c = q.shift(); try { run(c); } catch (e) { console.error('ftd-selector-d-so.js', e); } }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.__ftdDSOMain);
  else window.__ftdDSOMain();
})();
