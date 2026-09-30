// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — live preview for the Markdown editor.
// The text stays plain Markdown; only its look changes. Syntax marks (**, `,
// #, >, [[ ]], link targets…) are hidden everywhere except where the cursor
// is, so the line being typed shows its source and the rest reads like the
// reading view: bullets, checkboxes you can click, pictures, rules, links you
// can click (Ctrl+click: new tab, Alt+click: the other pane).
import { Decoration, ViewPlugin, WidgetType, EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

const hide = Decoration.replace({});

class Bullet extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-lp-bullet'; s.textContent = '•'; return s; }
}
class Check extends WidgetType {
  constructor(done, at) { super(); this.done = done; this.at = at; }
  eq(o) { return o.done === this.done && o.at === this.at; }
  toDOM(view) {
    const b = document.createElement('input');
    b.type = 'checkbox'; b.className = 'cm-lp-check'; b.checked = this.done;
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.at, to: this.at + 1, insert: this.done ? ' ' : 'x' } });
    });
    return b;
  }
  ignoreEvent() { return true; }
}
class Rule extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-lp-hr'; return s; }
}
class Picture extends WidgetType {
  constructor(url, alt, width) { super(); this.url = url; this.alt = alt; this.width = width; }
  eq(o) { return o.url === this.url && o.width === this.width; }
  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-lp-img'; img.src = this.url; img.alt = this.alt || '';
    if (this.width) img.style.width = this.width + 'px';
    return img;
  }
}

// does any selection range touch [from, to]?
const touches = (state, from, to) => state.selection.ranges.some((r) => r.from <= to && r.to >= from);
// is the cursor on one of the lines of [from, to]?
function onLines(state, from, to) {
  const a = state.doc.lineAt(from).from, b = state.doc.lineAt(to).to;
  return touches(state, a, b);
}
const CODE = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText', 'HTMLBlock', 'Comment']);
const inCode = (tree, pos) => { for (let n = tree.resolveInner(pos, 1); n; n = n.parent) if (CODE.has(n.name)) return true; return false; };

// end of the front matter (--- … --- at the very top), or 0
function fmEnd(doc) {
  if (doc.lines < 2 || doc.line(1).text.trimEnd() !== '---') return 0;
  for (let i = 2; i <= Math.min(doc.lines, 400); i++) { const t = doc.line(i).text.trimEnd(); if (t === '---' || t === '...') return doc.line(i).to; }
  return 0;
}

