import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderInline, markdownTitle } from '../js/lib/markdown.js';

test('Überschriften, Absätze, Listen', () => {
  const html = renderMarkdown('# Titel\n\nAbsatz eins\nweiter.\n\n- a\n- b\n\n## Zwei');
  assert.equal(html, '<h1>Titel</h1>\n<p>Absatz eins weiter.</p>\n<ul><li>a</li><li>b</li></ul>\n<h2>Zwei</h2>');
});

test('Inline: fett, kursiv, code, Link', () => {
  assert.equal(renderInline('**fett** und *kursiv* `x` [Rechner](#/calc)'), '<strong>fett</strong> und <em>kursiv</em> <code>x</code> <a href="#/calc">Rechner</a>');
  assert.equal(renderInline('[extern](https://example.org)'), '<a href="https://example.org" target="_blank" rel="noopener">extern</a>');
});

test('HTML wird maskiert, unsichere Links entfernt', () => {
  assert.equal(renderMarkdown('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
  assert.equal(renderInline('[k](javascript:alert)'), 'k');
});

test('Zitat und Titel', () => {
  assert.equal(renderMarkdown('> Zitat\n> zwei'), '<blockquote><p>Zitat zwei</p></blockquote>');
  assert.equal(markdownTitle('# Alles ist eine Stufe\n\nText'), 'Alles ist eine Stufe');
  assert.equal(markdownTitle('kein Titel'), '');
});

test('Sternchen in Zahlen bleiben erhalten', () => {
  assert.equal(renderInline('1,4 × 1,4 ≈ 2'), '1,4 × 1,4 ≈ 2');
});
