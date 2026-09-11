'use strict';

// Run with: node --test theme/tests/ftd-gift-sweep.test.cjs
// No DOM package, network, Shopify store, or real-time sleeps are required.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/ftd-gift-sweep.js'), 'utf8');
const CART_EVENT = 'shopify:cart:lines-update';
const PROPERTIES = { _sel: 'ftdc-d', _role: 'creatine', _upsell: 'creatine-first-order-free' };
const clone = (value) => JSON.parse(JSON.stringify(value));
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => clone(data) });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function hydration(quantity, extra = {}) {
  return {
    key: 'hydration', variant_id: 101, quantity, product_type: 'Hydration',
    original_price: 2500, price: 2500, final_price: 2500, properties: {},
    selling_plan_allocation: { selling_plan: { id: 1234 } }, ...extra,
  };
}

function gift(quantity = 1, extra = {}) {
  return {
    key: 'gift', variant_id: 999, quantity, product_type: 'Creatine',
    original_price: 0, price: 0, final_price: 0, properties: clone(PROPERTIES),
    selling_plan_allocation: null, ...extra,
  };
}

class Clock {
  now = 0;
  sequence = 0;
  timers = new Map();
  setTimeout = (callback, ms = 0) => {
    const id = ++this.sequence;
    this.timers.set(id, { at: this.now + Math.max(0, Number(ms)), callback });
    return id;
  };
  clearTimeout = (id) => { this.timers.delete(id); };
  async flush() {
    // Drain cross-realm async continuations completely before advancing time.
    // A fixed number of Promise ticks can accidentally fire a request timeout
    // while the fulfilled fetch is still propagating through vm microtasks.
    await new Promise(setImmediate);
  }
  async tick(ms) {
    const target = this.now + ms;
    await this.flush();
    let turns = 0;
    while (true) {
      const next = [...this.timers.entries()].filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      if (++turns > 10000) throw new Error('Unbounded timer loop');
      this.now = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
      await this.flush();
    }
    this.now = target;
    await this.flush();
  }
  async finish(promise) {
    let settled = false, value, error;
    Promise.resolve(promise).then((result) => { value = result; settled = true; },
      (reason) => { error = reason; settled = true; });
    for (let i = 0; i < 1000 && !settled; i++) {
      await this.flush();
      if (settled) break;
      const next = Math.min(...[...this.timers.values()].map((timer) => timer.at));
      if (!Number.isFinite(next)) throw new Error('Promise did not settle and has no timers');
      await this.tick(next - this.now);
    }
    if (!settled) throw new Error('Promise did not settle within the test budget');
    if (error) throw error;
    return value;
  }
}

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = !!options.bubbles;
    this.cancelable = !!options.cancelable;
    this.defaultPrevented = false;
    Object.assign(this, options);
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopImmediatePropagation() { this.stopped = true; }
}

class Emitter {
  listeners = new Map();
  addEventListener(type, callback, options = {}) {
    const entries = this.listeners.get(type) || [];
    entries.push({ callback, capture: options === true || !!options.capture, once: !!options.once });
    this.listeners.set(type, entries);
  }
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry.callback !== callback));
  }
  dispatchEvent(event) {
    event.target = this;
    event.stopped = false;
    const parents = [];
    for (let node = this.parentNode; node; node = node.parentNode) parents.push(node);
    const deliver = (node, capture) => {
      for (const entry of [...(node.listeners.get(event.type) || [])]) {
        if (event.stopped) break;
        if (entry.capture !== capture) continue;
        if (entry.once) node.removeEventListener(event.type, entry.callback);
        event.currentTarget = node;
        entry.callback.call(node, event);
      }
    };
    for (const parent of [...parents].reverse()) deliver(parent, true);
    deliver(this, true);
    deliver(this, false);
    if (event.bubbles) for (const parent of parents) deliver(parent, false);
    return !event.defaultPrevented;
  }
}

function simpleMatch(element, selector) {
  const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
  if (tag && element.tagName !== tag.toUpperCase()) return false;
  const id = selector.match(/#([\w-]+)/)?.[1];
  if (id && element.id !== id) return false;
  for (const match of selector.matchAll(/\.([\w-]+)/g)) {
    if (!element.className.split(/\s+/).includes(match[1])) return false;
  }
  for (const match of selector.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]/g)) {
    if (element.getAttribute(match[1]) === null) return false;
    if (match[2] !== undefined && element.getAttribute(match[1]) !== match[2]) return false;
  }
  return true;
}

