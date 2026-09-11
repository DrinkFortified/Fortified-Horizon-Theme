/* Cart-wide complimentary creatine, shared by every selector and cart surface.
 *
 * Liquid supplies __ftdCreatineGiftConfig before this deferred script. Only
 * actual Hydration subscription quantities earn a gift; selector ownership,
 * draft quantities and the presence of the Gold runtime do not affect it.
 *
 * Public API:
 *   FtdCreatineGift.config                  the supplied config object
 *   FtdCreatineGift.qualifyingQuantity(cart)
 *   FtdCreatineGift.giftItem()              fresh canonical item, or null if unsafe
 *   await FtdCreatineGift.reconcile()       fresh, reconciled Ajax cart; rejects
 *
 * Writes are serialized and followed by a fresh read. A failed POST is never
 * blindly retried: a lost response may already have added the item. The next
 * explicit retry/event reads the cart first. Convergence limits reset each run.
 *
 * Normal checkout forms and same-origin checkout links wait for reconciliation.
 * Shopify accelerated checkout inside a closed shadow root/iframe, context-menu
 * navigation and direct third-party location/form.submit() calls cannot be
 * intercepted here. They need platform-side eligibility enforcement; this
 * script does not replace accelerated checkout or patch global fetch.
 */
(function () {
  'use strict';
  if (window.FtdCreatineGift) return;

  var config = window.__ftdCreatineGiftConfig || {
    variantId: null, minimum: 3, available: false, price: null, productType: 'Hydration'
  };
  var SOURCE = 'ftd-gift-sweep';
  var CART_EVENT = 'shopify:cart:lines-update';
  var FREE_TAG = 'creatine-first-order-free';
  var QUIET_MS = 80;
  var STEPPER_SETTLE_MS = 400; // component-cart-items debounces for 300 ms.
  var REQUEST_TIMEOUT_MS = 10000;
  var RUN_TIMEOUT_MS = 20000;
  var MAX_PASSES = 24;
  var MAX_WRITES = 12; // Per reconciliation, not per page lifetime.
  var active = null;
  var dirty = false;
  var needsAnnouncement = false;
  var revision = 0;
  var quietUntil = 0;
  var pending = new Set();
  var observedPromises = new WeakSet();
  var pendingError = null;
  var checkoutTask = null;
  var resumingForm = null;
  var resumingLink = null;

  function normalized(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function planId(line) {
    var allocation = line.selling_plan_allocation;
    return allocation && allocation.selling_plan && allocation.selling_plan.id;
  }

  function qualifyingQuantity(cart) {
    return ((cart && cart.items) || []).reduce(function (total, line) {
      var quantity = Number(line.quantity);
      return normalized(line.product_type) === normalized(config.productType || 'Hydration') &&
        planId(line) && Number.isFinite(quantity) && quantity > 0 ? total + quantity : total;
    }, 0);
  }

  function giftItem() {
    if (typeof config.variantId !== 'number' || !Number.isSafeInteger(config.variantId) ||
      config.variantId <= 0 || config.available !== true || config.price !== 0) return null;
    return {
      id: config.variantId,
      quantity: 1,
      properties: { _sel: 'ftdc-d', _role: 'creatine', _upsell: FREE_TAG }
    };
  }

  function unitPrice(line) {
    // A fully discounted paid item is not a directly added zero-price variant.
    var fields = ['original_price', 'price', 'final_price'];
    for (var i = 0; i < fields.length; i++) {
      if (typeof line[fields[i]] === 'number') return line[fields[i]];
    }
    return null;
  }

  function isGift(line) {
    var properties = line.properties || {};
    var paid = ['creatine-buy', 'creatine2', 'creatine-onetime'];
    // Explicit paid intent wins even over a contradictory old gift stamp.
    if (paid.indexOf(properties._role) !== -1 || paid.indexOf(properties._upsell) !== -1) return false;
    if (properties._upsell === FREE_TAG) return true;
    // Untagged subscriptions, including genuine paid legacy add-ons, are not gifts.
    if (planId(line) || line.selling_plan) return false;
    if (properties._sel === 'ftdc-d' && properties._role === 'creatine' && !properties._upsell) return true;
    return config.variantId != null && String(line.variant_id) === String(config.variantId) &&
      unitPrice(line) === 0;
  }

  function isCanonical(line, item) {
    var properties = line.properties || {};
    return String(line.variant_id) === String(item.id) &&
      !line.selling_plan_allocation && !line.selling_plan &&
      Object.keys(properties).length === 3 &&
      properties._sel === item.properties._sel && properties._role === item.properties._role &&
      properties._upsell === FREE_TAG;
  }

  function root() {
    var value = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    return value.replace(/\/?$/, '/');
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function timeoutError() {
    return new Error('Cart updates did not settle. Please retry.');
  }

  function request(path, body) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var options = {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    };
    if (controller) options.signal = controller.signal;
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(timeoutError());
      }, REQUEST_TIMEOUT_MS);
    });
    return Promise.race([
      Promise.resolve().then(function () { return fetch(root() + path, options); }).then(function (response) {
        if (!response.ok) throw new Error('Cart request failed (' + response.status + ').');
        return response.json();
      }).then(function (data) {
        if (!data || data.errors || data.status >= 400) throw new Error('Cart update was not accepted.');
        return data;
      }),
      timeout
    ]).finally(function () { clearTimeout(timer); });
  }

  function showError(error, focus) {
    var box = document.getElementById('ftd-creatine-gift-error');
    if (!box) {
      box = document.createElement('div');
      box.id = 'ftd-creatine-gift-error';
      box.setAttribute('role', 'alert');
      box.setAttribute('aria-live', 'assertive');
      box.setAttribute('aria-atomic', 'true');
      box.setAttribute('tabindex', '-1');
      box.style.cssText = 'padding:1rem;margin:1rem 0;border:1px solid currentColor;';
      var message = document.createElement('p');
      message.textContent = 'We couldn’t verify your cart and complimentary creatine. Please retry before checking out.';
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'button';
      retry.textContent = 'Retry cart update';
      retry.addEventListener('click', backgroundReconcile);
      box.appendChild(message);
      box.appendChild(retry);
    }
    // Keep the message inside an open drawer's focus trap when possible.
    var anchor = document.querySelector('dialog[open] cart-drawer-component .cart__ctas') ||
      document.getElementById('cart-form');
    var parent = anchor && anchor.parentNode || document.body;
    if (parent) parent.insertBefore(box, anchor || parent.firstChild);
    box.hidden = false;
    if (focus && box.focus) box.focus();
    if (window.console && window.console.warn) window.console.warn('[ftd-gift-sweep]', error);
  }

  function clearError() {
    var box = document.getElementById('ftd-creatine-gift-error');
    if (box) box.hidden = true;
  }

  function noteActivity(wait) {
    dirty = true;
    revision++;
    quietUntil = Math.max(quietUntil, Date.now() + wait);
  }

  async function settle(deadline) {
    // Polling here only waits; it never sends cart requests or retries writes.
    while (pending.size || Date.now() < quietUntil) {
      if (Date.now() >= deadline) throw timeoutError();
      await delay(pending.size ? 50 : Math.min(50, Math.max(1, quietUntil - Date.now())));
    }
    if (pendingError) {
      var error = pendingError;
      pendingError = null;
      throw error;
    }
    if (Date.now() >= deadline) throw timeoutError();
  }

  function announce(cart) {
    var resolve;
    var promise = new Promise(function (done) { resolve = done; });
    var event = new Event(CART_EVENT, { bubbles: true, composed: true });
    event.action = 'update'; // Never open the drawer for a background gift change.
    event.context = 'cart';
    event.lines = cart.items.map(function (line) { return { id: line.key, quantity: line.quantity }; });
    event.promise = promise;
    event.ftdcFrom = SOURCE;
    var currency = cart.currency || 'USD';
    function money(cents) { return { amount: ((cents || 0) / 100).toFixed(2), currencyCode: currency }; }
    document.dispatchEvent(event);
    resolve({
      cart: {
        id: cart.token || '',
        totalQuantity: cart.item_count || 0,
        cost: { totalAmount: money(cart.total_price) },
        lines: cart.items.map(function (line) {
          return { id: line.key, quantity: line.quantity, cost: { totalAmount: money(line.final_line_price) } };
        }),
        discountCodes: (cart.cart_level_discount_applications || []).map(function (discount) {
          return { applicable: true, code: discount.title || '' };
        })
      },
      detail: { items: cart.items, itemCount: cart.item_count || 0, source: SOURCE, didError: false }
    });
  }

  async function run() {
    var deadline = Date.now() + RUN_TIMEOUT_MS;
    var writes = 0;
    var priceMismatch = false;
    for (var pass = 0; pass < MAX_PASSES; pass++) {
      await settle(deadline);
      dirty = false;
      var readRevision = revision;
      var cart = await request('cart.js');
      if (!Array.isArray(cart.items)) throw new Error('Cart response is missing its items.');
      // An event received during this read may describe an as-yet-uncommitted write.
      if (dirty || readRevision !== revision || pending.size || Date.now() < quietUntil) continue;

      var gifts = cart.items.filter(isGift);
      var item = giftItem();
      var minimum = Number(config.minimum) > 0 ? Number(config.minimum) : 3;
      // A stale Liquid price must not leave a newly charged "free" item behind.
      priceMismatch = priceMismatch || gifts.some(function (line) {
        return item && String(line.variant_id) === String(item.id) && !planId(line) && unitPrice(line) > 0;
      });
      var eligible = item && !priceMismatch && qualifyingQuantity(cart) >= minimum;
      var keeper = eligible && gifts.find(function (line) { return isCanonical(line, item); });
      var updates = {};
      gifts.forEach(function (line) {
        var quantity = line === keeper ? 1 : 0;
        if (Number(line.quantity) === quantity) return;
        // Never fall back to variant ID: the same variant can have a paid line.
        if (!line.key) throw new Error('A gift cart line is missing its key.');
        updates[line.key] = quantity;
      });

      var path = null;
      var body = null;
      if (Object.keys(updates).length) {
        path = 'cart/update.js';
        body = { updates: updates };
      } else if (eligible && !keeper) {
        path = 'cart/add.js';
        body = { items: [item] };
      }
      if (path) {
        if (writes++ >= MAX_WRITES) throw timeoutError();
        // A failed/lost response can still mean the server changed the cart.
        // Keep this across failed runs so a verified retry refreshes the UI.
        needsAnnouncement = true;
        await request(path, body);
        continue; // Always read again, even when the write returned a full cart.
      }

      if (needsAnnouncement) {
        needsAnnouncement = false;
        announce(cart);
      }
      if (priceMismatch) throw new Error('The complimentary variant is no longer zero-priced.');
      if (dirty || pending.size || Date.now() < quietUntil) continue;
      clearError();
      return cart;
    }
    throw timeoutError();
  }

  function reconcile() {
    dirty = true;
    if (active) return active;
    // Assign the shared promise before run() can announce or touch the network.
    active = Promise.resolve().then(run).then(function (cart) {
      active = null;
      return cart;
    }, function (error) {
      active = null;
      showError(error, false);
      throw error;
    });
    return active;
  }

  function backgroundReconcile() {
    reconcile().catch(function () { /* Already displayed; a new event or Retry can try again. */ });
  }

  function onCartChanged(event) {
    if (event && event.ftdcFrom === SOURCE) return; // Only our own echo.
    noteActivity(QUIET_MS);
    var promise = event && (event.promise || (event.detail && event.detail.promise));
    if (promise && typeof promise.then === 'function' && !observedPromises.has(promise)) {
      observedPromises.add(promise);
      var tracked = Promise.resolve(promise).then(function (result) {
        if (result && result.detail && result.detail.didError) pendingError = new Error('Cart update failed.');
      }, function (error) {
        pendingError = error || new Error('Cart update failed.');
      }).then(function () {
        pending.delete(tracked);
        noteActivity(QUIET_MS);
        // The wait may have timed out before this external mutation completed.
        // Its eventual settlement is still a fresh reason to reconcile.
        if (!active) backgroundReconcile();
      });
      pending.add(tracked);
    }
    backgroundReconcile();
  }

  function asURL(value) {
    try { return new URL(value, window.location.href); } catch (_) { return null; }
  }

  function localPath(value, pattern) {
    var url = asURL(value);
    return url && url.origin === window.location.origin && pattern.test(url.pathname);
  }

  function isCheckoutSubmit(form, submitter) {
    if (!form || form.tagName !== 'FORM') return false;
    var action = submitter && submitter.getAttribute('formaction') || form.getAttribute('action') || window.location.href;
    if (localPath(action, /\/checkouts?(\/|$)/)) return true;
    return localPath(action, /\/cart\/?$/) && (!submitter || submitter.name === 'checkout');
  }

  function guardCheckout(resume, control) {
    if (checkoutTask) return;
    var priorBusy = control && control.getAttribute('aria-busy');
    if (control) control.setAttribute('aria-busy', 'true');
    // Cover a quantity click whose 300 ms debounce has not emitted its cart
    // promise yet, even if checkout was clicked immediately afterwards.
    noteActivity(STEPPER_SETTLE_MS);
    checkoutTask = (async function () {
      do { await reconcile(); } while (dirty || pending.size || Date.now() < quietUntil);
      resume();
    })().catch(function (error) {
      showError(error, true);
    }).finally(function () {
      checkoutTask = null;
      if (control) {
        if (priorBusy === null) control.removeAttribute('aria-busy');
        else control.setAttribute('aria-busy', priorBusy);
      }
    });
  }

  function onSubmit(event) {
    var originalForm = event.target;
    var submitter = event.submitter;
    if (originalForm === resumingForm || !isCheckoutSubmit(originalForm, submitter) || event.defaultPrevented) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var formId = originalForm.id;
    // Section rendering may replace both the form and its external submit button.
    var attributes = {};
    if (submitter) {
      ['name', 'value', 'formaction', 'formmethod', 'formenctype', 'formtarget', 'formnovalidate'].forEach(function (name) {
        var value = submitter.getAttribute(name);
        if (value !== null) attributes[name] = value;
      });
    }
    guardCheckout(function () {
      var form = originalForm.isConnected ? originalForm : formId && document.getElementById(formId);
      if (!form || !form.isConnected) throw new Error('The cart form changed. Please try checkout again.');
      var button = submitter;
      var temporary = null;
      if (button && (!button.isConnected || button.form !== form || button.disabled)) {
        temporary = document.createElement('button');
        temporary.type = 'submit';
        temporary.hidden = true;
        Object.keys(attributes).forEach(function (name) { temporary.setAttribute(name, attributes[name]); });
        form.appendChild(temporary);
        button = temporary;
      }
      resumingForm = form;
      try {
        // requestSubmit preserves native validation, submit handlers, name/value,
        // form action/method/target and other successful controls. Never replace
        // the cart POST with location = '/checkout' or call form.submit().
        var nativeRequest = window.HTMLFormElement && window.HTMLFormElement.prototype.requestSubmit;
        if (nativeRequest) nativeRequest.call(form, button || undefined);
        else if (button) button.click();
        else throw new Error('Please use the Checkout button to continue.');
      } finally {
        resumingForm = null;
        if (temporary) temporary.remove();
      }
    }, submitter || originalForm);
  }

  function onCheckoutLink(event) {
    var link = event.target && event.target.closest && event.target.closest('a[href]');
    if (!link || link === resumingLink || event.defaultPrevented ||
      !localPath(link.href, /\/checkouts?(\/|$)/)) return;
    if (event.type === 'click' && event.button > 0) return;
    if (event.type === 'auxclick' && event.button !== 1) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var type = event.type;
    var options = { bubbles: true, cancelable: true, composed: true, view: window,
      button: event.button, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
      shiftKey: event.shiftKey, altKey: event.altKey };
    guardCheckout(function () {
      resumingLink = link;
      try {
        if (type === 'click' && !options.ctrlKey && !options.metaKey && !options.shiftKey && !options.altKey) link.click();
        else link.dispatchEvent(new MouseEvent(type, options));
      } finally { resumingLink = null; }
    }, link);
  }

  window.FtdCreatineGift = {
    config: config, qualifyingQuantity: qualifyingQuantity, giftItem: giftItem, reconcile: reconcile
  };
  [CART_EVENT, 'cart:update', 'cart:refresh', 'ftdc:cart-changed'].forEach(function (name) {
    document.addEventListener(name, onCartChanged, true);
    // Also support integrations dispatching directly on window, without
    // processing a bubbling document announcement twice.
    window.addEventListener(name, function (event) {
      if (event.target === window) onCartChanged(event);
    });
  });
  document.addEventListener('quantity-selector:update', function (event) {
    if (event.detail && event.detail.cartLine) {
      noteActivity(STEPPER_SETTLE_MS);
      backgroundReconcile();
    }
  }, true);
  document.addEventListener('submit', onSubmit, true);
  document.addEventListener('click', onCheckoutLink, true);
  document.addEventListener('auxclick', onCheckoutLink, true);
  window.addEventListener('pageshow', backgroundReconcile);
  if (document.readyState === 'complete') backgroundReconcile();
  else window.addEventListener('load', backgroundReconcile, { once: true });
})();
