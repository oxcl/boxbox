// Test proxies. Each binds its *outgoing* connections to its own loopback address (127.0.0.2, 127.0.0.3, ...), so the
// fixture's /whoami reports which proxy a request actually exited through. All *.fixture.test / *.third.test names are
// mapped to the fixture server at 127.0.0.1.
import http from 'node:http';
import net from 'node:net';

const mapHost = () => '127.0.0.1';

export function startHttpProxy({ bind = '127.0.0.2', port = 0, auth = null, listen = '127.0.0.1' } = {}) {
  const log = [];
  const socks = new Set();
  const track = (s) => { socks.add(s); s.on('close', () => socks.delete(s)); return s; };
  const authed = (req) => {
    if (!auth) return true;
    const h = req.headers['proxy-authorization'] || '';
    const want = 'Basic ' + Buffer.from(`${auth.user}:${auth.pass}`).toString('base64');
    return h === want;
  };
  const deny = (res) => { res.writeHead(407, { 'proxy-authenticate': 'Basic realm="box-test"', connection: 'close' }); res.end(); };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url);
    log.push({ kind: 'http', host: u.hostname, path: u.pathname, authed: authed(req) });
    if (!authed(req)) return deny(res);
    const out = http.request({ host: mapHost(u.hostname), port: u.port || 80, method: req.method, path: u.pathname + u.search, headers: { ...req.headers, host: u.host }, localAddress: bind }, (r) => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    out.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(out);
  });
  server.on('connection', track);
  server.on('connect', (req, sock, head) => {
    const [host, p] = req.url.split(':');
    log.push({ kind: 'connect', host, authed: authed(req) });
    if (!authed(req)) { sock.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="box-test"\r\nConnection: close\r\n\r\n'); return; }
    const out = track(net.connect({ host: mapHost(host), port: Number(p), localAddress: bind }, () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); out.write(head); out.pipe(sock); sock.pipe(out); }));
    out.on('error', () => sock.destroy()); sock.on('error', () => out.destroy());
  });
  return new Promise((resolve) => server.listen(port, listen, () => resolve({ port: server.address().port, host: listen, log, bind, close: () => new Promise((r) => { server.closeAllConnections?.(); for (const x of socks) x.destroy(); server.close(r); }) })));
}

/** Minimal SOCKS5 (no-auth or username/password) with remote DNS (ATYP=domain). */
export function startSocks5({ bind = '127.0.0.3', port = 0, auth = null, listen = '127.0.0.1' } = {}) {
  const log = [];
  const socks = new Set();
  const track = (s) => { socks.add(s); s.on('close', () => socks.delete(s)); return s; };
  const server = net.createServer((c) => {
    track(c);
    c.on('error', () => {});
    let stage = 0, buf = Buffer.alloc(0);
    const next = (n) => { const out = buf.subarray(0, n); buf = buf.subarray(n); return out; };
    c.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (stage === 0) {
          if (buf.length < 2 || buf.length < 2 + buf[1]) return;
          const m = [...next(2 + buf[1]).subarray(2)];
          if (auth) { if (!m.includes(2)) { c.end(Buffer.from([5, 0xff])); return; } c.write(Buffer.from([5, 2])); stage = 1; } else { c.write(Buffer.from([5, 0])); stage = 2; }
        } else if (stage === 1) {
          if (buf.length < 2 || buf.length < 3 + buf[1]) return;
          const ul = buf[1]; if (buf.length < 3 + ul + buf[2 + ul]) return;
          const raw = next(3 + ul + buf[2 + ul]); const user = raw.subarray(2, 2 + ul).toString(), pass = raw.subarray(3 + ul).toString();
          const ok = user === auth.user && pass === auth.pass;
          log.push({ kind: 'auth', ok });
          c.write(Buffer.from([1, ok ? 0 : 1])); if (!ok) { c.end(); return; } stage = 2;
        } else if (stage === 2) {
          if (buf.length < 5) return;
          const atyp = buf[3]; let need = atyp === 3 ? 7 + buf[4] : atyp === 1 ? 10 : 22;
          if (buf.length < need) return;
          const req = next(need);
          let host, p;
          if (atyp === 3) { host = req.subarray(5, 5 + req[4]).toString(); p = req.readUInt16BE(5 + req[4]); }
          else if (atyp === 1) { host = [...req.subarray(4, 8)].join('.'); p = req.readUInt16BE(8); }
          else { host = 'ipv6'; p = req.readUInt16BE(20); }
          log.push({ kind: 'connect', host, atyp });
          const out = track(net.connect({ host: atyp === 3 ? mapHost(host) : host, port: p, localAddress: bind }, () => {
            c.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            if (buf.length) out.write(buf);
            out.pipe(c); c.pipe(out);
          }));
          out.on('error', () => c.destroy());
          stage = 3; return;
        } else return;
      }
    });
  });
  return new Promise((resolve) => server.listen(port, listen, () => resolve({ port: server.address().port, host: listen, log, bind, close: () => new Promise((r) => { for (const x of socks) x.destroy(); server.close(r); }) })));
}