class Element extends Emitter {
  constructor(tag, document) {
    super();
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.attributes = new Map();
    this.style = {};
    this.hidden = false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get name() { return this.getAttribute('name') || ''; }
  set name(value) { this.setAttribute('name', value); }
  get value() { return this.getAttribute('value') || ''; }
  set value(value) { this.setAttribute('value', value); }
  get type() { return this.getAttribute('type') || (this.tagName === 'BUTTON' ? 'submit' : 'text'); }
  set type(value) { this.setAttribute('type', value); }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get disabled() { return this.getAttribute('disabled') !== null; }
  set disabled(value) { if (value) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get href() { return new URL(this.getAttribute('href'), this.ownerDocument.window.location.href).href; }
  set href(value) { this.setAttribute('href', value); }
  get firstChild() { return this.children[0] || null; }
  get isConnected() {
    for (let node = this.parentNode; node; node = node.parentNode) if (node === this.ownerDocument) return true;
    return false;
  }
  get form() {
    return this.getAttribute('form') ? this.ownerDocument.getElementById(this.getAttribute('form')) : this.closest('form');
  }
  get elements() { return this.ownerDocument.all().filter((element) => element !== this && element.form === this); }
  appendChild(child) { return this.insertBefore(child, null); }
  insertBefore(child, before) {
    if (child === before) return child;
    child.remove?.();
    const index = before ? this.children.indexOf(before) : this.children.length;
    if (index < 0) throw new Error('Invalid insertion reference');
    this.children.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }
  remove() {
    if (this.parentNode?.children) {
      this.parentNode.children = this.parentNode.children.filter((element) => element !== this);
    }
    this.parentNode = null;
  }
  matches(selector) {
    const segments = selector.trim().split(/\s+/).reverse();
    if (!simpleMatch(this, segments[0])) return false;
    let parent = this.parentNode;
    for (const segment of segments.slice(1)) {
      while (parent && !(parent instanceof Element && simpleMatch(parent, segment))) parent = parent.parentNode;
      if (!parent) return false;
      parent = parent.parentNode;
    }
    return true;
  }
  closest(selector) {
    for (let element = this; element instanceof Element; element = element.parentNode) {
      if (element.matches(selector)) return element;
    }
    return null;
  }
  all() { return this.children.flatMap((child) => [child, ...child.all()]); }
  querySelector(selector) { return this.all().find((element) => element.matches(selector)) || null; }
  focus() { this.ownerDocument.activeElement = this; }
  click() {
    if (this.disabled) return;
    this.dispatchEvent(new FakeEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  }
  dispatchEvent(event) {
    const allowed = super.dispatchEvent(event);
    if (allowed && (event.type === 'click' || event.type === 'auxclick')) {
      if (this.tagName === 'A') {
        this.ownerDocument.navigations.push({
          href: this.href, target: this.getAttribute('target'), event, at: this.ownerDocument.clock.now,
        });
      } else if (this.tagName === 'BUTTON' && this.type === 'submit' && this.form) {
        this.ownerDocument.nativeSubmit(this.form, this);
      }
    }
    return allowed;
  }
}

function environment(options = {}) {
  const clock = new Clock();
  const window = new Emitter();
  const document = new Emitter();
  Object.assign(document, {
    window, clock, parentNode: window, readyState: options.readyState || 'loading',
    navigations: [], submissions: [], activeElement: null,
  });
  document.body = new Element('body', document);
  document.body.parentNode = document;
  document.createElement = (tag) => new Element(tag, document);
  document.all = () => [document.body, ...document.body.all()];
  document.getElementById = (id) => document.all().find((element) => element.id === id) || null;
  document.querySelector = (selector) => document.all().find((element) => element.matches(selector)) || null;
  document.nativeSubmit = (form, submitter) => {
    if (form.valid === false && submitter?.getAttribute('formnovalidate') === null &&
      form.getAttribute('novalidate') === null) return false;
    const event = new FakeEvent('submit', { bubbles: true, cancelable: true, submitter });
    if (!form.dispatchEvent(event)) return false;
    const fields = form.elements.filter((element) =>
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) && element.name && !element.disabled)
      .map((element) => [element.name, element.value]);
    if (submitter?.name && !submitter.disabled) fields.push([submitter.name, submitter.value]);
    document.submissions.push({
      form, submitter, fields,
      action: submitter?.getAttribute('formaction') || form.getAttribute('action'),
      method: submitter?.getAttribute('formmethod') || form.getAttribute('method'),
      target: submitter?.getAttribute('formtarget') || form.getAttribute('target'),
      enctype: submitter?.getAttribute('formenctype') || form.getAttribute('enctype'),
      at: clock.now,
    });
    return true;
  };
  const config = options.config === null ? undefined : {
    variantId: 999, minimum: 3, available: true, price: 0, productType: 'Hydration', ...options.config,
  };
  window.__ftdCreatineGiftConfig = config;
  window.__ftdGoldRun = options.gold;
  window.location = new URL('https://fortified.test/products/hydration');
  window.Shopify = { routes: { root: options.root || '/' } };
  window.document = document;
  window.console = { warn: (...args) => harness.warnings.push(args) };
  window.HTMLFormElement = { prototype: {
    requestSubmit: function (submitter) { return document.nativeSubmit(this, submitter); },
  } };
  const harness = {
    clock, window, document, config, warnings: [], calls: [],
    items: clone(options.items || []), intercept: options.intercept, giftPrice: options.giftPrice ?? 0,
    cart() {
      const items = clone(this.items).map((line) => ({
        ...line, final_line_price: line.quantity * line.final_price,
      }));
      return {
        token: 'cart-token', currency: 'CAD', items,
        item_count: items.reduce((total, line) => total + line.quantity, 0),
        total_price: items.reduce((total, line) => total + line.final_line_price, 0),
        cart_level_discount_applications: [{ title: 'Example code' }],
      };
    },
    execute(call) {
      if (call.method === 'GET') return response(this.cart());
      if (call.url.endsWith('cart/update.js')) {
        for (const [key, quantity] of Object.entries(call.body.updates)) {
          const line = this.items.find((item) => item.key === key);
          if (!line) return response({ errors: 'Unknown line key' }, 422);
          line.quantity = quantity;
        }
        this.items = this.items.filter((line) => line.quantity > 0);
        return response(this.cart());
      }
      if (call.url.endsWith('cart/add.js')) {
        for (const item of call.body.items) {
          const existing = this.items.find((line) => line.variant_id === item.id &&
            JSON.stringify(line.properties) === JSON.stringify(item.properties) &&
            (line.selling_plan_allocation?.selling_plan?.id || null) === (item.selling_plan || null));
          if (existing) existing.quantity += item.quantity;
          else this.items.push(gift(item.quantity, {
            key: `added-gift-${this.calls.length}`, variant_id: item.id, properties: item.properties,
            original_price: this.giftPrice, price: this.giftPrice, final_price: this.giftPrice,
            selling_plan_allocation: item.selling_plan ? { selling_plan: { id: item.selling_plan } } : null,
          }));
        }
        return response({ items: clone(this.items) });
      }
      throw new Error(`Unexpected request: ${call.url}`);
    },
    async fetch(url, init) {
      const call = { url, method: init.method || 'GET', body: init.body && JSON.parse(init.body), init, at: clock.now };
      harness.calls.push(call);
      const result = await harness.intercept?.(call, harness);
      return result === undefined ? harness.execute(call) : result;
    },
    emit(type, fields = {}, target = document) {
      const event = new FakeEvent(type, { bubbles: true, cancelable: true, ...fields });
      target.dispatchEvent(event);
      return event;
    },
    reconcile() { return clock.finish(this.service.reconcile()); },
    posts() { return this.calls.filter((call) => call.method === 'POST'); },
    reads() { return this.calls.filter((call) => call.method === 'GET'); },
    gifts() { return this.items.filter((line) => line.properties?._upsell === PROPERTIES._upsell); },
    error() { return document.getElementById('ftd-creatine-gift-error'); },
    form(extra = {}) {
      const form = document.createElement('form');
      form.id = 'cart-form';
      form.setAttribute('action', extra.action || '/cart');
      form.setAttribute('method', 'post');
      const note = document.createElement('input');
      note.name = 'note';
      note.value = extra.note || 'Keep this native cart note';
      form.appendChild(note);
      document.body.appendChild(form);
      const button = document.createElement('button');
      button.id = 'checkout';
      button.type = 'submit';
      button.name = 'checkout';
      button.value = 'Checkout';
      button.setAttribute('form', form.id);
      document.body.appendChild(button);
      return { form, button, note };
    },
    link(href = '/checkout') {
      const link = document.createElement('a');
      link.href = href;
      document.body.appendChild(link);
      return link;
    },
  };
  window.fetch = harness.fetch;
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const context = vm.createContext({
    window, document, fetch: harness.fetch, Event: FakeEvent, MouseEvent: FakeEvent,
    URL, Date: FakeDate, Promise, Set, WeakSet, AbortController,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
  });
  harness.reload = () => vm.runInContext(source, context, { filename: 'ftd-gift-sweep.js' });
  harness.reload();
  harness.service = window.FtdCreatineGift;
  return harness;
}

test('public singleton keeps the config reference and returns a fresh one-time gift item', async () => {
  const h = environment({ items: [hydration(3)], gold: true });
  assert.equal(h.service.config, h.config);
  assert.deepEqual(clone(h.service.giftItem()), { id: 999, quantity: 1, properties: PROPERTIES });
  assert.equal('selling_plan' in h.service.giftItem(), false);
  h.service.giftItem().properties._role = 'changed';
  assert.equal(h.service.giftItem().properties._role, 'creatine');
  const service = h.service;
  h.reload();
  assert.equal(h.window.FtdCreatineGift, service);
  assert.equal(h.window.fetch, h.fetch, 'the service must not monkey-patch fetch');
  await h.reconcile();
  assert.equal(h.gifts().length, 1, 'Gold does not disable the shared service');
  h.config.available = false;
  assert.equal(h.service.giftItem(), null);
});

for (const quantity of [0, 2, 3, 6]) {
  test(`actual subscription quantity ${quantity} earns ${quantity >= 3 ? 'one gift' : 'no gift'}`, async () => {
    const h = environment({ items: quantity ? [hydration(quantity)] : [] });
    assert.equal(h.service.qualifyingQuantity(h.cart()), quantity);
    const cart = await h.reconcile();
    assert.equal(cart.items.filter((line) => line.properties?._upsell === PROPERTIES._upsell).length, quantity >= 3 ? 1 : 0);
    if (quantity >= 3) assert.equal(h.gifts()[0].quantity, 1);
    assert.equal(h.posts().length, quantity >= 3 ? 1 : 0);
  });
}

test('qualification sums mixed actual product types/plans, not roles, one-time lines or plan names', async () => {
  const h = environment({ items: [
    hydration(2, { key: 'a', product_type: '  hYdRaTiOn  ', properties: { _role: 'not-a-pouch' } }),
    hydration(1, { key: 'b', variant_id: 102, selling_plan_allocation: { selling_plan: { id: 'quarterly' } } }),
    hydration(9, { key: 'one-time', selling_plan_allocation: null, properties: { _sel: 'ftdc-d', _role: 'pouch' } }),
    hydration(8, { key: 'performance', product_type: 'Performance' }),
    hydration(7, { key: 'no-id', selling_plan_allocation: { selling_plan: { name: 'Monthly' } } }),
    hydration(6, { key: 'false-id', selling_plan_allocation: { selling_plan: { id: 0 } } }),
    hydration(5, { key: 'raw-plan-only', selling_plan_allocation: null, selling_plan: 1234 }),
    hydration(-3, { key: 'invalid-negative' }),
    hydration('invalid', { key: 'invalid-quantity' }),
  ] });
  assert.equal(h.service.qualifyingQuantity(h.cart()), 3);
  await h.reconcile();
  assert.equal(h.gifts().length, 1);
});

test('one-time Hydration and subscription non-Hydration never qualify, even if tagged pouch', async () => {
  for (const extra of [{ selling_plan_allocation: null }, { product_type: 'Performance' }]) {
    const h = environment({ items: [
      hydration(6, { properties: { _sel: 'ftdc-d', _role: 'pouch' }, ...extra }), gift(),
    ] });
    assert.equal(h.service.qualifyingQuantity(h.cart()), 0);
    await h.reconcile();
    assert.equal(h.gifts().length, 0);
    assert.equal(h.items[0].quantity, 6);
  }
});

test('split additions earn a single cart-wide gift only upon reaching the third subscription unit', async () => {
  const h = environment({ items: [hydration(1)] });
  await h.reconcile();
  h.items.push(hydration(1, { key: 'second', variant_id: 102 }));
  h.emit('cart:update', { ftdcFrom: 'gold-selector' });
  await h.reconcile();
  assert.equal(h.gifts().length, 0);
  h.items.push(hydration(1, { key: 'third', variant_id: 103 }));
  h.emit('ftdc:cart-changed', { ftdcFrom: 'another-selector' });
  await h.reconcile();
  assert.equal(h.gifts().length, 1);
  h.items[0].quantity = 4;
  h.emit('cart:refresh');
  await h.reconcile();
  assert.equal(h.gifts()[0].quantity, 1);
  assert.equal(h.posts().filter((call) => call.url.endsWith('add.js')).length, 1);
});

test('canonical gift is a no-op; duplicate quantity and gift representations normalize without touching paid lines', async () => {
  const paid = [
    gift(2, { key: 'paid-buy', properties: { ...PROPERTIES, _role: 'creatine-buy' } }),
    gift(2, { key: 'paid-second', properties: { _sel: 'ftdc-d', _role: 'creatine2' } }),
    gift(2, { key: 'paid-onetime', properties: { _sel: 'ftdc-d', _role: 'creatine', _upsell: 'creatine-onetime' } }),
    gift(2, { key: 'paid-role-onetime', properties: { _role: 'creatine-onetime' } }),
    gift(2, { key: 'paid-sub', original_price: 2400, price: 2400, final_price: 1200,
      properties: { _sel: 'ftdc-d', _role: 'creatine' }, selling_plan_allocation: { selling_plan: { id: 555 } } }),
    gift(2, { key: 'untagged-sub', properties: {}, selling_plan_allocation: { selling_plan: { id: 555 } } }),
    gift(2, { key: 'discounted-paid', original_price: 2400, price: 2400, final_price: 0, properties: {} }),
  ];
  const h = environment({ items: [
    hydration(6), gift(4),
    gift(2, { key: 'duplicate' }),
    gift(3, { key: 'direct', properties: {} }),
    gift(1, { key: 'legacy', variant_id: 998, original_price: 2400, properties: { _sel: 'ftdc-d', _role: 'creatine' } }),
    ...paid,
  ] });
  await h.reconcile();
  assert.equal(h.items.find((line) => line.key === 'gift').quantity, 1);
  for (const line of paid) assert.deepEqual(h.items.find((item) => item.key === line.key), line);
  assert.equal(h.items.length, paid.length + 2);
  assert.equal(h.posts().length, 1);
  const write = h.calls.findIndex((call) => call.method === 'POST');
  assert.equal(h.calls[write + 1].method, 'GET', 'write response must not be trusted as the final cart');
  const count = h.posts().length;
  await h.reconcile();
  assert.equal(h.posts().length, count);
});

test('legacy and explicit free-plan gifts are replaced with exactly the canonical one-time properties', async () => {
  const h = environment({ items: [
    hydration(3),
    gift(2, { key: 'legacy', variant_id: 998, original_price: 2400, properties: { _sel: 'ftdc-d', _role: 'creatine' } }),
    gift(1, { key: 'legacy-plan', properties: { _upsell: PROPERTIES._upsell },
      selling_plan_allocation: { selling_plan: { id: 'legacy-free-plan' } } }),
    gift(3, { key: 'direct', properties: {} }),
  ] });
  await h.reconcile();
  assert.equal(h.items.length, 2);
  assert.equal(h.gifts()[0].quantity, 1);
  assert.equal(h.gifts()[0].selling_plan_allocation, null);
  assert.deepEqual(h.gifts()[0].properties, PROPERTIES);
  assert.deepEqual(h.posts().map((call) => call.url), ['/cart/update.js', '/cart/add.js']);
});

test('below threshold removes positively identified canonical, legacy and direct zero-price gifts only', async () => {
  for (const quantity of [0, 2]) {
    const h = environment({ items: [
      ...(quantity ? [hydration(quantity)] : []), gift(),
      gift(2, { key: 'legacy', variant_id: 998, properties: { _sel: 'ftdc-d', _role: 'creatine' } }),
      gift(3, { key: 'direct', properties: {} }),
      gift(2, { key: 'unknown-priced-creatine', variant_id: 888, original_price: 2400,
        properties: { _sel: 'not-ours', _role: 'creatine' } }),
      gift(2, { key: 'paid-second', properties: { _role: 'creatine2' } }),
    ] });
    await h.reconcile();
    assert.deepEqual(h.items.map((line) => line.key),
      [...(quantity ? ['hydration'] : []), 'unknown-priced-creatine', 'paid-second']);
  }
});

test('reducing 6 to 2 and removing a qualifying selling plan both withdraw the gift', async () => {
  const h = environment({ items: [hydration(6)] });
  await h.reconcile();
  h.items[0].quantity = 2;
  h.emit(CART_EVENT);
  await h.reconcile();
  assert.equal(h.gifts().length, 0);
  h.items[0].quantity = 3;
  await h.reconcile();
  assert.equal(h.gifts().length, 1);
  h.items[0].selling_plan_allocation = null;
  h.emit(CART_EVENT);
  await h.reconcile();
  assert.equal(h.gifts().length, 0);
  assert.equal(h.items[0].quantity, 3);
});

test('a lines-update event is observed before mutation and reconciliation waits for its promise', async () => {
  const h = environment({ items: [hydration(3), gift()] });
  const mutation = deferred();
  h.emit(CART_EVENT, { promise: mutation.promise, ftdcFrom: 'gold-selector' });
  const final = h.service.reconcile();
  await h.clock.tick(1000);
  assert.equal(h.calls.length, 0, 'neither read nor write the pre-mutation cart');
  h.items[0].quantity = 2;
  mutation.resolve({ detail: { didError: false } });
  const cart = await h.clock.finish(final);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].quantity, 2);
  assert.equal(h.gifts().length, 0);
});

