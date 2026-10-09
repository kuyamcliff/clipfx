'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { html, raw, richText, formatBytes, formatDuration, formatCount } = require('../src/html');
const { resolutionLabel, decorate, buildCatalog } = require('../src/decorate');

test('html escapes interpolations but not raw()', () => {
  assert.equal(String(html`<p title="${'"x"'}">${'<b>'}${raw('<i>ok</i>')}${[1, '<']}</p>`), '<p title="&quot;x&quot;">&lt;b&gt;<i>ok</i>1&lt;</p>');
  assert.equal(String(html`${null}${undefined}${false}${0}`), '0');
});

test('richText linkifies safely', () => {
  const out = String(richText('see https://example.com/a?b=1&c=2.\n\n<script>x</script> "quote"'));
  assert.ok(out.includes('<a href="https://example.com/a?b=1&amp;c=2" rel="nofollow ugc noopener" target="_blank">'));
  assert.ok(out.includes('</a>.'));
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(!out.includes('<script>'));
  assert.ok(!/href="[^"]*"onmouseover/.test(String(richText('https://x.com/"onmouseover="alert(1)'))));
});

test('formatters', () => {
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatDuration(75), '1:15');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(formatCount(1234), '1.2k');
  assert.equal(formatCount(25000), '25k');
});

test('resolution labels and decorate', () => {
  assert.equal(resolutionLabel(3840, 2160), '4K');
  assert.equal(resolutionLabel(1080, 1920), '1080p');
  assert.equal(resolutionLabel(640, 360), '640×360');
  const catalog = buildCatalog({
    categories: [{ id: 'luts', name: 'LUTs' }, { id: 'other', name: 'Other' }], software: [{ id: 'ae', name: 'After Effects' }],
    licenses: [{ id: 'cc0', short: 'CC0' }], kinds: { lut: { name: 'LUT' }, archive: { name: 'Archive' } },
  });
  const a = decorate({ slug: 'abc', category: 'luts', license: 'cc0', software: ['ae', 'nope'], file_kind: 'lut', file_size: 2048, width: 1080, height: 1920 }, catalog);
  assert.equal(a.url, '/a/abc');
  assert.equal(a.category.name, 'LUTs');
  assert.deepEqual(a.software.map((s) => s.name), ['After Effects']);
  assert.equal(a.sizeLabel, '2.0 KB');
  assert.equal(a.vertical, true);
});
