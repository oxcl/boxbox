// Fast unit tests for pure logic (no browser): cookie jar, service resolution layers, navigation policy, CSP patching.
import { Jar, parseSetCookie, requestContext, siteOf } from '../src/chrome/jar.js';
import { Resolver, opSetDomains, opCreateService, opDeleteService, normDomain, registrable } from '../src/core/services.js';
import { decide, looksLikeAuthFlow } from '../src/core/nav.js';
import { CATALOG, TEST_CATALOG } from '../src/core/catalog.js';
import { patchCsp } from '../src/platform/chrome-mv2.js';

let pass = 0, fail = 0;
const eq = (a, b, m) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x === y) pass++; else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${m}\n      expected ${y}\n      got      ${x}`); } };
const group = (n) => console.log(`  ${n}`);

group('cookie jar');
{
  const j = new Jar(); const u = 'http://accounts.alpha.localhost:80/sso';
  eq(!!j.setFromHeader('a', u, 'sid=1; HttpOnly; Domain=alpha.localhost; Path=/'), true, 'domain cookie from sub-domain');
  eq(j.header('a', 'http://alpha.localhost/x'), 'sid=1', 'domain cookie visible on parent host');
  eq(j.header('b', 'http://alpha.localhost/x'), '', 'other account jar is empty');
  eq(j.documentCookie('a', 'http://alpha.localhost/'), '', 'HttpOnly hidden from document.cookie');
  eq(parseSetCookie('x=1; Domain=localhost', u), null, 'public-suffix style domain rejected');
  eq(parseSetCookie('x=1; Domain=evil.com', u), null, 'foreign domain rejected');
  eq(parseSetCookie('x=1; Secure', 'http://example.com/'), null, 'Secure over plain http rejected');
  eq(!!parseSetCookie('x=1; Secure', 'http://a.localhost/'), true, 'Secure accepted on localhost (secure context)');
  eq(parseSetCookie('__Host-x=1; Secure; Path=/; Domain=a.localhost', 'https://a.localhost/'), null, '__Host- with Domain rejected');
  eq(parseSetCookie('x=1; SameSite=None', 'https://a.com/'), null, 'SameSite=None without Secure rejected');
  j.setFromHeader('a', 'http://h.test/p/q', 'k=v; Path=/p'); eq(j.header('a', 'http://h.test/p/z'), 'k=v', 'path match'); eq(j.header('a', 'http://h.test/pp'), '', 'path boundary');
  j.setFromHeader('a', 'http://h.test/', 'ho=1'); eq(j.header('a', 'http://sub.h.test/'), '', 'host-only cookie not sent to sub-domain');
  j.setFromHeader('a', 'http://h.test/', 'gone=1; Max-Age=60'); j.setFromHeader('a', 'http://h.test/', 'gone=; Max-Age=0'); eq(j.header('a', 'http://h.test/').includes('gone'), false, 'Max-Age=0 deletes');
  j.setFromHeader('a', 'http://h.test/', 'old=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT'); eq(j.header('a', 'http://h.test/').includes('old'), false, 'expired on arrival');
  j.setFromHeader('a', 'https://s.test/', 'lax=1; Path=/'); j.setFromHeader('a', 'https://s.test/', 'none=1; SameSite=None; Secure; Path=/'); j.setFromHeader('a', 'https://s.test/', 'strict=1; SameSite=Strict');
  eq(j.header('a', 'https://s.test/', { ctx: 'cross' }), 'none=1', 'cross-site subresource: only SameSite=None');
  eq(j.header('a', 'https://s.test/', { ctx: 'nav' }).split('; ').sort(), ['lax=1', 'none=1'], 'cross-site top-level navigation: Lax + None');
  eq(j.header('a', 'https://s.test/', { ctx: 'same' }).split('; ').sort(), ['lax=1', 'none=1', 'strict=1'], 'same-site: everything');
  eq(j.setFromJs('a', 'https://s.test/', 'x=1; HttpOnly'), false, 'JS cannot set HttpOnly');
  eq(j.setFromJs('a', 'https://s.test/', 'sid=hack'), true, 'JS can set a normal cookie');
  j.setFromHeader('a', 'https://s.test/', 'prot=1; HttpOnly; Path=/'); eq(j.setFromJs('a', 'https://s.test/', 'prot=2; Path=/'), false, 'JS cannot overwrite an HttpOnly cookie');
  eq(requestContext({ url: 'https://s.test/x', topUrl: 'https://s.test/', type: 'xmlhttprequest' }), 'same', 'same-site request context');
  eq(requestContext({ url: 'https://s.test/x', topUrl: 'https://o.test/', type: 'sub_frame' }), 'cross', 'third-party iframe context');
  eq(requestContext({ url: 'https://s.test/x', initiator: 'https://o.test', type: 'main_frame', method: 'GET' }), 'nav', 'cross-site link click');
  eq(siteOf('a.b.alpha.localhost'), 'alpha.localhost', 'siteOf');
}

group('service resolution (auto < catalog < user)');
{
  const cat = [...CATALOG, ...TEST_CATALOG];
  let r = new Resolver({ catalog: cat });
  eq(r.idOf('www.reddit.com'), 'reddit', 'catalog: www.reddit.com'); eq(r.idOf('old.reddit.com'), 'reddit', 'catalog: old.reddit.com');
  eq(r.idOf('accounts.google.com'), 'google', 'catalog google'); eq(r.idOf('www.youtube.com'), 'google', 'catalog youtube->google'); eq(r.idOf('gist.github.com'), 'github', 'catalog github');
  eq(r.idOf('foo.example.co.uk'), 'auto:example.co.uk', 'automatic: registrable domain with multi-label suffix');
  eq(r.idOf('a.b.example.com'), 'auto:example.com', 'automatic'); eq(r.idOf('foo.github.io'), 'github', 'private suffix github.io is in the catalog');
  eq(r.idOf('foo.herokuapp.com'), 'salesforce', 'catalog heroku'); eq(r.idOf('127.0.0.1'), 'auto:127.0.0.1', 'IP hosts');
  eq(r.name('auto:example.com'), 'Example', 'auto name');
  // user layer wins over catalog and automatic
  let u = { services: {}, domainMap: {}, names: {} };
  u = opSetDomains(u, 'github', ['example.com']); r = new Resolver({ catalog: cat, user: u });
  eq(r.idOf('www.example.com'), 'github', 'merge: user maps an automatic domain into a catalog service');
  eq(r.domains('github').includes('example.com'), true, 'merge: listed in the service');
  u = opCreateService(u, 'user:x', 'Mine', ['gist.github.com']); r = new Resolver({ catalog: cat, user: u });
  eq(r.idOf('gist.github.com'), 'user:x', 'split: more specific user mapping beats the catalog'); eq(r.idOf('www.github.com'), 'github', 'split leaves the rest');
  u = opSetDomains(u, 'reddit', ['github.com']); r = new Resolver({ catalog: cat, user: u });
  eq(r.idOf('www.github.com'), 'reddit', 'user mapping of a broad domain beats a more specific catalog entry? (layered: user first)');
  eq(r.domains('github').includes('github.com'), false, 'moved domain leaves its old service');
  u = opDeleteService(u, 'user:x'); r = new Resolver({ catalog: cat, user: u }); eq(r.idOf('gist.github.com'), 'reddit', 'deleting a user service removes its mappings');
  eq(normDomain('https://WWW.Foo.com/path?x'), 'www.foo.com', 'normDomain'); eq(registrable('x.y.z.com'), 'z.com', 'registrable');
}

group('navigation policy');
{
  const accounts = { A1: { id: 'A1', serviceId: 'S1' }, A2: { id: 'A2', serviceId: 'S2' } };
  const base = { settings: { defaultMode: 'default', modes: {} }, accounts, lastAccount: {} };
  const d = (o) => decide({ ...base, ...o });
  const inAcc = { accountId: 'A1', home: 'S1', flow: null };
  eq(d({ url: 'https://s1.test/', targetService: 'S1', tab: inAcc, userInitiated: true }).type, 'stay', 'same service stays');
  eq(d({ url: 'https://s2.test/', targetService: 'S2', tab: inAcc, userInitiated: false }), { type: 'stay', flow: 'S2' }, 'page-initiated cross-service: stay, remember flow');
  eq(d({ url: 'https://s2.test/', targetService: 'S2', tab: { ...inAcc, flow: 'S2' }, userInitiated: true }).type, 'stay', 'inside a flow the foreign service is fine');
  eq(d({ url: 'https://s2.test/oauth/authorize?client_id=x&redirect_uri=y', targetService: 'S2', tab: inAcc, userInitiated: true }).type, 'stay', 'auth-looking URL is a flow even when user-initiated');
  eq(d({ url: 'https://s2.test/', targetService: 'S2', tab: inAcc, userInitiated: true }), { type: 'move', accountId: null, home: 'S2', why: 'leave:default' }, 'user navigation leaves the account');
  eq(d({ url: 'https://s1.test/', targetService: 'S1', tab: { accountId: 'A1', home: 'S1', flow: 'S2' }, userInitiated: false }), { type: 'stay', flow: null }, 'returning home clears the flow');
  const def = { accountId: null, home: 'S9', flow: null };
  eq(d({ url: 'https://s1.test/', targetService: 'S1', tab: def, userInitiated: true }).type, 'move', 'default tab entering: default mode moves to null (no-op for platform)');
  eq(d({ url: 'https://s1.test/', targetService: 'S1', tab: def, userInitiated: true, settings: { defaultMode: 'remember', modes: {} }, lastAccount: { S1: 'A1' } }), { type: 'move', accountId: 'A1', home: 'S1', why: 'enter:remember' }, 'remember last');
  eq(d({ url: 'https://s1.test/', targetService: 'S1', tab: def, userInitiated: true, settings: { defaultMode: 'ask', modes: {} } }), { type: 'ask', serviceId: 'S1' }, 'ask');
  eq(d({ url: 'https://s3.test/', targetService: 'S3', tab: def, userInitiated: true, settings: { defaultMode: 'ask', modes: {} } }).type, 'move', 'ask with no accounts does not interrupt');
  eq(d({ url: 'https://s1.test/', targetService: 'S1', tab: def, userInitiated: true, settings: { defaultMode: 'ask', modes: { S1: 'default' } } }).type, 'move', 'per-service override beats global ask');
  eq(d({ url: 'https://s2.test/', targetService: 'S2', tab: def, userInitiated: true, settings: { defaultMode: 'default', modes: { S2: 'ask' } } }).type, 'ask', 'per-service override: ask');
  eq(d({ url: 'https://s1.test/', targetService: 'S1', tab: def, userInitiated: false, settings: { defaultMode: 'ask', modes: {} } }), { type: 'stay', home: 'S1' }, 'page-initiated entry never triggers a picker');
  eq(looksLikeAuthFlow('https://accounts.google.com/o/oauth2/v2/auth?client_id=1&redirect_uri=x'), true, 'oauth detection'); eq(looksLikeAuthFlow('https://news.example.com/article'), false, 'plain link is not auth');
}

group('CSP nonce patching (MV2 shim injection)');
{
  eq(patchCsp("default-src 'self'; script-src 'nonce-abc'; connect-src https://api.x", 'N'), "default-src 'self'; script-src 'nonce-abc' 'nonce-N'; connect-src https://api.x 'self' data:", 'script-src + connect-src');
  eq(patchCsp("default-src 'self' https://cdn.x", 'N'), "default-src 'self' https://cdn.x; script-src 'self' https://cdn.x 'nonce-N'; connect-src 'self' https://cdn.x 'self' data:", 'default-src fallback');
  eq(patchCsp("connect-src *", 'N'), "connect-src *", 'wildcard connect-src untouched');
  eq(patchCsp("require-trusted-types-for 'script'; script-src 'self'", 'N'), "script-src 'self' 'nonce-N'", 'Trusted Types enforcement dropped');
  eq(patchCsp("script-src 'none'", 'N'), "script-src 'nonce-N'", "'none' replaced");
}

console.log(`\n  unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