test('all overlapping cart event promises settle before any read, including promises in detail', async () => {
  const h = environment();
  const a = deferred(), b = deferred();
  h.emit(CART_EVENT, { promise: a.promise });
  h.emit('cart:refresh', { detail: { promise: b.promise } });
  const final = h.service.reconcile();
  a.resolve();
  await h.clock.tick(500);
  assert.equal(h.calls.length, 0);
  h.items = [hydration(3)];
  b.resolve();
  await h.clock.finish(final);
  assert.equal(h.gifts().length, 1);
});

test('concurrent callers share a promise and an event during a stale read retains a dirty pass', async () => {
  const gate = deferred();
  let blocked = false;
  const h = environment({ intercept: async (call, cart) => {
    if (!blocked && call.method === 'GET') {
      blocked = true;
      const snapshot = cart.cart();
      await gate.promise;
      return response(snapshot);
    }
  } });
  const first = h.service.reconcile();
  await h.clock.flush();
  h.items = [hydration(3)];
  h.emit('cart:update', { ftdcFrom: 'ftd-selector-gold' });
  const second = h.service.reconcile();
  assert.equal(first, second);
  gate.resolve();
  const cart = await h.clock.finish(first);
  assert.equal(h.gifts().length, 1);
  assert.equal(cart.items.length, 2);
  assert.equal(h.posts().length, 1);
  assert.ok(h.reads().length >= 3);
});