function build(view, opts) {
  const { state } = view;
  const tree = syntaxTree(state);
  const out = [];
  // front matter: the grammar reads it as a rule and a heading — show it as plain properties instead
  const fm = fmEnd(state.doc);
  for (let p = 0; fm && p <= fm;) { const l = state.doc.lineAt(p); out.push(Decoration.line({ class: 'cm-lp-fm' }).range(l.from)); p = l.to + 1; }
  const add = (from, to, deco) => { if (to >= from) out.push(deco.range(from, to)); };
  const line = (pos, cls) => out.push(Decoration.line({ class: cls }).range(state.doc.lineAt(pos).from));

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from, to,
      enter: (n) => {
        if (n.from < fm) return n.to > fm;
        const name = n.name;
        if (name === 'ATXHeading1' || name === 'ATXHeading2' || name === 'ATXHeading3' || name === 'ATXHeading4' || name === 'ATXHeading5' || name === 'ATXHeading6') {
          const mark = n.node.firstChild;
          if (mark && mark.name === 'HeaderMark' && !onLines(state, n.from, n.to)) {
            const sp = state.sliceDoc(mark.to, mark.to + 1) === ' ' ? 1 : 0;
            add(mark.from, mark.to + sp, hide);
          }
          return;
        }
        if (name === 'Blockquote') {
          for (let p = n.from; p <= n.to;) { const l = state.doc.lineAt(p); line(l.from, 'cm-lp-quote'); p = l.to + 1; }
          return;
        }
        if (name === 'QuoteMark') {
          if (!onLines(state, n.from, n.to)) add(n.from, n.to + (state.sliceDoc(n.to, n.to + 1) === ' ' ? 1 : 0), hide);
          return false;
        }
        if (name === 'ListItem') {
          const mark = n.node.firstChild;
          if (!mark || mark.name !== 'ListMark' || !/^[-*+]$/.test(state.sliceDoc(mark.from, mark.to))) return;
          const task = mark.nextSibling && mark.nextSibling.name === 'Task' ? mark.nextSibling.firstChild : null;
          if (task && task.name === 'TaskMarker') {
            const done = /x/i.test(state.sliceDoc(task.from, task.to));
            if (done) line(task.from, 'cm-lp-done');
            if (!onLines(state, task.from, task.to)) {
              const sp = state.sliceDoc(task.to, task.to + 1) === ' ' ? 1 : 0;
              add(mark.from, task.to + sp, Decoration.replace({ widget: new Check(done, task.from + 1) }));
            }
          } else if (!onLines(state, mark.from, mark.to)) add(mark.from, mark.to, Decoration.replace({ widget: new Bullet() }));
          return;
        }
        if (name === 'HorizontalRule') {
          if (!onLines(state, n.from, n.to)) add(n.from, n.to, Decoration.replace({ widget: new Rule() }));
          return false;
        }
        if (name === 'FencedCode' || name === 'CodeBlock') {
          for (let p = n.from; p <= n.to;) { const l = state.doc.lineAt(p); line(l.from, 'cm-lp-code'); p = l.to + 1; }
          return false;
        }
        if (name === 'Emphasis' || name === 'StrongEmphasis' || name === 'Strikethrough' || name === 'InlineCode') {
          if (touches(state, n.from, n.to)) return;
          for (let c = n.node.firstChild; c; c = c.nextSibling) {
            if (c.name === 'EmphasisMark' || c.name === 'StrikethroughMark' || c.name === 'CodeMark') add(c.from, c.to, hide);
          }
          return;
        }
        if (name === 'Image') {
          const url = n.node.getChild('URL');
          const src = url && opts.imageUrl ? opts.imageUrl(state.sliceDoc(url.from, url.to)) : null;
          if (src && !touches(state, n.from, n.to)) {
            const alt = /^!\[([^\]]*)\]/.exec(state.sliceDoc(n.from, n.to));
            add(n.from, n.to, Decoration.replace({ widget: new Picture(src, alt ? alt[1] : '') }));
          }
          return false;
        }
        if (name === 'Link') {
          if (touches(state, n.from, n.to)) return false;
          const url = n.node.getChild('URL');
          const marks = n.node.getChildren('LinkMark');
          if (!url || marks.length < 2) return false; // [text] without a target: leave it
          const href = state.sliceDoc(url.from, url.to);
          add(marks[0].from, marks[0].to, hide);
          add(marks[0].to, marks[1].from, Decoration.mark({ class: 'cm-lp-link', attributes: { 'data-href': href, title: href } }));
          add(marks[1].from, n.to, hide); // ](url "title")
          return false;
        }
      },
    });

    // what the Markdown grammar does not know: [[wiki links]], ![[embeds]], ==highlights==, #tags
    const text = state.sliceDoc(from, to);
    for (const m of text.matchAll(/(!?)\[\[([^[\]\n]+?)\]\]/g)) {
      const a = from + m.index, b = a + m[0].length;
      if (a < fm || inCode(tree, a)) continue;
      const inner = m[2].replace(/\\\|/g, '|');
      const bar = inner.indexOf('|');
      const target = (bar < 0 ? inner : inner.slice(0, bar)).trim();
      const alias = bar < 0 ? '' : inner.slice(bar + 1).trim();
      if (touches(state, a, b)) continue;
      if (m[1]) {
        const src = opts.imageUrl ? opts.imageUrl(target, true) : null;
        if (src) {
          const w = /^(\d+)(?:x\d+)?$/.exec(alias);
          add(a, b, Decoration.replace({ widget: new Picture(src, alias, w ? +w[1] : 0) }));
          continue;
        }
      }
      const open = a + m[1].length + 2, close = b - 2;
      // the part shown: the alias, or the target
      const shownFrom = bar < 0 ? open : open + m[2].indexOf('|') + 1;
      add(a, shownFrom, hide);
      add(shownFrom, close, Decoration.mark({ class: 'cm-lp-link cm-wikilink' + (m[1] ? ' cm-lp-embed' : ''), attributes: { 'data-target': target, title: target } }));
      add(close, b, hide);
    }
    for (const m of text.matchAll(/==(?=\S)([^\n=]*?\S)==/g)) {
      const a = from + m.index, b = a + m[0].length;
      if (a < fm || inCode(tree, a)) continue;
      add(a, b, Decoration.mark({ class: 'cm-lp-mark' }));
      if (!touches(state, a, b)) { add(a, a + 2, hide); add(b - 2, b, hide); }
    }
    for (const m of text.matchAll(/(^|[\s(,;])(#[\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gmu)) {
      const a = from + m.index + m[1].length, b = a + m[2].length;
      if (a < fm || inCode(tree, a)) continue;
      const l = state.doc.lineAt(a);
      if (/^#{1,6}\s/.test(l.text) && a === l.from) continue; // a heading, not a tag
      add(a, b, Decoration.mark({ class: 'cm-lp-tag' }));
    }
  }
  return Decoration.set(out, true);
}

export function livePreview(opts) {
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = build(view, opts); }
    update(u) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view, opts);
    }
  }, { decorations: (v) => v.decorations });

  const clicks = EditorView.domEventHandlers({
    mousedown(e) {
      const el = e.target.closest && e.target.closest('.cm-lp-link');
      if (!el || e.button !== 0 || e.shiftKey || !opts.onOpenLink) return false;
      e.preventDefault();
      opts.onOpenLink(el.dataset.target != null ? { target: el.dataset.target } : { href: el.dataset.href }, { newTab: e.ctrlKey || e.metaKey, otherPane: e.altKey });
      return true;
    },
  });

  const theme = EditorView.theme({
    '.cm-lp-link': { color: 'var(--link)', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'color-mix(in srgb, var(--link) 35%, transparent)', textUnderlineOffset: '3px' },
    '.cm-lp-embed::before': { content: '"↪ "', color: 'var(--faint)' },
    '.cm-lp-mark': { background: 'var(--mark-bg, color-mix(in srgb, var(--accent) 28%, transparent))', borderRadius: '3px' },
    '.cm-lp-tag': { background: 'var(--accent-bg)', color: 'var(--accent)', borderRadius: '10px', padding: '0 6px' },
    '.cm-lp-bullet': { color: 'var(--accent)', display: 'inline-block', width: '0.9em' },
    '.cm-lp-check': { margin: '0 6px 0 0', verticalAlign: 'middle', cursor: 'pointer', accentColor: 'var(--accent)' },
    '.cm-lp-done': { color: 'var(--faint)', textDecoration: 'line-through' },
    '.cm-lp-hr': { display: 'inline-block', width: '100%', borderTop: '1px solid var(--line)', verticalAlign: 'middle' },
    '.cm-lp-quote': { borderLeft: '3px solid var(--accent)', paddingLeft: '14px !important', color: 'var(--muted)' },
    '.cm-lp-code': { background: 'var(--code-bg)', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.92em' },
    '.cm-lp-fm': { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.85em', color: 'var(--muted)', background: 'var(--bg2)' },
    '.cm-lp-fm *': { fontSize: 'inherit !important', fontWeight: 'normal !important' },
    '.cm-lp-img': { display: 'block', maxWidth: '100%', borderRadius: '4px', margin: '4px 0' },
  });
  return [plugin, clicks, theme];
}
