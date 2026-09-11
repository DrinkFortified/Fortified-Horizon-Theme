const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/component-cart-items.js'), 'utf8');
const body = source.match(/const body = JSON\.stringify\((\{[\s\S]*?\})\);/)[1];
const payload = new Function('lineId', 'line', 'quantity', 'sectionsToUpdate', 'window', `return (${body})`);

test('native quantity changes address the hydration key even if its old index is now a gift', () => {
  const result = payload('hydration:stable-key', 1, 3, new Set(['cart']), {location:{pathname:'/cart'}});
  assert.equal(result.id, 'hydration:stable-key');
  assert.equal(result.quantity, 3);
  assert(!('line' in result));
  assert.equal(result.sections, 'cart');
});

test('native removals use the selected line key, not a shifted position', () => {
  const result = payload('hydration:second-key', 2, 0, new Set(['drawer']), {location:{pathname:'/'}});
  assert.equal(result.id, 'hydration:second-key');
  assert.equal(result.quantity, 0);
  assert(!('line' in result));
  assert.match(source, /if \(!lineId\) \{[\s\S]*?sectionRenderer\.renderSection[\s\S]*?return;/);
});

test('quantity identity is captured before debounce and resolved against current rows after morphing', () => {
  assert.match(source, /#quantityLineKeys\.set\(event, row\.dataset\.key\);\s*this\.#debouncedOnChange\(event\)/);
  assert.match(source, /addEventListener\(ThemeEvents\.quantitySelectorUpdate, this\.#queueQuantityChange\)/);
  const handler = source.match(/#onQuantityChange\(event\) \{([\s\S]*?)\n  \}/)[1];
  assert.match(handler, /#quantityLineKeys\.get\(event\)/);
  assert.match(handler, /findIndex\(\(row\) => row\.dataset\.key === lineId\)/);
  assert.doesNotMatch(handler, /cartLine: line/);
  const oldRows = [{dataset:{key:'gift'}},{dataset:{key:'hydration-A'}},{dataset:{key:'hydration-B'}}];
  const capturedKey = oldRows[1].dataset.key;
  const currentRows = oldRows.slice(1);
  const currentLine = currentRows.findIndex(row => row.dataset.key === capturedKey) + 1;
  const result = payload(capturedKey, currentLine, 2, new Set(['cart']), {location:{pathname:'/cart'}});
  assert.equal(result.id, 'hydration-A');
  assert.equal(currentLine, 1);
});
