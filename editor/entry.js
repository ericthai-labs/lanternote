// Copyright © 2026 Eric Thai - Thai Ba Hoa. Licensed under the Apache License 2.0 — see LICENSE.txt.
// Lanternote — Markdown editor (bundled by scripts/vendor.js into
// src/vendor/editor.js, exposed as window.LanternoteEditor).
// CodeMirror 6, with:
//   • Markdown + GFM highlighting, headings drawn larger;
//   • [[ completion of note names and #headings, # completion of tags;
//   • history, search (Ctrl+F), Tab indent, soft wrapping;
//   • Ctrl+B / Ctrl+I / Ctrl+K formatting, Ctrl+Enter toggles a task;
//   • pasted images handed to the app to store as attachments;
//   • live preview (editor/live-preview.js), switched on and off at run time.
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine, placeholder, dropCursor } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { livePreview } from './live-preview.js';

const style = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.6em', fontWeight: '700' },
  { tag: t.heading2, fontSize: '1.35em', fontWeight: '700' },
  { tag: t.heading3, fontSize: '1.2em', fontWeight: '650' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '650' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--link)' },
  { tag: t.url, color: 'var(--link)', opacity: '0.8' },
  { tag: t.monospace, fontFamily: 'ui-monospace, Consolas, monospace', background: 'var(--code-bg)' },
  { tag: t.quote, color: 'var(--muted)' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--faint)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: 'calc(var(--note-size, 16px) - 1px)', background: 'transparent', color: 'var(--text)' },
  '.cm-scroller': { fontFamily: 'var(--note-font, inherit)', lineHeight: '1.65' },
  '.cm-content': { maxWidth: 'var(--note-width, 780px)', margin: '0 auto', padding: '24px 32px 40vh', caretColor: 'var(--accent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { background: 'color-mix(in srgb, var(--accent-bg) 45%, transparent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { background: 'var(--accent-bg) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-wikilink': { color: 'var(--link)' },
  '.cm-tooltip': { background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', boxShadow: 'var(--shadow)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: 'var(--accent-bg)', color: 'var(--text)' },
  '.cm-completionDetail': { color: 'var(--muted)', fontStyle: 'normal', marginLeft: '8px' },
  '.cm-panels': { background: 'var(--bg2)', color: 'var(--text)', borderTop: '1px solid var(--line)' },
  '.cm-textfield': { background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)' },
  '.cm-button': { background: 'var(--bg3)', color: 'var(--text)', backgroundImage: 'none', border: '1px solid var(--line)' },
});

// wrap the selection (or the word) in a marker such as ** or _
function wrap(mark) {
  return (view) => {
    view.dispatch(view.state.changeByRange((r) => {
      const text = view.state.sliceDoc(r.from, r.to);
      if (text.startsWith(mark) && text.endsWith(mark) && text.length >= mark.length * 2) {
        return { changes: { from: r.from, to: r.to, insert: text.slice(mark.length, -mark.length) }, range: { anchor: r.from, head: r.to - mark.length * 2 } };
      }
      return { changes: [{ from: r.from, insert: mark }, { from: r.to, insert: mark }], range: { anchor: r.from + mark.length, head: r.to + mark.length } };
    }));
    return true;
  };
}
function toggleTask(view) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+)(\[[ xX]\]\s*)?/.exec(line.text);
  let change;
  if (m && m[2]) {
    const done = /\[[xX]\]/.test(m[2]);
    const at = line.from + m[1].length + 1;
    change = { from: at, to: at + 1, insert: done ? ' ' : 'x' };
  } else if (m) change = { from: line.from + m[1].length, insert: '[ ] ' };
  else { const ind = /^\s*/.exec(line.text)[0].length; change = { from: line.from + ind, insert: '- [ ] ' }; }
  view.dispatch({ changes: change });
  return true;
}
function link(view) {
  const r = view.state.selection.main;
  const text = view.state.sliceDoc(r.from, r.to);
  view.dispatch({ changes: { from: r.from, to: r.to, insert: `[[${text}]]` }, selection: { anchor: r.from + 2 + text.length } });
  return true;
}