test('an event during an add waits for its mutation and removes the now-unearned in-flight gift', async () => {
  const addGate = deferred(), cartGate = deferred();
  const h = environment({ items: [hydration(3)], intercept: async (call, cart) => {
    if (call.url.endsWith('add.js')) {
      const result = cart.execute(call);
      await addGate.promise;
      return result;
    }
  } });
  const first = h.service.reconcile();
  await h.clock.flush();
  assert.equal(h.gifts().length, 1);
  h.emit(CART_EVENT, { promise: cartGate.promise });
  assert.equal(h.service.reconcile(), first);
  addGate.resolve();
  await h.clock.tick(500);
  assert.equal(h.posts().length, 1);
  h.items[0].quantity = 2;
  cartGate.resolve();
  const final = await h.clock.finish(first);
  assert.equal(final.items.length, 1);
  assert.equal(h.gifts().length, 0);
});

test('more than four successful add/remove cycles work on one page without a lifetime cap', async () => {
  const h = environment({ items: [hydration(2)] });
  for (let i = 0; i < 8; i++) {
    h.items[0].quantity = 3;
    h.emit('cart:update');
    await h.reconcile();
    assert.equal(h.gifts().length, 1);
    h.items[0].quantity = 2;
    h.emit('cart:refresh');
    await h.reconcile();
    assert.equal(h.gifts().length, 0);
  }
  assert.equal(h.posts().length, 16);
});

