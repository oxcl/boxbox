// A Chrome-like window: makeWin({ w, h, x, y, url, title, fav, favBg, color, dark, content, ext, pill }) -> HTML string
globalThis.makeWin = function (o) {
  const ic = { back: '<path d="M15 6l-6 6 6 6"/>', fwd: '<path d="M9 6l6 6-6 6"/>', reload: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', puzzle: '<path d="M10 4h4v3a2 2 0 1 0 4 0V4h2v6h-3a2 2 0 1 0 0 4h3v6h-6v-3a2 2 0 1 0-4 0v3H4v-6h3a2 2 0 1 0 0-4H4V4z"/>' };
  const svg = (k) => `<svg viewBox="0 0 24 24">${ic[k]}</svg>`;
  const cl = o.color ? `--c:${o.color};` : '';
  return `<div class="win ${o.dark ? 'dark' : ''}" style="left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;${cl}${o.style || ''}">
  <div class="tabstrip"><div class="lights"><i></i><i></i><i></i></div>
    <div class="tab"><span class="fv" style="background:${o.favBg || '#a9714b'}">${o.fav || 'B'}</span><span class="tt">${o.title}</span><span class="x">✕</span></div>
    <div class="tab dim"><span class="tt">New tab</span></div><div class="newtab">+</div></div>
  <div class="toolbar"><span class="ti">${svg('back')}</span><span class="ti" style="opacity:.45">${svg('fwd')}</span><span class="ti">${svg('reload')}</span>
    <div class="omni">${svg('lock')}<span>${o.url}</span></div>
    ${o.ext ? `<span class="ext ${o.extOn ? 'on' : ''}" data-mini="${o.ext}" data-size="22"></span>` : ''}<span class="ti">${svg('puzzle')}</span><span class="avatar"></span></div>
  <div class="viewport">${o.color && o.pill ? `<div class="frame-ring"></div><div class="pill"><span data-mini="${o.color}" data-size="16"></span>${o.pill}</div>` : ''}${o.content || ''}</div></div>`;
};
globalThis.postbox = function ({ who, color, unread, rows, active = 'Inbox' }) {
  const nav = ['Inbox', 'Starred', 'Sent', 'Drafts', 'Archive'].map((n) => `<div class="n ${n === active ? 'on' : ''}"><span>${n}</span>${n === 'Inbox' ? `<span>${unread}</span>` : ''}</div>`).join('');
  const rws = rows.map(([a, b, c, u]) => `<div class="r ${u ? 'u' : ''}"><b>${a}</b><span>${b}</span><small>${c}</small></div>`).join('');
  return `<div class="pb" style="--c:${color}"><aside><div class="lg"><i></i>Postbox</div>${nav}</aside><main><div class="hd"><h3>Inbox</h3><span class="av">${who[0]}</span></div><div class="search">Search mail</div>${rws}</main></div>`;
};
