'use strict';

import dns from 'dns';
import http from 'http';
import https from 'https';
import 'mocha';
import assert from 'assert';
import { AddressInfo } from 'net';
import { WebSocketServer } from 'ws';

import * as $dara from '../src/index';

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

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
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
  it('getIPv4OnlyAgent should cache per protocol and keepAlive with family 4', function () {
    const httpAgent = $dara.getIPv4OnlyAgent(false, true);
    assert.ok(httpAgent instanceof http.Agent);
    assert.ok(!(httpAgent instanceof https.Agent));
    assert.strictEqual((httpAgent as any).options.family, 4);
    assert.strictEqual((httpAgent as any).keepAlive, true);
    assert.strictEqual($dara.getIPv4OnlyAgent(false, true), httpAgent);

    const noKeepAlive = $dara.getIPv4OnlyAgent(false, false);
    assert.notStrictEqual(noKeepAlive, httpAgent);
    assert.strictEqual((noKeepAlive as any).keepAlive, false);

    const httpsAgent = $dara.getIPv4OnlyAgent(true, true);
    assert.ok(httpsAgent instanceof https.Agent);
    assert.strictEqual((httpsAgent as any).options.family, 4);
    assert.notStrictEqual(httpsAgent, http.globalAgent);
    assert.notStrictEqual(httpsAgent, https.globalAgent);
    assert.strictEqual((http.globalAgent as any).options.family, undefined);
    assert.strictEqual((https.globalAgent as any).options.family, undefined);
  });

  it('assertIPv4OnlyHost should reject IPv6 literals only', function () {
    assert.throws(() => $dara.assertIPv4OnlyHost('::1'), /ipv4Only is enabled but host ::1 is an IPv6 address/);
    $dara.assertIPv4OnlyHost('127.0.0.1');
    $dara.assertIPv4OnlyHost('localhost');
    $dara.assertIPv4OnlyHost('');
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
      // ipv4Only is read from the plain runtime map (not RuntimeOptions model fields)
      await assert.rejects(() => get(newRequest(v6Port), {
        ipv4Only: true,
        keepAlive: false,
        connectTimeout: 1000,
      }));
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
        $dara.ipv4OnlyLookup('localhost', {}, (err: Error, address: string, family: number) => {
          return err ? reject(err) : resolve({ address, family });
        });
      });
      assert.strictEqual(single.family, 4);

      const all = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
        $dara.ipv4OnlyLookup('localhost', { all: true }, (err: Error, addrs: dns.LookupAddress[]) => {
          return err ? reject(err) : resolve(addrs);
        });
      });
      assert.ok(all.length > 0);
      all.forEach((a) => assert.strictEqual(a.family, 4));
    });

    it('configureHTTPProxy should pin the proxy hop to IPv4 when ipv4Only', function () {
      const client = new $dara.DefaultWebSocketClient(new $dara.AbstractWebSocketHandler());

      const httpsOptions: any = {};
      const request = new $dara.Request();
      // ipv4Only is read from the plain runtime map, not RuntimeOptions model fields
      client.configureHTTPProxy(httpsOptions, new URL('wss://example.com/ws') as any,
        { httpsProxy: 'http://user:pass@proxy.example.com:8080', ipv4Only: true } as any, request);
      assert.strictEqual(httpsOptions.agent.proxy.family, 4);
      assert.strictEqual(httpsOptions.agent.proxy.host, 'proxy.example.com');
      assert.strictEqual(httpsOptions.agent.proxy.port, 8080);
      assert.strictEqual(request.headers['Proxy-Authorization'], 'Basic dXNlcjpwYXNz');

      const httpOptions: any = {};
      client.configureHTTPProxy(httpOptions, new URL('ws://example.com/ws') as any,
        { httpProxy: 'http://proxy.example.com:8080', ipv4Only: true } as any, new $dara.Request());
      assert.strictEqual(httpOptions.agent.proxy.family, 4);

      const dualOptions: any = {};
      client.configureHTTPProxy(dualOptions, new URL('ws://example.com/ws') as any,
        new $dara.RuntimeOptions({ httpProxy: 'http://proxy.example.com:8080' }), new $dara.Request());
      assert.strictEqual(dualOptions.agent.proxy.family, undefined);
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

      function runtime(ipv4Only?: boolean): any {
        // Pass ipv4Only via plain runtime map (not RuntimeOptions model field)
        return {
          connectTimeout: 2000,
          webSocketPingInterval: 0,
          webSocketEnableReconnect: false,
          ipv4Only,
        };
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

      it('ipv4Only should reject an IPv6 literal host', async function () {
        const client = $dara.newDefaultWebSocketClient(new $dara.AbstractWebSocketHandler());
        await assert.rejects(() => client.connect(wsRequest(v6.server, '[::1]'), runtime(true)),
          /ipv4Only is enabled but host ::1 is an IPv6 address/);
        assert.strictEqual(client.isConnected(), false);
        await client.close();
      });
    });
  });
});