test('mutation failure is accessible, rejects, does not spin, and the retry button recovers', async () => {
  let fail = true;
  const h = environment({ items: [hydration(3)], intercept: (call) => {
    if (fail && call.method === 'POST') return response({ description: 'Sold out' }, 422);
  } });
  await assert.rejects(h.reconcile(), /422/);
  assert.equal(h.posts().length, 1);
  assert.equal(h.error().getAttribute('role'), 'alert');
  assert.equal(h.error().getAttribute('aria-live'), 'assertive');
  assert.equal(h.error().hidden, false);
  assert.match(h.error().children[0].textContent, /retry before checking out/i);
  await h.clock.tick(5000);
  assert.equal(h.posts().length, 1);
  fail = false;
  h.error().querySelector('button').click();
  await h.reconcile();
  assert.equal(h.gifts().length, 1);
  assert.equal(h.error().hidden, true);
});

test('a lost add response does not cause a duplicate add when an event retries', async () => {
  let fail = true;
  const h = environment({ items: [hydration(3)], intercept: (call, cart) => {
    if (fail && call.url.endsWith('add.js')) {
      fail = false;
      cart.execute(call);
      throw new Error('Lost response');
    }
  } });
  let announcements = 0;
  h.document.addEventListener(CART_EVENT, (event) => {
    if (event.ftdcFrom === 'ftd-gift-sweep') announcements++;
  });
  await assert.rejects(h.reconcile(), /Lost response/);
  assert.equal(h.gifts().length, 1);
  assert.equal(announcements, 0, 'a failed write has not yet produced a verified final cart');
  h.emit('ftdc:cart-changed');
  await h.reconcile();
  assert.equal(h.posts().length, 1);
  assert.equal(h.gifts()[0].quantity, 1);
  assert.equal(h.error().hidden, true);
  assert.equal(announcements, 1, 'retry refreshes the cart UI even if the lost write already succeeded');
});

test('nonconverging successful writes are bounded per run and a later manual retry works', async () => {
  let ignoreUpdates = true;
  const h = environment({ items: [hydration(3), gift(2)], intercept: (call, cart) => {
    if (ignoreUpdates && call.method === 'POST') return response(cart.cart());
  } });
  await assert.rejects(h.reconcile(), /did not settle/);
  assert.equal(h.posts().length, 12);
  await h.clock.tick(5000);
  assert.equal(h.posts().length, 12);
  ignoreUpdates = false;
  await h.reconcile();
  assert.equal(h.gifts()[0].quantity, 1);
  assert.equal(h.posts().length, 13);
});

test('HTTP read failures and invalid JSON are not treated as empty or successful carts', async () => {
  for (const bad of [
    response({}, 503),
    { ok: true, status: 200, json: async () => { throw new SyntaxError('Invalid JSON'); } },
    response({ unexpected: true }),
    response({ errors: 'Cart error', items: [] }),
  ]) {
    const h = environment({ intercept: () => bad });
    await assert.rejects(h.reconcile());
    assert.equal(h.posts().length, 0);
    assert.equal(h.error().hidden, false);
  }
});