export function create(parent, opts) {
  const dark = new Compartment();
  const lp = new Compartment();
  const lpExt = livePreview({ imageUrl: opts.imageUrl, onOpenLink: opts.onOpenLink });
  let isLive = opts.livePreview !== false;
  const completions = [];
  // [[note, [[note#heading, ![[embed
  if (opts.linkOptions) completions.push((ctx) => {
    const m = ctx.matchBefore(/\[\[[^[\]\n|]*$/);
    if (!m) return null;
    const q = m.text.slice(2);
    const list = opts.linkOptions(q);
    if (!list) return null;
    const after = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2);
    return {
      from: m.from + 2,
      filter: false,
      options: list.map((o) => ({ label: o.label, detail: o.detail, apply: o.insert + (after === ']]' ? '' : ']]'), type: o.type || 'text' })),
    };
  });
  if (opts.tagOptions) completions.push((ctx) => {
    const m = ctx.matchBefore(/(?:^|[\s(,;])#[\p{L}\p{N}_\-/]*$/u);
    if (!m) return null;
    const hash = m.text.lastIndexOf('#');
    const q = m.text.slice(hash + 1);
    if (!q && !ctx.explicit) return null;
    return { from: m.from + hash + 1, filter: false, options: opts.tagOptions(q).map((tg) => ({ label: tg.label, detail: tg.detail, type: 'keyword' })) };
  });

  let isDark = !!opts.dark;
  let view = null;
  // a fresh editor state: its own text, cursor and undo history
  const fresh = (doc) => EditorState.create({
    doc,
    extensions: [
        history(),
        drawSelection(),
        dropCursor(),
        highlightActiveLine(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        search({ top: true }),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of(() => ({ spellcheck: opts.spellcheck && opts.spellcheck() ? 'true' : 'false' })),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(style),
        autocompletion({ override: completions, activateOnTyping: true, maxRenderedOptions: 60 }),
        placeholder(opts.placeholder || 'Start writing…'),
        keymap.of([
          { key: 'Mod-b', run: wrap('**') },
          { key: 'Mod-i', run: wrap('*') },
          { key: 'Mod-k', run: link },
          { key: 'Mod-Enter', run: toggleTask },
          ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab,
        ]),
        theme,
        dark.of(EditorView.theme({}, { dark: isDark })),
        lp.of(isLive ? lpExt : []),
        EditorView.updateListener.of((u) => { if (u.docChanged && opts.onChange) opts.onChange(); if (u.docChanged && opts.onHistory) opts.onHistory(); }),
        EditorView.domEventHandlers({
          paste(e) {
            const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
            if (!files.length || !opts.onPasteFiles) return false;
            e.preventDefault();
            opts.onPasteFiles(files).then((text) => { if (text) view.dispatch(view.state.replaceSelection(text)); });
            return true;
          },
          drop(e) {
            const files = [...(e.dataTransfer?.files || [])];
            if (!files.length || !opts.onPasteFiles) return false;
            e.preventDefault();
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head;
            opts.onPasteFiles(files).then((text) => { if (text) view.dispatch({ changes: { from: pos, insert: text } }); });
            return true;
          },
        }),
    ],
  });
  view = new EditorView({ parent, state: fresh(opts.doc || '') });
  // Each note keeps its own state, so Ctrl+Z never reaches into another
  // note and coming back to a note keeps its undo history.
  const states = new Map();
  let key = null;

  return {
    get view() { return view; },
    getValue: () => view.state.doc.toString(),
    // show a note: reuse its state if the text is unchanged, else start fresh
    open(k, text) {
      if (key != null && key !== k) { states.set(key, view.state); if (states.size > 40) states.delete(states.keys().next().value); }
      const old = key === k ? view.state : states.get(k);
      states.delete(k);
      key = k;
      view.setState(old && old.doc.toString() === text ? old : fresh(text));
    },
    forget(k) { states.delete(k); if (key === k) key = null; },
    undo: () => { undo(view); view.focus(); },
    redo: () => { redo(view); view.focus(); },
    canUndo: () => undoDepth(view.state) > 0,
    canRedo: () => redoDepth(view.state) > 0,
    // replace the whole text, keeping the cursor near where it was
    setValue(text) {
      const head = Math.min(view.state.selection.main.head, text.length);
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: head } });
    },
    focus: () => view.focus(),
    setDark: (d) => {
      isDark = d;
      view.dispatch({ effects: dark.reconfigure(EditorView.theme({}, { dark: d })) });
      for (const [k, st] of states) states.set(k, st.update({ effects: dark.reconfigure(EditorView.theme({}, { dark: d })) }).state);
    },
    get livePreview() { return isLive; },
    setLivePreview(on) {
      isLive = !!on;
      const eff = lp.reconfigure(isLive ? lpExt : []);
      view.dispatch({ effects: eff });
      for (const [k, st] of states) states.set(k, st.update({ effects: eff }).state);
    },
    scrollToLine(n) {
      const line = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines)));
      view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'start' }) });
    },
    destroy: () => view.destroy(),
  };
}
