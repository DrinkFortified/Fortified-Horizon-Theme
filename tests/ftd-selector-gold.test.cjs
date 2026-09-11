/* Focused Gold runtime tests. No DOM package or production test exports needed.
   Browser QA separately exercises real card/plan/retry controls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/ftd-selector-gold-core.js'), 'utf8');
function extract(name) {
  const single = source.match(new RegExp('^  function ' + name + '\\([^\\n]*\\) \\{[^\\n]*\\}$', 'm'));
  if (single) return single[0];
  const start = source.indexOf('  function ' + name + '(');
  assert.notEqual(start, -1, 'Missing runtime function: ' + name);
  const end = source.indexOf('\n  }', start);
  assert.notEqual(end, -1, 'Missing function end: ' + name);
  return source.slice(start, end + 4);
}
const functions = [
  'selectedPlanId', 'isSubscription', 'qualifyingGiftQuantity', 'giftQualifies',
  'desiredItems', 'buildItems', 'activeAddons', 'applyQty', 'reconcileGift',
  'commitToCart', 'sweepUnearnedGift', 'retryGiftSync', 'recoverCommittedCart', 'doCheckout'
].map(extract).join('\n');

function harness(options = {}) {
  const log = [];
  const selection = { variantId: '101', productType: 'Hydration', qty: 3,
    planMonthly: '201', planQuarterly: '301', fnLabel: 'Hydration', flavorName: 'Citrus' };
  const finalCart = { items: [
    { variant_id: 101, quantity: 3, product_type: 'Hydration',
      selling_plan_allocation: { selling_plan: { id: 201 } } },
    { variant_id: 999, quantity: 1, product_type: 'Creatine' }
  ] };
  const config = { variantId: 999, price: 0, available: true, minimum: 3, productType: 'Hydration' };
  const service = {
    config,
    giftItem: () => ({ id: 999, quantity: 1 }),
    qualifyingQuantity(cart) {
      return cart.items.reduce((n, line) =>
        String(line.product_type || '').trim().toLowerCase() === 'hydration' &&
        line.selling_plan_allocation?.selling_plan?.id ? n + line.quantity : n, 0);
    },
    async reconcile() {
      log.push('reconcile');
      if (options.syncError) throw options.syncError;
      return finalCart;
    }
  };
  const ctx = {
    state: { step: 'products', plan: 'monthly', selections: { 101: selection } },
    window: { FtdCreatineGift: service, location: { href: '' } },
    giftService: service, giftConfig: config, GIFT_MIN: 3, GIFT_ON: true,
    CART_SEL: '_sel', CART_OWNER: 'ftdc-d', cartRead: null, busy: false,
    CTA_ADDS_TO_CART: options.cta !== false, LOOP_TIMEOUT_MS: 1,
    giftSyncRetryBusy: false, GIFT_SYNC_NOTICE: 'Your items are already in your cart. Retry gift sync.',
    $: () => null, $$: () => [], txt: () => '$24.00', creatineQty: () => 0,
    parseMoney: () => 2400, fmtMoney: n => '$' + (n / 100).toFixed(2),
    setAdvanceDisabled() {}, updateBar() {}, canProc: () => true,
    clearGiftSyncNotice() {}, applyDiscountInPlace: async () => {},
    withTimeout: fn => fn(), patchLoopBundle: async () => {},
    showCartError: e => log.push({ error: e.message }),
    showGiftSyncNotice: (message, retry) => log.push({ notice: message, retry }),
    announceCartUpdate: async (cart, action) => { log.push({ announce: action, cart }); },
    openCartDrawer: () => { log.push('drawer'); return true; },
    console: { warn() {} },
    async cartPost(url, payload) {
      log.push({ url, payload });
      if (options.addError) throw options.addError;
      return { items: payload.items };
    },
    async getCart() {
      log.push('read');
      if (options.readError) throw options.readError;
      return finalCart;
    }
  };
  ctx.totalQty = () => Object.values(ctx.state.selections).reduce((n, s) => n + s.qty, 0);
  ctx.clearDraft = () => { ctx.state.selections = {}; log.push('clear'); };
  vm.createContext(ctx);
  vm.runInContext(functions, ctx);
  return { ctx, log, selection, finalCart, service };
}

test('qualifies only selected Hydration with the current valid subscription plan', () => {
  const { ctx, selection } = harness();
  assert.equal(ctx.giftQualifies(), true);
  selection.qty = 2;
  ctx.state.selections[102] = { ...selection, variantId: '102', qty: 20, productType: 'Protein' };
  ctx.state.selections[103] = { ...selection, variantId: '103', qty: 20, planMonthly: '' };
  assert.equal(ctx.qualifyingGiftQuantity(), 2);
  assert.equal(ctx.giftQualifies(), false);
  ctx.state.plan = 'onetime';
  assert.equal(ctx.qualifyingGiftQuantity(), 0);
  ctx.state.plan = 'quarterly';
  assert.equal(ctx.selectedPlanId(selection), 301);
  ctx.GIFT_ON = false;
  assert.equal(ctx.giftQualifies(), false);
});

test('both payload builders exclude gifts and disabled paid Creatine; one-time has no plan', () => {
  const { ctx } = harness();
  ctx.$ = selector => selector === '[data-creatine-card]' ? { dataset: { variant: '999' } }
    : selector === '[data-creatine2-input]' ? { checked: true } : null;
  for (const plan of ['monthly', 'quarterly', 'onetime']) {
    ctx.state.plan = plan;
    for (const name of ['desiredItems', 'buildItems']) {
      const items = ctx[name]();
      assert.equal(items.length, 1);
      assert.equal(items[0].id, 101);
      assert.equal(items[0].selling_plan, plan === 'monthly' ? 201 : plan === 'quarterly' ? 301 : undefined);
    }
  }
});

test('invalid subscription IDs reject both builders and commit before posting', async () => {
  const { ctx, selection, log } = harness();
  for (const plan of ['monthly', 'quarterly']) {
    ctx.state.plan = plan;
    const key = plan === 'monthly' ? 'planMonthly' : 'planQuarterly';
    for (const value of ['', 0, -1, '201junk', '1.5', 'Infinity', '9007199254740992']) {
      selection[key] = value;
      assert.equal(ctx.qualifyingGiftQuantity(), 0);
      assert.throws(() => ctx.desiredItems(), /Nothing was added/);
      assert.throws(() => ctx.buildItems(), /Nothing was added/);
      await assert.rejects(ctx.commitToCart(), /Nothing was added/);
    }
  }
  assert.equal(log.length, 0);
});

test('applyQty preserves product type; summary gift has exact title and no invented savings', () => {
  const { ctx } = harness();
  ctx.applyQty({ dataset: { variantId: '101', productType: 'Hydration',
    planMonthly: '201', planQuarterly: '301' }, classList: { add() {} } }, 3);
  assert.equal(ctx.state.selections[101].productType, 'Hydration');
  const addon = ctx.activeAddons()[0];
  assert.equal(addon.name, 'FREE Lifetime Creatine');
  assert.match(addon.note, /first order.*renewals managed by your subscription/);
  assert.equal(addon.cents, 0);
  assert.equal(addon.savedCents, 0);
});

test('commit preserves add errors instead of hiding them behind the compatibility catch', async () => {
  const addError = new Error('add rejected');
  const { ctx, log } = harness({ addError });
  await assert.rejects(ctx.commitToCart(), error => error === addError);
  assert.equal(log.length, 1);
  assert.equal(log[0].url, '/cart/add.js');
});

test('commit returns the reconciled final cart and opens only after reconciliation', async () => {
  const { ctx, log, finalCart } = harness();
  await ctx.doCheckout();
  assert.equal(log[0].url, '/cart/add.js');
  assert.equal(log[0].payload.items.length, 1);
  assert.equal(log[1], 'reconcile');
  const announced = log.find(entry => entry.announce);
  assert.equal(announced.cart, finalCart);
  assert.equal(announced.announce, 'add');
  assert.ok(log.indexOf('reconcile') < log.indexOf(announced));
  assert.ok(log.indexOf(announced) < log.indexOf('drawer'));
  assert.equal(ctx.totalQty(), 0);
});

test('gift failure and failed fallback read are partial successes with safe retry', async () => {
  for (const readError of [null, new Error('read failed')]) {
    const { ctx, log, service, finalCart } = harness({ syncError: new Error('gift failed'), readError });
    await ctx.doCheckout();
    assert.equal(ctx.totalQty(), 0);
    assert.ok(log.includes('drawer'));
    assert.ok(log.some(entry => /already in your cart/.test(entry.notice || '')));
    assert.equal(log.filter(entry => entry.url === '/cart/add.js').length, 1);
    assert.equal(log.filter(entry => entry.error).length, 0);
    service.reconcile = async () => finalCart;
    await ctx.retryGiftSync();
    assert.equal(log.filter(entry => entry.url === '/cart/add.js').length, 1);
    assert.ok(log.some(entry => entry.announce === 'update'));
  }
});

test('checkout read failures after a successful add also clear the draft safely', async () => {
  const { ctx, log } = harness({ cta: false, readError: new Error('read failed') });
  await ctx.doCheckout();
  assert.equal(ctx.totalQty(), 0);
  assert.ok(log.some(entry => /already in your cart/.test(entry.notice || '')));
  assert.equal(log.filter(entry => entry.url === '/cart/add.js').length, 1);
  assert.equal(ctx.window.location.href, '');
});

test('legacy shim delegates safely, but Gold has no sweep handlers or boot sweep', async () => {
  const { ctx, log } = harness({ syncError: new Error('unavailable') });
  await ctx.sweepUnearnedGift();
  assert.deepEqual(log, ['reconcile']);
  assert.doesNotMatch(source, /function (creatineIsGift|scheduleSweep|onCartChanged)\(/);
  assert.doesNotMatch(source, /SWEEP_MAX_WRITES|^\s+sweepUnearnedGift\(\);/m);
  assert.doesNotMatch(extract('desiredItems'), /_role = 'creatine'|selling_plan: p50/);
});
