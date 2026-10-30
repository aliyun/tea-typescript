'use strict';

import dns from 'dns';
import http from 'http';
import https from 'https';
import 'mocha';
import assert from 'assert';
import { EventEmitter } from 'events';
import net, { AddressInfo, Socket, Server as NetServer } from 'net';
import { WebSocketServer } from 'ws';

import * as $dara from '../src/index';
// Internal helpers are intentionally not re-exported from the package entrypoint.
import { getIPv4OnlyAgent, assertIPv4OnlyHost } from '../src/core';
import { ipv4OnlyLookup, extractWebSocketProtocols, pinProxyUrlToIpv4, createSocksProxyAgent } from '../src/websocket';

function createServer(): http.Server {
  return http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(req.socket.remoteAddress);
  });
}

function listen(server: http.Server, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

function close(server: { close: (cb?: (err?: Error) => void) => void }): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/**
 * Minimal SOCKS5 (no auth) that records CONNECT targets as "ipv4:addr" / "ipv6" / "domain:name"
 * then answers the tunnelled HTTP request with 200 "ok". Mirrors Java Ipv4OnlyTest.startSocks5Server.
 */
function startSocks5Server(targets: string[]): Promise<NetServer> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      let buf = Buffer.alloc(0);
      let stage: 'greeting' | 'connect' | 'http' = 'greeting';

      socket.on('data', (data: Buffer) => {
        buf = Buffer.concat([buf, data]);
        if (stage === 'greeting') {
          if (buf.length < 2) {
            return;
          }
          const nmethods = buf[1];
          if (buf.length < 2 + nmethods) {
            return;
          }
          socket.write(Buffer.from([0x05, 0x00]));
          buf = buf.slice(2 + nmethods);
          stage = 'connect';
        }
        if (stage === 'connect') {
          if (buf.length < 4) {
            return;
          }
          const atyp = buf[3];
          let offset = 4;
          let hostLabel = '';
          if (atyp === 0x01) {
            if (buf.length < 10) {
              return;
            }
            hostLabel = `ipv4:${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
            offset = 10;
          } else if (atyp === 0x03) {
            const len = buf[4];
            if (buf.length < 5 + len + 2) {
              return;
            }
            hostLabel = `domain:${buf.slice(5, 5 + len).toString('binary')}`;
            offset = 5 + len + 2;
          } else if (atyp === 0x04) {
            if (buf.length < 22) {
              return;
            }
            hostLabel = 'ipv6';
            offset = 22;
          } else {
            socket.destroy();
            return;
          }
          targets.push(hostLabel);
          socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
          buf = buf.slice(offset);
          stage = 'http';
        }
        if (stage === 'http') {
          if (!buf.toString('binary').includes('\r\n\r\n')) {
            return;
          }
          socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok');
        }
      });
      socket.on('error', () => { /* ignore */ });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

async function localhostIsDualStack(): Promise<boolean> {
  const addrs = await new Promise<dns.LookupAddress[]>((resolve) => {
    dns.lookup('localhost', { all: true }, (err, res) => resolve(err ? [] : res));
  });
  if (!addrs.some((a) => a.family === 4) || !addrs.some((a) => a.family === 6)) {
    return false;
  }
  // Node < 17 reorders lookups IPv4-first, so a default agent never reaches an ::1-only server.
  const first = await new Promise<number>((resolve) => {
    dns.lookup('localhost', (err, _address, family) => resolve(err ? 0 : family));
  });
  return first === 6;
}

async function canListenOnIPv6Loopback(): Promise<boolean> {
  const probe = http.createServer();
  try {
    await listen(probe, '::1');
    await close(probe);
    return true;
  } catch (err) {
    return false;
  }
}

function newRequest(port: number, host = 'localhost'): $dara.Request {
  const request = new $dara.Request();
  request.method = 'GET';
  request.pathname = '/';
  request.port = port;
  request.headers['host'] = host;
  return request;
}

async function get(request: $dara.Request, runtime: { [key: string]: any } = null): Promise<string> {
  const res = await $dara.doAction(request, runtime);
  assert.strictEqual(res.statusCode, 200);
  return (await res.readBytes()).toString();
}

describe('ipv4Only', function () {
  it('RuntimeOptions should support ipv4Only', function () {
    assert.strictEqual($dara.RuntimeOptions.names().ipv4Only, 'ipv4Only');
    assert.strictEqual($dara.RuntimeOptions.types().ipv4Only, 'boolean');

    const defaults = new $dara.RuntimeOptions({});
    assert.strictEqual(defaults.ipv4Only, undefined);
    assert.strictEqual(defaults.toMap().ipv4Only, undefined);

    const runtime = new $dara.RuntimeOptions({ ipv4Only: true, keepAlive: false });
    assert.strictEqual(runtime.ipv4Only, true);
    assert.strictEqual(runtime.keepAlive, false);
    assert.strictEqual(runtime.toMap().ipv4Only, true);

    const casted = $dara.cast<$dara.RuntimeOptions>({ ipv4Only: 'true' }, new $dara.RuntimeOptions({}));
    assert.strictEqual(casted.ipv4Only, true);
  });

  it('getIPv4OnlyAgent should cache per protocol and keepAlive with family 4', function () {
    const httpAgent = getIPv4OnlyAgent(false, true);
    assert.ok(httpAgent instanceof http.Agent);
    assert.ok(!(httpAgent instanceof https.Agent));
    assert.strictEqual((httpAgent as any).options.family, 4);
    assert.strictEqual((httpAgent as any).keepAlive, true);
    assert.strictEqual(getIPv4OnlyAgent(false, true), httpAgent);

    const noKeepAlive = getIPv4OnlyAgent(false, false);
    assert.notStrictEqual(noKeepAlive, httpAgent);
    assert.strictEqual((noKeepAlive as any).keepAlive, false);

    const httpsAgent = getIPv4OnlyAgent(true, true);
    assert.ok(httpsAgent instanceof https.Agent);
    assert.strictEqual((httpsAgent as any).options.family, 4);
    assert.notStrictEqual(httpsAgent, http.globalAgent);
    assert.notStrictEqual(httpsAgent, https.globalAgent);
    assert.strictEqual((http.globalAgent as any).options.family, undefined);
    assert.strictEqual((https.globalAgent as any).options.family, undefined);
  });

  it('assertIPv4OnlyHost should reject IPv6 literals only', function () {
    assert.throws(() => assertIPv4OnlyHost('::1'), /ipv4Only is enabled but host ::1 is an IPv6 address/);
    assertIPv4OnlyHost('127.0.0.1');
    assertIPv4OnlyHost('localhost');
    assertIPv4OnlyHost('');
  });

  it('package entry should not expose ipv4Only internal helpers', function () {
    const pkg = $dara as any;
    assert.strictEqual(pkg.getIPv4OnlyAgent, undefined);
    assert.strictEqual(pkg.assertIPv4OnlyHost, undefined);
    assert.strictEqual(pkg.ipv4OnlyLookup, undefined);
    assert.strictEqual(pkg.extractWebSocketProtocols, undefined);
    assert.strictEqual(pkg.pinProxyUrlToIpv4, undefined);
    assert.strictEqual(pkg.createSocksProxyAgent, undefined);
  });

  describe('doAction', function () {
    let v6Server: http.Server;
    let v4Server: http.Server;
    let v6Port: number;
    let v4Port: number;

    before(async function () {
      if (!(await localhostIsDualStack()) || !(await canListenOnIPv6Loopback())) {
        this.skip();
      }
      v6Server = createServer();
      await listen(v6Server, '::1');
      v6Port = (v6Server.address() as AddressInfo).port;
      v4Server = createServer();
      await listen(v4Server, '127.0.0.1');
      v4Port = (v4Server.address() as AddressInfo).port;
    });

    after(async function () {
      if (v6Server) {
        await close(v6Server);
      }
      if (v4Server) {
        await close(v4Server);
      }
    });

    it('default (unset/false) should reach an ::1-only server via localhost', async function () {
      assert.strictEqual(await get(newRequest(v6Port)), '::1');
      assert.strictEqual(await get(newRequest(v6Port), {}), '::1');
      assert.strictEqual(await get(newRequest(v6Port), { ipv4Only: false }), '::1');
      assert.strictEqual(await get(newRequest(v6Port), new $dara.RuntimeOptions({ keepAlive: false })), '::1');
    });

    it('ipv4Only=true should fail against an ::1-only server', async function () {
      await assert.rejects(() => get(newRequest(v6Port), { ipv4Only: true, connectTimeout: 1000 }), (err: any) => {
        return err.code === 'ECONNREFUSED' || /ECONNREFUSED/.test(err.message);
      });
      await assert.rejects(() => get(newRequest(v6Port), new $dara.RuntimeOptions({
        ipv4Only: true,
        keepAlive: false,
        connectTimeout: 1000,
      })));
    });

    it('ipv4Only=true should succeed against a 127.0.0.1 server', async function () {
      assert.strictEqual(await get(newRequest(v4Port), { ipv4Only: true }), '127.0.0.1');
      assert.strictEqual(await get(newRequest(v4Port), { ipv4Only: true, keepAlive: false }), '127.0.0.1');
      assert.strictEqual(await get(newRequest(v4Port, '127.0.0.1'), { ipv4Only: true }), '127.0.0.1');
    });

    it('dual-stack request after an ipv4Only one should still use ::1', async function () {
      await assert.rejects(() => get(newRequest(v6Port), { ipv4Only: true, connectTimeout: 1000 }));
      assert.strictEqual(await get(newRequest(v6Port)), '::1');
      assert.strictEqual(await get(newRequest(v6Port), { keepAlive: true }), '::1');
    });

    it('ipv4Only should not reuse a dual-stack keepAlive socket', async function () {
      assert.strictEqual(await get(newRequest(v6Port), { keepAlive: true }), '::1');
      assert.strictEqual(await get(newRequest(v6Port)), '::1');
      await assert.rejects(() => get(newRequest(v6Port), { ipv4Only: true, keepAlive: true, connectTimeout: 1000 }));
      await assert.rejects(() => get(newRequest(v6Port), { ipv4Only: true, connectTimeout: 1000 }));
    });

    it('ipv4Only should reject an IPv6 literal host', async function () {
      assert.strictEqual(await get(newRequest(v6Port, '[::1]')), '::1');
      await assert.rejects(() => get(newRequest(v6Port, '[::1]'), { ipv4Only: true }),
        /ipv4Only is enabled but host ::1 is an IPv6 address/);
    });
  });

  describe('websocket', function () {
    it('ipv4OnlyLookup should only return IPv4 addresses', async function () {
      const single = await new Promise<{ address: string; family: number }>((resolve, reject) => {
        ipv4OnlyLookup('localhost', {}, (err: Error, address: string, family: number) => {
          return err ? reject(err) : resolve({ address, family });
        });
      });
      assert.strictEqual(single.family, 4);

      const all = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
        ipv4OnlyLookup('localhost', { all: true }, (err: Error, addrs: dns.LookupAddress[]) => {
          return err ? reject(err) : resolve(addrs);
        });
      });
      assert.ok(all.length > 0);
      all.forEach((a) => assert.strictEqual(a.family, 4));
    });

    it('SOCKS ipv4Only must resolve destination to IPv4 (ATYP=IPv4), not IPv6', async function () {
      // Mirrors Java Ipv4OnlyTest.socks5ProxyGetsResolvedIpv4TargetWhenIpv4Only.
      const targets: string[] = [];
      const socks = await startSocks5Server(targets);
      try {
        const port = (socks.address() as AddressInfo).port;
        const client = new $dara.DefaultWebSocketClient(new $dara.AbstractWebSocketHandler());
        const ipv4Options: any = {};
        client.configureSOCKS5Proxy(ipv4Options, new $dara.RuntimeOptions({
          socks5Proxy: `socks5://127.0.0.1:${port}`,
          ipv4Only: true,
        }));
        // Call agent.callback WITHOUT family/lookup in opts — proves the pin lives on the agent
        // (ws does not reliably forward wsOptions.family/lookup once an agent is set).
        // Use a fake req: a real http.ClientRequest may race a direct dial to localhost:1.
        const agent = ipv4Options.agent;
        const fakeReq: any = new EventEmitter();
        fakeReq.destroy = () => { /* no-op */ };
        const socket: Socket = await agent.callback(fakeReq, {
          host: 'localhost',
          port: 1,
          secureEndpoint: false,
        });
        await new Promise<void>((resolve, reject) => {
          socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
          let body = '';
          socket.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          socket.on('end', () => {
            assert.ok(body.includes('ok'));
            resolve();
          });
          socket.on('error', reject);
        });
        assert.deepStrictEqual(targets, ['ipv4:127.0.0.1']);
        assert.ok(createSocksProxyAgent(`socks5://127.0.0.1:${port}`, false));
      } finally {
        await close(socks);
      }
    });

    it('configureHTTPProxy should pin the proxy hop to IPv4 when ipv4Only', function () {
      const client = new $dara.DefaultWebSocketClient(new $dara.AbstractWebSocketHandler());

      const httpsOptions: any = {};
      const request = new $dara.Request();
      client.configureHTTPProxy(httpsOptions, new URL('wss://example.com/ws') as any,
        new $dara.RuntimeOptions({ httpsProxy: 'http://user:pass@proxy.example.com:8080', ipv4Only: true }), request);
      assert.strictEqual(httpsOptions.agent.proxy.family, 4);
      assert.strictEqual(httpsOptions.agent.proxy.host, 'proxy.example.com');
      assert.strictEqual(httpsOptions.agent.proxy.port, 8080);
      assert.strictEqual(request.headers['Proxy-Authorization'], 'Basic dXNlcjpwYXNz');
      // CONNECT tunnel agent is used for both wss and ws
      assert.strictEqual(httpsOptions.agent.constructor.name, 'HttpsProxyAgent');

      const httpOptions: any = {};
      client.configureHTTPProxy(httpOptions, new URL('ws://example.com/ws') as any,
        new $dara.RuntimeOptions({ httpProxy: 'http://proxy.example.com:8080', ipv4Only: true }), new $dara.Request());
      assert.strictEqual(httpOptions.agent.proxy.family, 4);
      assert.strictEqual(httpOptions.agent.constructor.name, 'HttpsProxyAgent');

      const dualOptions: any = {};
      client.configureHTTPProxy(dualOptions, new URL('ws://example.com/ws') as any,
        new $dara.RuntimeOptions({ httpProxy: 'http://proxy.example.com:8080' }), new $dara.Request());
      assert.strictEqual(dualOptions.agent.proxy.family, undefined);
      assert.strictEqual(dualOptions.agent.constructor.name, 'HttpsProxyAgent');

      assert.throws(() => client.configureHTTPProxy({} as any, new URL('ws://example.com/ws') as any,
        new $dara.RuntimeOptions({ httpProxy: 'http://[::1]:8080', ipv4Only: true }), new $dara.Request()),
        /ipv4Only is enabled but host ::1 is an IPv6 address/);
    });

    it('extractWebSocketProtocols should move Sec-WebSocket-Protocol into protocols', function () {
      const headers = { 'Sec-WebSocket-Protocol': 'dara.v1, dara.v2', 'X-Other': '1' };
      assert.deepStrictEqual(extractWebSocketProtocols(headers), ['dara.v1', 'dara.v2']);
      assert.strictEqual(headers['Sec-WebSocket-Protocol'], undefined);
      assert.strictEqual(headers['X-Other'], '1');
      assert.deepStrictEqual(extractWebSocketProtocols({}), []);
      assert.deepStrictEqual(extractWebSocketProtocols({ 'Sec-WebSocket-Protocol': '' }), []);
    });

    it('pinProxyUrlToIpv4 should resolve hostnames and reject bad input', async function () {
      assert.strictEqual(await pinProxyUrlToIpv4('socks5://127.0.0.1:1080'), 'socks5://127.0.0.1:1080');
      assert.strictEqual(await pinProxyUrlToIpv4('socks5://user:pass@127.0.0.1:1080'), 'socks5://user:pass@127.0.0.1:1080');
      const pinned = await pinProxyUrlToIpv4('socks5://localhost:1080');
      assert.ok(pinned.startsWith('socks5://127.0.0.1:1080'));
      await assert.rejects(() => pinProxyUrlToIpv4('socks5://'), /invalid proxy URL/);
      await assert.rejects(() => pinProxyUrlToIpv4('socks5://[::1]:1080'), /IPv6 address/);
    });

    describe('connect', function () {
      let v6: { server: http.Server; wss: WebSocketServer };
      let v4: { server: http.Server; wss: WebSocketServer };

      function createWsServer(): { server: http.Server; wss: WebSocketServer } {
        const server = http.createServer();
        const wss = new WebSocketServer({ server });
        return { server, wss };
      }

      async function closeWsServer(s: { server: http.Server; wss: WebSocketServer }): Promise<void> {
        Array.from(s.wss.clients).forEach((c) => c.terminate());
        await new Promise<void>((resolve) => s.wss.close(() => resolve()));
        await close(s.server);
      }

      function wsRequest(server: http.Server, host = 'localhost'): $dara.Request {
        const request = new $dara.Request();
        request.protocol = 'ws';
        request.domain = `${host}:${(server.address() as AddressInfo).port}`;
        request.pathname = '/';
        request.headers = {};
        return request;
      }

      function runtime(ipv4Only?: boolean): $dara.RuntimeOptions {
        return new $dara.RuntimeOptions({
          connectTimeout: 2000,
          webSocketPingInterval: 0,
          webSocketEnableReconnect: false,
          ipv4Only,
        });
      }

      before(async function () {
        if (!(await localhostIsDualStack()) || !(await canListenOnIPv6Loopback())) {
          this.skip();
        }
        v6 = createWsServer();
        await listen(v6.server, '::1');
        v4 = createWsServer();
        await listen(v4.server, '127.0.0.1');
      });

      after(async function () {
        if (v6) {
          await closeWsServer(v6);
        }
        if (v4) {
          await closeWsServer(v4);
        }
      });

      it('dual-stack should connect to an ::1-only server via localhost', async function () {
        const client = $dara.newDefaultWebSocketClient(new $dara.AbstractWebSocketHandler());
        await client.connect(wsRequest(v6.server), runtime());
        assert.strictEqual(client.isConnected(), true);
        await client.close();
      });

      it('ipv4Only should fail to connect to an ::1-only server', async function () {
        const client = $dara.newDefaultWebSocketClient(new $dara.AbstractWebSocketHandler());
        await assert.rejects(() => client.connect(wsRequest(v6.server), runtime(true)));
        assert.strictEqual(client.isConnected(), false);
        await client.close();
      });

      it('ipv4Only should connect to a 127.0.0.1 server via localhost', async function () {
        const client = $dara.newDefaultWebSocketClient(new $dara.AbstractWebSocketHandler());
        await client.connect(wsRequest(v4.server), runtime(true));
        assert.strictEqual(client.isConnected(), true);
        await client.close();
      });

      it('connect should not mutate caller Sec-WebSocket-Protocol on request.headers', async function () {
        const request = wsRequest(v4.server, '127.0.0.1');
        request.headers = { 'Sec-WebSocket-Protocol': 'dara.v1' };
        const client = $dara.newDefaultWebSocketClient(new $dara.AbstractWebSocketHandler());
        await client.connect(request, runtime());
        assert.strictEqual(request.headers['Sec-WebSocket-Protocol'], 'dara.v1');
        assert.strictEqual(client.isConnected(), true);
        await client.close();
      });

      it('ipv4Only should reject an IPv6 literal host', async function () {
        const client = $dara.newDefaultWebSocketClient(new $dara.AbstractWebSocketHandler());
        await assert.rejects(() => client.connect(wsRequest(v6.server, '[::1]'), runtime(true)),
          /ipv4Only is enabled but host ::1 is an IPv6 address/);
        assert.strictEqual(client.isConnected(), false);
        await client.close();
      });

      it('ipv4Only should pin SOCKS5 proxy hop to IPv4 before dialing', async function () {
        const client = $dara.newDefaultWebSocketClient(new $dara.AbstractWebSocketHandler());
        // Pin succeeds (127.0.0.1); dial then fails because no SOCKS listener is running.
        await assert.rejects(() => client.connect(wsRequest(v4.server), new $dara.RuntimeOptions({
          connectTimeout: 500,
          webSocketPingInterval: 0,
          webSocketEnableReconnect: false,
          ipv4Only: true,
          socks5Proxy: 'socks5://127.0.0.1:1',
        })));
        assert.strictEqual(client.isConnected(), false);
        await client.close();
      });

      it('ipv4Only should fail when SOCKS5 proxy host is IPv6-only', async function () {
        const client = $dara.newDefaultWebSocketClient(new $dara.AbstractWebSocketHandler());
        await assert.rejects(() => client.connect(wsRequest(v4.server), new $dara.RuntimeOptions({
          connectTimeout: 2000,
          webSocketPingInterval: 0,
          webSocketEnableReconnect: false,
          ipv4Only: true,
          socks5Proxy: 'socks5://[::1]:1080',
        })), /ipv4Only is enabled but host ::1 is an IPv6 address/);
        assert.strictEqual(client.isConnected(), false);
        await client.close();
      });
    });
  });
});
