// Kleiner Markdown-Parser für die Lernkarten. Absichtlich klein:
// Überschriften (#, ##, ###), Absätze, Listen (-), Zitate (>), **fett**, *kursiv*, `code`, [Text](Ziel).
// HTML im Quelltext wird maskiert, Links nur mit http(s), mailto oder #-Zielen.

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderInline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    if (!/^(https?:|mailto:|#)/.test(href)) return label;
    const ext = /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${href}"${ext}>${label}</a>`;
  });
  return s;
}

export function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null;
  let quote = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${renderInline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<ul>${list.map((i) => `<li>${renderInline(i)}</li>`).join('')}</ul>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote><p>${renderInline(quote.join(' '))}</p></blockquote>`); quote = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flushPara(); flushList(); flushQuote(); out.push(`<h${h[1].length}>${renderInline(h[2])}</h${h[1].length}>`); continue; }
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) { flushPara(); flushQuote(); (list ||= []).push(li[1]); continue; }
    const q = line.match(/^>\s?(.*)$/);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }
    if (line.trim() === '') { flushPara(); flushList(); flushQuote(); continue; }
    flushList(); flushQuote();
    para.push(line.trim());
  }
  flushPara(); flushList(); flushQuote();
  return out.join('\n');
}

/** Erste Überschrift als Titel, falls vorhanden. */
export function markdownTitle(md) {
  const m = String(md || '').match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}
