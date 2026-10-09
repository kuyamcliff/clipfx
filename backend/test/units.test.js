'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { html, raw, richText, formatBytes, formatDuration, formatCount } = require('../src/html');
const { buildSearch, resolutionLabel } = require('../src/models');
const { parseAssetFields, sanitizeFileName } = require('../src/routes/assets');
const { normalizeWebsite } = require('../src/routes/account');

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
  const tricky = String(richText('https://x.com/"onmouseover="alert(1)'));
  assert.ok(!/href="[^"]*"onmouseover/.test(tricky));
});

test('formatters', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(5 * 1024 ** 3), '5.0 GB');
  assert.equal(formatDuration(75), '1:15');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(formatCount(1234), '1.2k');
  assert.equal(formatCount(25000), '25k');
});

test('search query builder strips FTS syntax', () => {
  assert.equal(buildSearch('light-leak "OR" (4k)*'), '"light"* "leak"* "or"* "4k"*');
  assert.equal(buildSearch('   '), '');
});

test('resolution labels', () => {
  assert.equal(resolutionLabel(3840, 2160), '4K');
  assert.equal(resolutionLabel(1080, 1920), '1080p');
  assert.equal(resolutionLabel(640, 360), '640×360');
  assert.equal(resolutionLabel(null, null), '');
});

test('asset field parsing', () => {
  const { values, errors } = parseAssetFields({
    title: '  My   Pack ', category: 'luts', license: 'cc0', software: ['ae', 'bogus', 'ae'],
    tags: 'Film, #grain, x, Film, light leak!!', visibility: 'unlisted',
  });
  assert.deepEqual(errors, {});
  assert.equal(values.title, 'My Pack');
  assert.deepEqual(values.software, ['ae']);
  assert.deepEqual(values.tags, ['film', 'grain', 'light leak']);
  assert.equal(values.visibility, 'unlisted');
  assert.equal(parseAssetFields({ visibility: 'private' }).values.visibility, 'public');
});

test('file names are sanitized', () => {
  assert.equal(sanitizeFileName('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFileName('a"b\\c.mp4'), 'a_b_c.mp4');
  assert.equal(sanitizeFileName('we<ird>:name?.zip'), 'we_ird__name_.zip');
  assert.ok(sanitizeFileName(`${'x'.repeat(300)}.mov`).endsWith('.mov'));
});

test('website normalization', () => {
  assert.equal(normalizeWebsite('example.com').value, 'https://example.com/');
  assert.ok(normalizeWebsite('javascript:alert(1)').error);
  assert.ok(normalizeWebsite('localhost').error);
  assert.equal(normalizeWebsite('').value, '');
});