test('request and unresolved event timeouts stop without polling the server or retrying POSTs', async () => {
  const never = deferred();
  const h = environment({ intercept: () => never.promise });
  await assert.rejects(h.reconcile(), /did not settle/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].init.signal.aborted, true);
  const waiting = environment();
  waiting.emit(CART_EVENT, { promise: never.promise });
  await assert.rejects(waiting.reconcile(), /did not settle/);
  assert.equal(waiting.calls.length, 0);
});

test('an external mutation settling after the wait timed out still triggers a fresh reconciliation', async () => {
  const mutation = deferred();
  const h = environment();
  h.emit(CART_EVENT, { promise: mutation.promise });
  await assert.rejects(h.reconcile(), /did not settle/);
  assert.equal(h.calls.length, 0);
  h.items = [hydration(3)];
  mutation.resolve();
  await h.clock.tick(500);
  assert.equal(h.gifts().length, 1);
  assert.equal(h.error().hidden, true);
});

for (const config of [
  { available: false }, { price: 2400 }, { price: null }, { price: '0' },
  { variantId: null }, { variantId: 0 }, { variantId: '999' }, { variantId: 1.5 },
]) {
  test(`unsafe configuration does not add a gift: ${JSON.stringify(config)}`, async () => {
    const h = environment({ items: [hydration(3), gift()], config });
    assert.equal(h.service.giftItem(), null);
    await h.reconcile();
    assert.equal(h.gifts().length, 0);
    assert.equal(h.posts().some((call) => call.url.endsWith('add.js')), false);
  });
}

test('missing global configuration is disabled, but still removes positively tagged stale gifts', async () => {
  const h = environment({ config: null, items: [hydration(3), gift()] });
  assert.equal(h.service.giftItem(), null);
  await h.reconcile();
  assert.equal(h.items.length, 1);
});

test('a stale zero-price config cannot leave a charged new gift in the cart', async () => {
  const h = environment({ items: [hydration(3)], giftPrice: 2400 });
  await assert.rejects(h.reconcile(), /no longer zero-priced/);
  assert.equal(h.gifts().length, 0);
  assert.deepEqual(h.posts().map((call) => call.url), ['/cart/add.js', '/cart/update.js']);
  assert.equal(h.error().hidden, false);
});

test('all requests honor locale root with or without a trailing slash', async () => {
  for (const root of ['/fr-ca/', '/fr-ca']) {
    const h = environment({ root, items: [hydration(3)] });
    await h.reconcile();
    h.items[0].quantity = 2;
    await h.reconcile();
    assert.ok(h.calls.every((call) => call.url.startsWith('/fr-ca/cart')));
    assert.deepEqual([...new Set(h.calls.map((call) => call.url))],
      ['/fr-ca/cart.js', '/fr-ca/cart/add.js', '/fr-ca/cart/update.js']);
    assert.ok(h.calls.every((call) => call.init.credentials === 'same-origin' && call.init.cache === 'no-store'));
  }
});

test('load, complete-document startup and pageshow reconcile without selector ownership', async () => {
  const h = environment({ items: [hydration(3)] });
  await h.clock.tick(500);
  assert.equal(h.calls.length, 0);
  h.emit('load', {}, h.window);
  await h.clock.tick(500);
  assert.equal(h.gifts().length, 1);
  h.items[0].quantity = 2;
  h.emit('pageshow', { persisted: true }, h.window);
  await h.clock.tick(500);
  assert.equal(h.gifts().length, 0);
  const complete = environment({ items: [hydration(3)], readyState: 'complete' });
  await complete.clock.tick(500);
  assert.equal(complete.gifts().length, 1);
});

test('every supported external event triggers reconciliation; only the service own marker is ignored', async () => {
  for (const type of [CART_EVENT, 'cart:update', 'cart:refresh', 'ftdc:cart-changed']) {
    for (const targetName of ['document', 'window']) {
      const h = environment({ items: [hydration(3)] });
      h.emit(type, { ftdcFrom: 'ftd-gift-sweep' }, h[targetName]);
      await h.clock.tick(500);
      assert.equal(h.calls.length, 0);
      h.emit(type, { ftdcFrom: 'a-different-ftdc-service' }, h[targetName]);
      await h.clock.tick(500);
      assert.equal(h.gifts().length, 1, `${type} on ${targetName}`);
      assert.equal(h.calls.length, 3, 'own announcement and document bubbling do not schedule extra reads');
    }
  }
});

test('announcements use the standard update event shape and resolve with the verified final cart', async () => {
  const h = environment({ items: [hydration(3)] });
  const received = [];
  h.document.addEventListener(CART_EVENT, (event) => { if (event.ftdcFrom === 'ftd-gift-sweep') received.push(event); });
  const cart = await h.reconcile();
  assert.equal(received.length, 1);
  const event = received[0];
  assert.equal(event.action, 'update');
  assert.equal(event.context, 'cart');
  assert.equal(event.bubbles, true);
  assert.equal(event.composed, true);
  assert.deepEqual(clone(event.lines), cart.items.map((line) => ({ id: line.key, quantity: line.quantity })));
  const result = await event.promise;
  assert.deepEqual(clone(result.detail.items), cart.items);
  assert.equal(result.detail.didError, false);
  assert.equal(result.detail.source, 'ftd-gift-sweep');
  assert.equal(result.cart.totalQuantity, 4);
  assert.deepEqual(clone(result.cart.cost.totalAmount), { amount: '75.00', currencyCode: 'CAD' });
  assert.deepEqual(clone(result.cart.discountCodes), [{ applicable: true, code: 'Example code' }]);
});

test('removing the last gift still announces an empty final cart', async () => {
  const h = environment({ items: [gift()] });
  let announced;
  h.document.addEventListener(CART_EVENT, (event) => { announced = event; });
  await h.reconcile();
  assert.equal((await announced.promise).cart.totalQuantity, 0);
  assert.deepEqual(clone(announced.lines), []);
});

