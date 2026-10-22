// Fake multi-domain "services" for testing Box.
//
//   Service Alpha : alpha.localhost, mail./video./accounts.alpha.localhost,
//                   alpha-static.localhost (different *site*; third-party context)
//   Service Beta  : beta.localhost (also used as the "OAuth provider" and as an embed)
//   Gamma, Delta  : gamma.localhost, delta.localhost — not in the catalog on purpose
//   echo.fixture.test : IP echo for proxy tests (see /whoami)
//   ctl.localhost : request log / reset
//
// One port serves every hostname; behaviour is selected by the Host header.
import http from 'node:http';
import crypto from 'node:crypto';

export function startFixture({ port = 0, host = '::' } = {}) {
  const sessions = new Map(); // token -> user
  const log = [];
  let PORT = 0;

  const send = (res, status, headers, body) => { res.writeHead(status, headers); res.end(body); };
  const html = (res, body, extra = {}, status = 200) =>
    send(res, status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...extra }, body);
  const json = (res, obj, extra = {}) =>
    send(res, 200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra }, JSON.stringify(obj));

  const parseCookies = (h) =>
    Object.fromEntries((h || '').split(/;\s*/).filter(Boolean).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; }));

  const siteOf = (hostname) => (/(^|\.)alpha\.localhost$/.test(hostname) || hostname === 'alpha-static.localhost') ? 'alpha' : hostname.replace(/:\d+$/, '');
  const alphaHosts = ['alpha.localhost', 'mail.alpha.localhost', 'video.alpha.localhost', 'accounts.alpha.localhost'];

  const origin = (h) => `http://${h}:${PORT}`;

  const layout = (hostname, title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<link rel="icon" href="/favicon.svg"></head><body>
<h1 id="site">${title} @ ${hostname}</h1>
<div id="banner">…</div>
${body}
<script src="/fx.js"></script>
</body></html>`;

  const FX_JS = `
(function(){
  const $ = (s)=>document.querySelector(s);
  const state = {};
  const kvOpen = ()=>new Promise((res,rej)=>{ const r=indexedDB.open('fx',1); r.onupgradeneeded=()=>r.result.createObjectStore('kv'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
  const idbPut = async (k,v)=>{ const db=await kvOpen(); await new Promise((res,rej)=>{ const t=db.transaction('kv','readwrite'); t.objectStore('kv').put(v,k); t.oncomplete=res; t.onerror=()=>rej(t.error);}); db.close(); };
  const idbGet = async (k)=>{ const db=await kvOpen(); const v=await new Promise((res,rej)=>{ const t=db.transaction('kv'); const r=t.objectStore('kv').get(k); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);}); db.close(); return v; };
  const tpWait = ()=>new Promise((res)=>{ let done=false; const f=(e)=>{ if(e.data&&e.data.fxTp!==undefined){ done=true; removeEventListener('message',f); res(e.data.fxTp);} }; addEventListener('message',f); setTimeout(()=>{ if(!done){removeEventListener('message',f);res('timeout');} },1500); });

  async function writeStores(user){
    document.cookie = 'jsc=' + encodeURIComponent(user) + '; path=/; max-age=86400';
    localStorage.setItem('fx_user', user);
    sessionStorage.setItem('fx_user', user);
    await idbPut('user', user);
    if (window.caches) { const c = await caches.open('fx'); await c.put('/cache-user', new Response(user)); }
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
        const reg = await navigator.serviceWorker.ready;
        (reg.active||navigator.serviceWorker.controller)?.postMessage({user});
        await new Promise(r=>setTimeout(r,150));
      } catch(e) { state.swError = String(e); }
    }
  }
  async function login(user){
    await fetch('/api/login?user='+encodeURIComponent(user), {method:'POST', credentials:'include'});
    await writeStores(user);
    await loadTp(user);
    await render();
  }
  async function logout(){
    await fetch('/api/logout', {method:'POST'});
    document.cookie='jsc=; path=/; max-age=0'; localStorage.removeItem('fx_user'); sessionStorage.removeItem('fx_user');
    await idbPut('user', null);
    if (window.caches) await caches.delete('fx');
    await render();
  }
  function loadTp(user){
    // third-party context: cross-site iframe sets + reads a SameSite=None cookie
    return new Promise((res)=>{
      let f=$('#tpframe'); if(f) f.remove();
      f=document.createElement('iframe'); f.id='tpframe';
      f.src = location.protocol+'//alpha-static.localhost:'+location.port+'/widget'+(user?('?set='+encodeURIComponent(user)):'');
      f.onload=()=>res(); document.body.appendChild(f); setTimeout(res,1500);
    });
  }
  async function readState(){
    const s = {host: location.host};
    try { s.server = (await (await fetch('/api/state',{credentials:'include'})).json()); } catch(e){ s.server = {error:String(e)}; }
    s.cookie = (document.cookie.match(/(?:^|; )jsc=([^;]*)/)||[])[1]; s.cookie = s.cookie ? decodeURIComponent(s.cookie) : null;
    s.ls = localStorage.getItem('fx_user');
    s.ss = sessionStorage.getItem('fx_user');
    try { s.idb = (await idbGet('user')) ?? null; } catch(e){ s.idb = 'ERR '+e; }
    try { if(window.caches){ const c=await caches.open('fx'); const r=await c.match('/cache-user'); s.cache = r? await r.text(): null; } else s.cache='unsupported'; } catch(e){ s.cache='ERR '+e; }
    try { const r = await fetch('/sw/whoami'); const j = await r.json(); s.sw = j.user ?? null; s.swHandled = !!j.viaSw; } catch(e){ s.sw = 'ERR '+e; }
    s.swController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    try { s.lsKeys = Object.keys(localStorage); s.ssKeys = Object.keys(sessionStorage); } catch(e){}
    try { s.idbNames = indexedDB.databases ? (await indexedDB.databases()).map(d=>d.name) : []; } catch(e){ s.idbNames=['ERR']; }
    try { s.cacheNames = window.caches ? await caches.keys() : []; } catch(e){ s.cacheNames=['ERR']; }
    s.documentCookie = document.cookie;
    return s;
  }
  async function render(){
    const s = await readState();
    const who = s.server && s.server.user;
    const b = $('#banner'); if(b){ b.textContent = who ? 'logged in as '+who : 'logged out'; b.dataset.user = who||''; }
    state.last = s; return s;
  }
  window.Fx = { login, logout, writeStores, readState, render, loadTp, tpWait };
  addEventListener('DOMContentLoaded', ()=>{ render(); });
  addEventListener('message', (e)=>{ if(e.data && e.data.fxLogin){ writeStores(e.data.fxLogin).then(render).then(()=>{ document.title='popup-done:'+e.data.fxLogin; }); } });
})();`;

  const SW_JS = `
let user = null;
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('message', async e => { user = e.data.user; const c = await caches.open('fx-sw'); await c.put('/u', new Response(user)); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.pathname === '/sw/whoami') {
    e.respondWith((async()=>{
      let who = user;
      if (!who) { const c = await caches.open('fx-sw'); const r = await c.match('/u'); who = r ? await r.text() : null; }
      return new Response(JSON.stringify({user: who, viaSw: true}), {headers:{'content-type':'application/json'}});
    })());
  }
});`;

  const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2b6cb0"/><text x="16" y="23" font-size="20" text-anchor="middle" fill="#fff" font-family="sans-serif">F</text></svg>`;

  const server = http.createServer((req, res) => {
    const hostname = (req.headers.host || '').replace(/:\d+$/, '');
    const url = new URL(req.url, 'http://x');
    const cookies = parseCookies(req.headers.cookie);
    const remote = (req.socket.remoteAddress || '').replace('::ffff:', '');
    log.push({ t: Date.now(), host: hostname, method: req.method, path: url.pathname + url.search, cookie: req.headers.cookie || '', remote, ua: !!req.headers['user-agent'] });
    const p = url.pathname;

    // ---- control plane
    if (hostname === 'ctl.localhost') {
      if (p === '/log') return json(res, log.filter((l) => !l.path.startsWith('/__') ));
      if (p === '/reset') { log.length = 0; return json(res, { ok: true }); }
      if (p === '/sessions') return json(res, [...sessions.entries()]);
      if (p !== '/blank') return json(res, { ok: true, port: PORT });
    }

    // ---- shared assets
    if (p === '/fx.js') return send(res, 200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }, FX_JS);
    if (p === '/sw.js') return send(res, 200, { 'content-type': 'text/javascript', 'cache-control': 'no-store', 'service-worker-allowed': '/' }, SW_JS);
    if (p === '/favicon.svg' || p === '/favicon.ico') return send(res, 200, { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=60' }, FAVICON);
    if (p === '/__wipe') return html(res, '<!doctype html><title>wipe</title>wipe');
    if (p === '/sw/whoami') return json(res, { user: null, viaSw: false });
    if (p === '/blank') return html(res, layout(hostname, 'Blank', ''));

    // ---- IP echo for proxy tests
    if (p === '/whoami') return json(res, { remote, host: hostname });
    if (hostname === 'echo.fixture.test') return html(res, layout(hostname, 'Echo', `<pre id="remote">${remote}</pre>`));

    const isAlphaFamily = siteOf(hostname) === 'alpha';
    const site = isAlphaFamily ? 'alpha' : hostname.split('.')[0];
    const sid = cookies.sid;
    const user = sid ? sessions.get(sid) : undefined;
    const cookieAttrs = isAlphaFamily ? `; Domain=alpha.localhost; Path=/` : '; Path=/';

    // ---- API
    if (p === '/api/login') {
      const u = url.searchParams.get('user') || 'anon';
      const token = crypto.randomBytes(8).toString('hex');
      sessions.set(token, u);
      return json(res, { ok: true, user: u }, {
        'set-cookie': [`sid=${token}; HttpOnly${cookieAttrs}`, `userc=${encodeURIComponent(u)}${cookieAttrs}`],
      });
    }
    if (p === '/api/logout') {
      return json(res, { ok: true }, { 'set-cookie': [`sid=; HttpOnly; Max-Age=0${cookieAttrs}`, `userc=; Max-Age=0${cookieAttrs}`] });
    }
    if (p === '/api/state') {
      return json(res, { user: user || null, userc: cookies.userc || null, jsc: cookies.jsc || null, cookieNames: Object.keys(cookies), site });
    }

    // ---- cross-domain login redirect: alpha -> accounts.alpha -> alpha
    if (p === '/login/start') {
      const u = url.searchParams.get('user') || 'anon';
      const back = url.searchParams.get('next') || '/';
      const dest = `${origin('accounts.alpha.localhost')}/sso?user=${encodeURIComponent(u)}&return=${encodeURIComponent(origin(hostname) + back)}`;
      res.writeHead(302, { location: dest }); return res.end();
    }
    if (p === '/sso' && hostname === 'accounts.alpha.localhost') {
      const u = url.searchParams.get('user') || 'anon';
      const token = crypto.randomBytes(8).toString('hex');
      sessions.set(token, u);
      res.writeHead(302, {
        location: url.searchParams.get('return') || origin('alpha.localhost') + '/',
        'set-cookie': [`sid=${token}; HttpOnly${cookieAttrs}`, `userc=${encodeURIComponent(u)}${cookieAttrs}`],
      });
      return res.end();
    }

    // ---- popup login flow
    if (p === '/popup-opener') {
      return html(res, layout(hostname, 'Popup opener', `<button id="open-popup" onclick="window.open('${origin('accounts.alpha.localhost')}/popup?user='+encodeURIComponent(new URLSearchParams(location.search).get('user')||'pop'),'fxpopup','width=420,height=320')">Sign in (popup)</button>`));
    }
    if (p === '/popup' && hostname === 'accounts.alpha.localhost') {
      const u = url.searchParams.get('user') || 'pop';
      const token = crypto.randomBytes(8).toString('hex');
      sessions.set(token, u);
      return html(res, layout(hostname, 'Popup login', `<p id="popup-msg">signing in ${u}</p><script>setTimeout(()=>{ try{ window.opener.postMessage({fxLogin:${JSON.stringify(u)}}, '*'); }catch(e){} window.close(); }, 200)</script>`), {
        'set-cookie': [`sid=${token}; HttpOnly${cookieAttrs}`, `userc=${encodeURIComponent(u)}${cookieAttrs}`],
      });
    }

    // ---- third-party widget (alpha-static.localhost, embedded cross-site)
    if (p === '/widget') {
      const set = url.searchParams.get('set');
      const headers = {};
      if (set) headers['set-cookie'] = [`tpid=${encodeURIComponent(set)}; SameSite=None; Secure; Path=/`];
      const tp = set || cookies.tpid || null;
      return html(res, `<!doctype html><body><div id="who">${tp ? 'widget:' + tp : 'widget:none'}</div><script>parent.postMessage({fxTp:${JSON.stringify(tp)}},'*')</script></body>`, headers);
    }

    // ---- OAuth-like provider on Beta + callback on Alpha
    if (p === '/oauth/authorize') {
      const redirect = url.searchParams.get('redirect_uri');
      const as = url.searchParams.get('as') || 'oauthuser';
      res.writeHead(302, { location: `${redirect}${redirect.includes('?') ? '&' : '?'}code=${encodeURIComponent(as)}` });
      return res.end();
    }
    if (p === '/oauth/callback') {
      const u = url.searchParams.get('code') || 'oauth';
      const token = crypto.randomBytes(8).toString('hex');
      sessions.set(token, u);
      return html(res, layout(hostname, 'OAuth callback', `<p id="cb">callback ok ${u}</p>`), {
        'set-cookie': [`sid=${token}; HttpOnly${cookieAttrs}`, `userc=${encodeURIComponent(u)}${cookieAttrs}`],
      });
    }
    if (p === '/oauth/start') {
      // page-initiated JS redirect chain: alpha -> beta authorize -> alpha callback
      const as = url.searchParams.get('as') || 'oauthuser';
      const target = `${origin('beta.localhost')}/oauth/authorize?client_id=alpha&response_type=code&as=${encodeURIComponent(as)}&redirect_uri=${encodeURIComponent(origin('alpha.localhost') + '/oauth/callback')}`;
      return html(res, layout(hostname, 'OAuth start', `<a id="signin-beta" href="${target}">Sign in with Beta</a><button id="js-redirect" onclick="setTimeout(()=>{location.href=${JSON.stringify(target)}},10)">JS redirect</button>`));
    }

    // ---- embed (cross-service iframe content)
    if (p === '/embed') {
      const set = url.searchParams.get('set');
      const headers = {};
      if (set) headers['set-cookie'] = [`embedid=${encodeURIComponent(set)}; Path=/; SameSite=None; Secure`];
      const who = set || cookies.embedid || 'anonymous';
      return html(res, `<!doctype html><body><div id="embed-who">embed:${who}</div></body>`, headers);
    }
    if (p === '/with-embed') {
      const set = url.searchParams.get('set') || '';
      return html(res, layout(hostname, 'Page with embed', `<iframe id="beta-embed" src="${origin('beta.localhost')}/embed${set ? '?set=' + encodeURIComponent(set) : ''}"></iframe>`));
    }

    // ---- links page
    if (p === '/links') {
      return html(res, layout(hostname, 'Links', `
        <a id="to-beta" href="${origin('beta.localhost')}/">beta</a>
        <a id="to-gamma" href="${origin('gamma.localhost')}/">gamma</a>
        <a id="to-alpha-mail" href="${origin('mail.alpha.localhost')}/">alpha mail</a>
        <a id="to-alpha-video" href="${origin('video.alpha.localhost')}/">alpha video</a>
        <a id="to-delta" href="${origin('delta.localhost')}/">delta</a>
        <a id="to-beta-blank" target="_blank" href="${origin('beta.localhost')}/">beta (new tab)</a>
        <a id="to-alpha-blank" target="_blank" href="${origin('mail.alpha.localhost')}/">alpha mail (new tab)</a>
        <button id="js-nav-beta" onclick="setTimeout(()=>{location.href=${JSON.stringify(origin('beta.localhost') + '/')}},10)">js nav beta</button>
        <button id="popup-beta" onclick="window.open(${JSON.stringify(origin('beta.localhost') + '/')},'p','width=400,height=300')">popup beta</button>`));
    }

    // ---- strict CSP app page
    if (p === '/csp') {
      const nonce = crypto.randomBytes(8).toString('hex');
      return html(res, `<!doctype html><html><head><title>CSP</title></head><body><div id="banner">csp</div><script nonce="${nonce}" src="/fx.js"></script></body></html>`, {
        'content-security-policy': `default-src 'self'; script-src 'nonce-${nonce}' 'self'; frame-src * ; connect-src 'self'; img-src 'self' data:`,
      });
    }

    // ---- default landing page for every host
    return html(res, layout(hostname, ({ alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma', delta: 'Delta' })[site] || site, `<nav>
      <a id="login-redirect" href="/login/start?user=redirectuser">cross-domain login</a>
      </nav><div id="path">${p}</div>`));
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      PORT = server.address().port;
      resolve({
        port: PORT, server, log, sessions,
        url: (h, path = '/') => `http://${h}:${PORT}${path}`,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
        alphaHosts,
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = await startFixture({ port: Number(process.env.PORT || 4180) });
  console.log(`fixture on :${f.port}  e.g. ${f.url('alpha.localhost')}`);
}
