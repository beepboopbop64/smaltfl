// Mask a page's text for "is it visual-first?" tests: mode 'letters' turns letters into dots and keeps digits and
// punctuation; mode 'all' turns every character into a dot. Text keeps its length, so the layout doesn't move. The
// text of <style>, <script> and <title> is left alone: it isn't on screen, and masking it would break the page.
// window.__unmaskText() puts the text back, so a tour can go on without reloading.
window.__maskText = (mode) => {
  const skip = new Set(['STYLE', 'SCRIPT', 'NOSCRIPT', 'TEXTAREA', 'TITLE']);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && skip.has(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  const undo = [];
  for (const n of nodes) {
    if (!n.textContent.trim()) continue;
    undo.push([n, n.textContent]);
    n.textContent = mode === 'all' ? n.textContent.replace(/\S/g, '•') : n.textContent.replace(/\p{L}/gu, '•');
  }
  window.__maskUndo = undo;
};
window.__unmaskText = () => {
  for (const [n, t] of window.__maskUndo ?? []) n.textContent = t;
  window.__maskUndo = [];
};