test('checkout waits through the 300 ms stepper debounce and mutation, preserving native form semantics', async () => {
  const h = environment({ root: '/fr/', items: [hydration(3), gift()] });
  const { form, button, note } = h.form({ action: '/fr/cart' });
  button.setAttribute('formtarget', '_self');
  button.setAttribute('formenctype', 'application/x-www-form-urlencoded');
  const mutation = deferred();
  const quantity = h.document.createElement('input');
  quantity.name = 'updates[]';
  quantity.value = '2';
  form.appendChild(quantity);
  let nativeSubmitEvents = 0;
  h.document.addEventListener('submit', () => { nativeSubmitEvents++; });
  h.emit('quantity-selector:update', { detail: { cartLine: 1, quantity: 2 } }, quantity);
  h.clock.setTimeout(() => h.emit(CART_EVENT, { promise: mutation.promise }, form), 300);
  button.click();
  assert.equal(h.document.submissions.length, 0);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  await h.clock.tick(600);
  assert.equal(h.calls.length, 0);
  assert.equal(h.document.submissions.length, 0);
  h.items[0].quantity = 2;
  mutation.resolve();
  await h.clock.tick(500);
  assert.equal(h.gifts().length, 0);
  assert.equal(h.document.submissions.length, 1);
  const submission = h.document.submissions[0];
  assert.equal(submission.action, '/fr/cart');
  assert.equal(submission.method, 'post');
  assert.equal(submission.target, '_self');
  assert.equal(submission.enctype, 'application/x-www-form-urlencoded');
  assert.deepEqual(submission.fields, [['note', note.value], ['updates[hydration]', '2'], ['checkout', 'Checkout']]);
  assert.equal(quantity.disabled, false, 'original quantity control is restored after submission');
  assert.equal(submission.submitter, button);
  assert.equal(nativeSubmitEvents, 1, 'downstream submit handlers run on the validated native replay only');
  assert.equal(button.getAttribute('aria-busy'), null);
});

test('checkout handles a second stepper change while already waiting', async () => {
  const h = environment({ items: [hydration(3), gift()] });
  const { form, button } = h.form();
  button.click();
  await h.clock.tick(250);
  const mutation = deferred();
  h.emit('quantity-selector:update', { detail: { cartLine: 1, quantity: 2 } }, form);
  h.clock.setTimeout(() => h.emit(CART_EVENT, { promise: mutation.promise }), 300);
  await h.clock.tick(500);
  assert.equal(h.document.submissions.length, 0);
  h.items[0].quantity = 2;
  mutation.resolve();
  await h.clock.tick(500);
  assert.equal(h.document.submissions.length, 1);
  assert.equal(h.gifts().length, 0);
});

test('replaced cart form and external submitter retain checkout name, overrides, and current form fields', async () => {
  const h = environment({ items: [hydration(3)] });
  const original = h.form();
  original.button.setAttribute('formaction', '/fr/cart');
  original.button.setAttribute('formmethod', 'post');
  original.button.setAttribute('formtarget', '_top');
  original.button.setAttribute('formenctype', 'multipart/form-data');
  original.button.setAttribute('formnovalidate', '');
  let replacement;
  h.document.addEventListener(CART_EVENT, (event) => {
    if (event.ftdcFrom === 'ftd-gift-sweep') event.promise.then(() => {
      original.form.remove();
      original.button.remove();
      replacement = h.form({ action: '/fr/cart', note: 'Current server-rendered note' });
    });
  });
  original.button.click();
  await h.clock.tick(1000);
  assert.equal(h.document.submissions.length, 1);
  const submitted = h.document.submissions[0];
  assert.equal(submitted.form, replacement.form);
  assert.equal(submitted.action, '/fr/cart');
  assert.equal(submitted.target, '_top');
  assert.equal(submitted.enctype, 'multipart/form-data');
  assert.equal(submitted.submitter.getAttribute('formnovalidate'), '');
  assert.deepEqual(submitted.fields, [
    ['note', 'Current server-rendered note'],
    ...h.items.map((line) => [`updates[${line.key}]`, String(line.quantity)]),
    ['checkout', 'Checkout'],
  ]);
  assert.equal(replacement.form.children.length, 1, 'temporary submitter is cleaned up');
});

test('native validation is not bypassed and non-checkout actions are not intercepted', async () => {
  const h = environment();
  const { form, button } = h.form();
  form.valid = false;
  button.click();
  await h.clock.tick(500);
  assert.equal(h.document.submissions.length, 0);
  assert.equal(h.calls.length, 0);
  form.valid = true;
  button.name = 'update';
  button.click();
  assert.equal(h.document.submissions.length, 1);
  assert.equal(h.calls.length, 0);
  h.link('/collections/all').click();
  h.link('https://other.test/checkout').click();
  assert.equal(h.document.navigations.length, 2);
});

test('native requestSubmit replay respects validation changes made during reconciliation', async () => {
  const h = environment({ items: [hydration(3)] });
  const { form, button } = h.form();
  button.click();
  form.valid = false;
  await h.clock.tick(1000);
  assert.equal(h.document.submissions.length, 0);
  assert.equal(h.gifts().length, 1);
});

