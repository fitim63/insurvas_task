/**
 * In-page UI, rendered inside a *closed* shadow root so the host page can neither
 * style nor script it. All vault-provided text goes through textContent, never
 * innerHTML, so a malicious item title can't inject markup into the page.
 */

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.icon {
  position: fixed; width: 22px; height: 22px; border-radius: 6px; border: 0; padding: 3px; cursor: pointer;
  background: #4f46e5; display: flex; align-items: center; justify-content: center; pointer-events: auto;
  box-shadow: 0 1px 2px rgb(0 0 0 / .2); opacity: .9; transition: opacity .15s, transform .15s;
}
.icon:hover { opacity: 1; transform: scale(1.06); }
.icon svg { width: 14px; height: 14px; }
.menu, .banner {
  position: fixed; pointer-events: auto; color: #18181b; background: #fff; border-radius: 12px;
  box-shadow: 0 10px 30px rgb(0 0 0 / .18), 0 0 0 1px rgb(0 0 0 / .06); font-size: 13px; overflow: hidden;
}
.menu { min-width: 260px; max-width: 360px; }
.head { display: flex; align-items: center; gap: 6px; padding: 8px 12px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .04em; color: #71717a; border-bottom: 1px solid #f4f4f5; }
.head svg { width: 12px; height: 12px; }
.list { max-height: 260px; overflow-y: auto; padding: 4px; }
.row { display: flex; width: 100%; align-items: center; gap: 10px; padding: 8px; border: 0; background: none;
  border-radius: 8px; cursor: pointer; text-align: left; color: inherit; }
.row:hover, .row:focus { background: #eef2ff; outline: none; }
.avatar { width: 28px; height: 28px; flex: none; border-radius: 7px; background: #4f46e5; color: #fff;
  display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; }
.meta { min-width: 0; flex: 1; }
.title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { color: #71717a; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tag { font-size: 10px; font-weight: 600; color: #0369a1; background: #e0f2fe; border-radius: 4px; padding: 1px 5px; }
.msg { padding: 14px 12px; color: #52525b; line-height: 1.45; }
.msg b { color: #18181b; }
.banner { top: 16px; right: 16px; width: 340px; padding: 16px; animation: slide .2s ease-out; }
.banner .top { display: flex; gap: 12px; align-items: flex-start; }
.banner .logo { width: 32px; height: 32px; flex: none; border-radius: 8px; background: #4f46e5; display: flex;
  align-items: center; justify-content: center; }
.banner .logo svg { width: 18px; height: 18px; }
.banner h3 { margin: 0 0 4px; font-size: 14px; font-weight: 600; }
.banner p { margin: 0; color: #52525b; font-size: 12.5px; word-break: break-all; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; justify-content: flex-end; }
button.btn { border: 0; border-radius: 8px; padding: 7px 12px; font-size: 13px; font-weight: 500; cursor: pointer; }
.primary { background: #4f46e5; color: #fff; } .primary:hover { background: #4338ca; }
.ghost { background: transparent; color: #52525b; } .ghost:hover { background: #f4f4f5; }
.err { color: #b91c1c; font-size: 12px; margin-top: 8px; }
@keyframes slide { from { transform: translateY(-8px); opacity: 0; } }
@media (prefers-color-scheme: dark) {
  .menu, .banner { background: #18181b; color: #f4f4f5; box-shadow: 0 10px 30px rgb(0 0 0 / .5), 0 0 0 1px rgb(255 255 255 / .08); }
  .head { border-color: #27272a; } .row:hover, .row:focus { background: #27272a; }
  .msg, .banner p { color: #a1a1aa; } .msg b { color: #f4f4f5; } .ghost { color: #a1a1aa; } .ghost:hover { background: #27272a; }
  .tag { background: #082f49; color: #7dd3fc; }
}
`;

const SHIELD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5.5 3.4 10.3 8 11 4.6-.7 8-5.5 8-11V5l-8-3Z"/><rect x="9" y="10" width="6" height="5" rx="1"/></svg>';
const SHIELD_GREY = SHIELD.replace('stroke="#fff"', 'stroke="currentColor"');

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; html?: string } = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props.class) e.className = props.class;
  if (props.text !== undefined) e.textContent = props.text;
  if (props.html !== undefined) e.innerHTML = props.html; // static, trusted SVG only
  for (const c of children) e.appendChild(c);
  return e;
}

export class Overlay {
  readonly root: ShadowRoot;
  private host: HTMLElement;

  constructor() {
    this.host = document.createElement('secure-vault-ui');
    this.host.style.cssText =
      'position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;';
    this.root = this.host.attachShadow({ mode: 'closed' });
    this.root.appendChild(el('style', { text: CSS }));
    document.documentElement.appendChild(this.host);
  }

  /** True if the event happened inside our UI (closed shadow roots hide inner nodes from composedPath). */
  contains(e: Event): boolean {
    return e.composedPath().includes(this.host);
  }

  /** Keep the host attached (some SPAs replace <body> / documentElement children). */
  ensureMounted() {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
  }

  makeIcon(onClick: () => void): HTMLButtonElement {
    const b = el('button', { class: 'icon', html: SHIELD });
    b.type = 'button';
    b.title = 'Secure Vault: fill login';
    b.tabIndex = -1;
    // mousedown would blur the input; keep focus where the user is.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    this.root.appendChild(b);
    return b;
  }

  menu(anchor: DOMRect): HTMLDivElement {
    const m = el('div', { class: 'menu' });
    m.appendChild(el('div', { class: 'head', html: `${SHIELD_GREY}<span>Secure Vault</span>` }));
    const width = Math.max(anchor.width, 260);
    m.style.left = `${Math.min(anchor.left, window.innerWidth - width - 8)}px`;
    m.style.top = `${anchor.bottom + 6}px`;
    m.style.width = `${width}px`;
    this.root.appendChild(m);
    return m;
  }

  banner(): HTMLDivElement {
    const b = el('div', { class: 'banner' });
    this.root.appendChild(b);
    return b;
  }

  static logo(): HTMLElement {
    return el('div', { class: 'logo', html: SHIELD });
  }
}
