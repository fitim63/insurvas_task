import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { findFillableFields, fillLogin, readCredentials } from '@/lib/forms';
import { send, type CapturePrompt, type MatchSummary, type TabMessage } from '@/lib/messages';
import { el, Overlay } from './ui';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  runAt: 'document_idle',
  main(ctx) {
    let overlay: Overlay | null = null;
    const ui = () => (overlay ??= new Overlay());

    // ------------------------------------------------------------ inline icons

    const icons = new Map<HTMLInputElement, HTMLButtonElement>();
    let menu: { el: HTMLDivElement; field: HTMLInputElement } | null = null;

    function closeMenu() {
      menu?.el.remove();
      menu = null;
    }

    function position() {
      for (const [field, icon] of icons) {
        const r = field.getBoundingClientRect();
        const visible = field.isConnected && r.width > 30 && r.height > 12 && r.bottom > 0 && r.top < window.innerHeight;
        icon.style.display = visible ? 'flex' : 'none';
        if (!visible) continue;
        icon.style.left = `${r.right - 28}px`;
        icon.style.top = `${r.top + (r.height - 22) / 2}px`;
      }
      if (menu) {
        const r = menu.field.getBoundingClientRect();
        menu.el.style.top = `${r.bottom + 6}px`;
        menu.el.style.left = `${Math.min(r.left, window.innerWidth - menu.el.offsetWidth - 8)}px`;
      }
    }

    function scan() {
      for (const [field, icon] of icons) {
        if (!field.isConnected) {
          icon.remove();
          icons.delete(field);
        }
      }
      const fields = findFillableFields();
      if (fields.length) ui().ensureMounted();
      for (const field of fields) {
        if (icons.has(field)) continue;
        icons.set(field, ui().makeIcon(() => void openMenu(field)));
      }
      position();
    }

    async function openMenu(field: HTMLInputElement) {
      if (menu?.field === field) return closeMenu();
      closeMenu();
      const m = ui().menu(field.getBoundingClientRect());
      menu = { el: m, field };
      const body = el('div', { class: 'msg', text: 'Loading…' });
      m.appendChild(body);
      try {
        const res = await send<{ locked: boolean; matches: MatchSummary[] }>({ type: 'cs:getMatches' });
        body.remove();
        if (res.locked) return renderLocked(m);
        if (!res.matches.length) {
          m.appendChild(el('div', { class: 'msg', text: 'No saved logins for this site yet. Sign in and Secure Vault will offer to save it.' }));
          return;
        }
        const list = el('div', { class: 'list' });
        for (const match of res.matches) list.appendChild(matchRow(match, field));
        m.appendChild(list);
        (list.firstElementChild as HTMLElement | null)?.focus();
      } catch (e) {
        body.textContent = e instanceof Error ? e.message : 'Something went wrong';
      }
    }

    function renderLocked(m: HTMLDivElement) {
      const msg = el('div', { class: 'msg' }, [
        el('b', { text: 'Vault is locked. ' }),
        document.createTextNode('Unlock it from the toolbar icon or press Ctrl+Shift+L.'),
      ]);
      const btn = el('button', { class: 'btn primary', text: 'Unlock' });
      btn.addEventListener('click', () => {
        void send({ type: 'cs:openPopup' });
        closeMenu();
      });
      m.append(msg, el('div', { class: 'actions' }, [btn]));
      m.querySelector<HTMLElement>('.actions')!.style.cssText = 'margin:0;padding:0 12px 12px';
    }

    function matchRow(match: MatchSummary, field: HTMLInputElement): HTMLButtonElement {
      const row = el('button', { class: 'row' }, [
        el('div', { class: 'avatar', text: (match.title || '?').charAt(0).toUpperCase() }),
        el('div', { class: 'meta' }, [
          el('div', { class: 'title', text: match.title }),
          el('div', { class: 'sub', text: match.username || '(no username)' }),
        ]),
      ]);
      if (match.shared) row.appendChild(el('span', { class: 'tag', text: 'Shared' }));
      row.type = 'button';
      row.addEventListener('click', async () => {
        try {
          // The password is only released by the background now, after an explicit click,
          // and only if the item matches this frame's domain.
          const creds = await send<{ username: string; password: string }>({ type: 'cs:fill', itemId: match.id });
          closeMenu();
          fillLogin(creds, field);
        } catch (e) {
          row.querySelector('.sub')!.textContent = e instanceof Error ? e.message : 'Fill failed';
        }
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') (row.nextElementSibling as HTMLElement | null)?.focus();
        if (e.key === 'ArrowUp') (row.previousElementSibling as HTMLElement | null)?.focus();
      });
      return row;
    }

    // ------------------------------------------------------------ capture

    let lastSent = '';
    let lastSentAt = 0;

    function captureFrom(scope: Element | null) {
      const creds = readCredentials(scope);
      if (!creds) return;
      const key = `${creds.username}\u0000${creds.password}`;
      if (key === lastSent && Date.now() - lastSentAt < 3000) return;
      lastSent = key;
      lastSentAt = Date.now();
      if (!creds.password) {
        void send({ type: 'cs:noteUsername', username: creds.username }).catch(() => {});
        return;
      }
      void send({ type: 'cs:capture', username: creds.username, password: creds.password })
        .then(() => {
          // SPA logins don't navigate, so check for a prompt shortly after submitting.
          ctx.setTimeout(() => void checkPrompt(), 1500);
        })
        .catch(() => {});
    }

    const SUBMIT_TEXT = /log ?in|sign ?in|continue|next|submit|enter|anmelden|connexion|entrar|iniciar/i;

    document.addEventListener('submit', (e) => captureFrom(e.target as Element), true);
    document.addEventListener(
      'click',
      (e) => {
        const t = (e.target as Element | null)?.closest?.('button, input[type="submit"], input[type="button"], [role="button"]');
        if (!t) return;
        const label = t.textContent?.trim() || (t as HTMLInputElement).value || t.getAttribute('aria-label') || '';
        const isSubmit = (t as HTMLButtonElement).type === 'submit' || SUBMIT_TEXT.test(label);
        if (isSubmit) captureFrom(t);
      },
      true,
    );
    document.addEventListener(
      'keydown',
      (e) => {
        const t = e.target;
        if (e.key === 'Enter' && t instanceof HTMLInputElement && (t.type === 'password' || t.form)) captureFrom(t);
      },
      true,
    );

    // ------------------------------------------------------------ save / update banner (top frame only)

    let banner: HTMLDivElement | null = null;

    async function checkPrompt() {
      if (window.top !== window || banner) return;
      const prompt = await send<(CapturePrompt & { locked: boolean }) | null>({ type: 'cs:getPrompt' }).catch(() => null);
      if (prompt) showBanner(prompt);
    }

    function showBanner(p: CapturePrompt & { locked: boolean }) {
      ui().ensureMounted();
      banner = ui().banner();
      const title = p.locked
        ? 'Unlock Secure Vault to save this login'
        : p.kind === 'update'
          ? 'Update password in your Vault?'
          : 'Save login credentials to your Vault?';
      const detail = p.kind === 'update' ? `${p.itemTitle} · ${p.username}` : `${p.username || '(no username)'} on ${p.host}`;
      const err = el('div', { class: 'err' });
      banner.append(
        el('div', { class: 'top' }, [Overlay.logo(), el('div', {}, [el('h3', { text: title }), el('p', { text: detail })])]),
        err,
      );

      const close = () => {
        banner?.remove();
        banner = null;
      };
      const act = (action: 'save' | 'update' | 'never' | 'dismiss') => async () => {
        try {
          await send({ type: 'cs:promptAction', action });
          close();
        } catch (e) {
          err.textContent = e instanceof Error ? e.message : 'Failed';
        }
      };
      const btn = (text: string, cls: string, fn: () => void) => {
        const b = el('button', { class: `btn ${cls}`, text });
        b.addEventListener('click', fn);
        return b;
      };

      const actions = el('div', { class: 'actions' });
      if (p.locked) {
        actions.append(btn('Not now', 'ghost', act('dismiss')), btn('Unlock', 'primary', () => void send({ type: 'cs:openPopup' })));
      } else if (p.kind === 'update') {
        actions.append(btn('Not now', 'ghost', act('dismiss')), btn('Update', 'primary', act('update')));
      } else {
        actions.append(btn('Never for this site', 'ghost', act('never')), btn('Not now', 'ghost', act('dismiss')), btn('Save', 'primary', act('save')));
      }
      banner.appendChild(actions);
    }

    // ------------------------------------------------------------ fill requests from the popup

    browser.runtime.onMessage.addListener((msg: TabMessage) => {
      if (msg?.type !== 'bg:fill') return;
      const focused = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
      fillLogin(msg.payload, focused && icons.has(focused) ? focused : null);
    });

    // ------------------------------------------------------------ lifecycle

    let scanTimer: number | undefined;
    const scheduleScan = () => {
      clearTimeout(scanTimer);
      scanTimer = ctx.setTimeout(scan, 250);
    };
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'style', 'class', 'hidden'] });
    ctx.onInvalidated(() => {
      observer.disconnect();
      overlay = null;
      document.querySelectorAll('secure-vault-ui').forEach((n) => n.remove());
    });

    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(position);
    };
    window.addEventListener('scroll', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onMove, { passive: true });
    ctx.setInterval(position, 1000); // catch layout shifts that fire no events

    document.addEventListener(
      'mousedown',
      (e) => {
        if (menu && !overlay?.contains(e)) closeMenu();
      },
      true,
    );
    document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu(), true);

    scan();
    void checkPrompt();
  },
});