test('gift-first native checkout uses verified keyed quantities, not the incomplete or stale positional form', async () => {
  const h = environment({ items: [gift(), hydration(3)] });
  const { form, button, note } = h.form();
  const positional = h.document.createElement('input');
  positional.name = 'updates[]';
  positional.value = '3'; // Only hydration has an input; gift is cart line one.
  form.appendChild(positional);
  const staleKeyed = h.document.createElement('input');
  staleKeyed.name = 'updates[hydration]';
  staleKeyed.value = '6';
  staleKeyed.setAttribute('form', form.id);
  h.document.body.appendChild(staleKeyed);
  const initiallyDisabled = h.document.createElement('input');
  initiallyDisabled.name = 'updates[obsolete-key]';
  initiallyDisabled.value = '9';
  initiallyDisabled.disabled = true;
  form.appendChild(initiallyDisabled);
  button.click();
  // Simulate late stale section HTML while the checkout guard is waiting.
  positional.value = '12';
  staleKeyed.value = '10';
  await h.clock.tick(1000);
  assert.equal(h.document.submissions.length, 1);
  assert.deepEqual(h.document.submissions[0].fields, [
    ['note', note.value], ['updates[gift]', '1'], ['updates[hydration]', '3'], ['checkout', 'Checkout'],
  ]);
  assert.equal(positional.disabled, false);
  assert.equal(positional.value, '12', 'DOM control state is not rewritten or lost');
  assert.equal(staleKeyed.disabled, false, 'external associated controls are restored too');
  assert.equal(initiallyDisabled.disabled, true);
  assert.equal(form.children.length, 3, 'temporary hidden quantity controls are removed');
});

test('keyed quantity controls are cleaned up when native validation or another submit handler cancels', async () => {
  for (const reason of ['validation', 'handler']) {
    const h = environment({ items: [gift(), hydration(3)] });
    const { form, button } = h.form();
    const quantity = h.document.createElement('input');
    quantity.name = 'updates[]';
    quantity.value = '3';
    form.appendChild(quantity);
    if (reason === 'handler') h.document.addEventListener('submit', (event) => event.preventDefault());
    button.click();
    if (reason === 'validation') form.valid = false;
    await h.clock.tick(1000);
    assert.equal(h.document.submissions.length, 0);
    assert.equal(quantity.disabled, false);
    assert.equal(form.children.length, 2);
    assert.equal(button.getAttribute('aria-busy'), null);
  }
});

test('checkout fails safely if verified cart lines lack safe unique keys', async () => {
  for (const key of [undefined, '', 'gift', 'invalid[key]']) {
    const h = environment({ items: [gift(), hydration(3, { key })] });
    const { form, button } = h.form();
    const quantity = h.document.createElement('input');
    quantity.name = 'updates[]';
    quantity.value = '3';
    form.appendChild(quantity);
    button.click();
    await h.clock.tick(1000);
    assert.equal(h.document.submissions.length, 0);
    assert.equal(h.error().hidden, false);
    assert.equal(h.document.activeElement, h.error());
    assert.equal(quantity.disabled, false);
    assert.equal(form.children.length, 2);
  }
});

test('checkout links wait for pending mutations and reconciliation, with one activation for repeated clicks', async () => {
  const h = environment();
  const link = h.link('/fr/checkout?discount=KEEP');
  link.setAttribute('target', '_self');
  const mutation = deferred();
  h.emit(CART_EVENT, { promise: mutation.promise });
  link.click();
  link.click();
  await h.clock.tick(600);
  assert.equal(h.document.navigations.length, 0);
  h.items = [hydration(3)];
  mutation.resolve();
  await h.clock.tick(500);
  assert.equal(h.gifts().length, 1);
  assert.equal(h.document.navigations.length, 1);
  assert.equal(h.document.navigations[0].href, 'https://fortified.test/fr/checkout?discount=KEEP');
  assert.equal(h.document.navigations[0].target, '_self');
  assert.equal(link.getAttribute('aria-busy'), null);
});

test('checkout link replay retains modifier and target attributes', async () => {
  const h = environment();
  const link = h.link();
  link.setAttribute('target', '_blank');
  h.emit('click', { button: 0, ctrlKey: true }, link);
  await h.clock.tick(500);
  assert.equal(h.document.navigations.length, 1);
  assert.equal(h.document.navigations[0].event.ctrlKey, true);
  assert.equal(h.document.navigations[0].target, '_blank');
});

test('checkout mutation failure prevents navigation, focuses an accessible error, and can be retried', async () => {
  let fail = true;
  const h = environment({ items: [hydration(3)], intercept: (call) => {
    if (fail && call.method === 'POST') return response({}, 500);
  } });
  const link = h.link();
  link.click();
  await h.clock.tick(1000);
  assert.equal(h.document.navigations.length, 0);
  assert.equal(h.error().hidden, false);
  assert.equal(h.document.activeElement, h.error());
  assert.equal(link.getAttribute('aria-busy'), null);
  fail = false;
  link.click();
  await h.clock.tick(1000);
  assert.equal(h.document.navigations.length, 1);
  assert.equal(h.error().hidden, true);
});

test('rejected or didError cart promises prevent checkout instead of navigating with an uncertain cart', async () => {
  for (const reject of [true, false]) {
    const h = environment({ items: [hydration(3)] });
    const { button } = h.form();
    const mutation = deferred();
    h.emit(CART_EVENT, { promise: mutation.promise });
    button.click();
    await h.clock.tick(500);
    if (reject) mutation.reject(new Error('Cart quantity could not be saved'));
    else mutation.resolve({ detail: { didError: true } });
    await h.clock.tick(500);
    assert.equal(h.document.submissions.length, 0);
    assert.equal(h.error().hidden, false);
    assert.equal(h.document.activeElement, h.error());
    button.click();
    await h.clock.tick(1000);
    assert.equal(h.document.submissions.length, 1, 'a new deliberate checkout can retry');
  }
});

test('open drawer errors stay within its focus trap and retry does not submit checkout', async () => {
  const h = environment({ items: [hydration(3)], intercept: () => response({}, 503) });
  const drawer = h.document.createElement('cart-drawer-component');
  const dialog = h.document.createElement('dialog');
  dialog.setAttribute('open', '');
  const ctas = h.document.createElement('div');
  ctas.className = 'cart__ctas';
  drawer.appendChild(ctas);
  dialog.appendChild(drawer);
  h.document.body.appendChild(dialog);
  await assert.rejects(h.reconcile());
  assert.equal(h.error().parentNode, drawer);
  assert.equal(h.error().closest('dialog'), dialog);
  assert.equal(h.error().querySelector('button').type, 'button');
});
