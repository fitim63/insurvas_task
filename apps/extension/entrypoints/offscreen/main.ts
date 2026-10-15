import { browser } from 'wxt/browser';

// Offscreen document: the only MV3 context that can touch the clipboard without a
// focused page. Used to wipe a copied password 30 s after the popup closed.
browser.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg?.type !== 'offscreen:clearClipboard') return;
  const el = document.getElementById('clip') as HTMLTextAreaElement;
  el.value = ' ';
  el.select();
  document.execCommand('copy');
  el.value = '';
});
