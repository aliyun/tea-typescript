'use strict';

import http from 'http';
import https from 'https';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AddressInfo, Socket } from 'net';
import 'mocha';
import assert from 'assert';
import WebSocket, { WebSocketServer } from 'ws';

import * as $dara from '../src/index';

class MockWebSocketHandler extends $dara.AbstractWebSocketHandler {
  connectedCalled = false;
  messageReceivedCount = 0;
  errorCount = 0;
  closedCalled = false;
  lastMessage: $dara.WebSocketMessage | null = null;

  afterConnectionEstablished(_session: $dara.WebSocketSessionInfo): void {
    this.connectedCalled = true;
  }

  handleRawMessage(_session: $dara.WebSocketSessionInfo, message: $dara.WebSocketMessage): void {
    this.messageReceivedCount++;
    this.lastMessage = message;
  }

  handleError(_session: $dara.WebSocketSessionInfo, _err: Error): void {
    this.errorCount++;
  }

  afterConnectionClosed(_session: $dara.WebSocketSessionInfo, _code: number, _reason: string): void {
    this.closedCalled = true;
  }
}

class ErrorOnConnectHandler extends MockWebSocketHandler {
  afterConnectionEstablished(_session: $dara.WebSocketSessionInfo): void {
    throw new Error('test error on connection');
  }
}

function createTestWebSocketServer(): { server: http.Server; wss: WebSocketServer; close: () => Promise<void> } {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    ws.on('message', (data, isBinary) => {
      ws.send(data, { binary: isBinary });
    });
  });
  return {
    server,
    wss,
    close: () => new Promise((resolve, reject) => {
      Array.from(wss.clients).forEach((client) => client.terminate());
      wss.close(() => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }),
  };
}

describe('WebSocket', function () {
  this.timeout(15000);

  it('should create DefaultWebSocketClient', function () {
    const handler = new MockWebSocketHandler();
    const client = $dara.newDefaultWebSocketClient(handler);
    assert.ok(client);
    assert.strictEqual(client.isConnected(), false);
    assert.throws(() => $dara.newDefaultWebSocketClient(null as any), /handler cannot be nil/);
  });

  it('should define WebSocketMessageType values', function () {
    assert.strictEqual($dara.WebSocketMessageType.Text, 0);
    assert.strictEqual($dara.WebSocketMessageType.Binary, 1);
  });

  it('should convert websocket message types', function () {
    assert.strictEqual($dara.convertToWebSocketMessageType(1), $dara.WebSocketMessageType.Text);
    assert.strictEqual($dara.convertToWebSocketMessageType(2), $dara.WebSocketMessageType.Binary);
    assert.strictEqual($dara.convertToWebSocketMessageType(9), $dara.WebSocketMessageType.Ping);
    assert.strictEqual($dara.convertToWebSocketMessageType(10), $dara.WebSocketMessageType.Pong);
    assert.strictEqual($dara.convertToWebSocketMessageType(8), $dara.WebSocketMessageType.Close);
    assert.strictEqual($dara.convertToWebSocketMessageType(999), $dara.WebSocketMessageType.Binary);
  });

  it('should invoke mock handler callbacks', function () {
    const handler = new MockWebSocketHandler();
    const session: $dara.WebSocketSessionInfo = {
      sessionID: 'test',
      requestID: '',
      connectedAt: new Date(),
      remoteAddr: '',
      localAddr: '',
      attributes: {},
    };

    handler.afterConnectionEstablished(session);
    assert.strictEqual(handler.connectedCalled, true);

    const msg: $dara.WebSocketMessage = {
      type: $dara.WebSocketMessageType.Text,
      payload: Buffer.from('test message'),
      headers: {},
      timestamp: new Date(),
    };
    handler.handleRawMessage(session, msg);
    handler.handleRawMessage(session, msg);
    assert.strictEqual(handler.messageReceivedCount, 2);
    assert.strictEqual(handler.lastMessage?.payload.toString(), 'test message');

    handler.handleError(session, new Error('test'));
    assert.strictEqual(handler.errorCount, 1);

    handler.afterConnectionClosed(session, 1000, 'Normal');
    assert.strictEqual(handler.closedCalled, true);
  });

  describe('DefaultWebSocketClient.connect', function () {
    let testServer: ReturnType<typeof createTestWebSocketServer>;
    let wsURL = '';

    before(async function () {
      testServer = createTestWebSocketServer();
      await new Promise<void>((resolve) => testServer.server.listen(0, resolve));
      const addr = testServer.server.address() as AddressInfo;
      wsURL = `ws://127.0.0.1:${addr.port}`;
    });

    after(async function () {
      await testServer.close();
    });

    it('should connect successfully', async function () {
      const request = new $dara.Request();
      const parsed = new URL(wsURL);
      request.protocol = parsed.protocol.replace(':', '');
      request.domain = parsed.host;
      request.pathname = parsed.pathname;
      request.headers = {};

      const runtimeObject = new $dara.RuntimeOptions({
        connectTimeout: 5000,
        readTimeout: 30000,
        webSocketPingInterval: 0,
        webSocketEnableReconnect: false,
      });

      const handler = new MockWebSocketHandler();
      const client = $dara.newDefaultWebSocketClient(handler);
      const response = await client.connect(request, runtimeObject);

      assert.ok(response);
      assert.strictEqual(client.isConnected(), true);
      assert.strictEqual(handler.connectedCalled, true);
      assert.ok(client.session?.sessionID);

      await client.disconnect();
    });

    it('should fail when domain is missing', async function () {
      const request = new $dara.Request();
      request.protocol = 'ws';
      request.headers = {};

      const runtimeObject = new $dara.RuntimeOptions({
        connectTimeout: 5000,
        readTimeout: 30000,
      });

      const handler = new MockWebSocketHandler();
      const client = $dara.newDefaultWebSocketClient(handler);

      await assert.rejects(
        () => client.connect(request, runtimeObject),
        /domain is required/,
      );
      assert.strictEqual(client.isConnected(), false);
    });

    it('should fail on connection timeout', async function () {
      const request = new $dara.Request();
      request.protocol = 'ws';
      request.domain = '127.0.0.1:59999';
      request.pathname = '/';
      request.headers = {};

      const runtimeObject = new $dara.RuntimeOptions({
        connectTimeout: 100,
        readTimeout: 30000,
        webSocketHandshakeTimeout: 100,
      });

      const handler = new MockWebSocketHandler();
      const client = $dara.newDefaultWebSocketClient(handler);

      await assert.rejects(() => client.connect(request, runtimeObject));
      assert.strictEqual(client.isConnected(), false);
      assert.strictEqual(handler.connectedCalled, false);
    });

    it('should connect with custom headers', async function () {
      const request = new $dara.Request();
      const parsed = new URL(wsURL);
      request.protocol = parsed.protocol.replace(':', '');
      request.domain = parsed.host;
      request.pathname = parsed.pathname;
      request.headers = {
        'X-Custom-Header': 'test-value',
        'User-Agent': 'test-agent',
      };

      const runtimeObject = new $dara.RuntimeOptions({
        connectTimeout: 5000,
        readTimeout: 30000,
        webSocketPingInterval: 0,
      });

      const handler = new MockWebSocketHandler();
      const client = $dara.newDefaultWebSocketClient(handler);
      const response = await client.connect(request, runtimeObject);
      assert.ok(response);
      await client.disconnect();
    });

    it('should fail when handler returns error on connect', async function () {
      const request = new $dara.Request();
      const parsed = new URL(wsURL);
      request.protocol = parsed.protocol.replace(':', '');
      request.domain = parsed.host;
      request.pathname = parsed.pathname;
      request.headers = {};

      const runtimeObject = new $dara.RuntimeOptions({
        connectTimeout: 5000,
        readTimeout: 30000,
        webSocketPingInterval: 0,
      });

      const client = $dara.newDefaultWebSocketClient(new ErrorOnConnectHandler());
      await assert.rejects(
        () => client.connect(request, runtimeObject),
        /test error on connection/,
      );
      await client.disconnect();
    });

    it('should connect with ping interval enabled', async function () {
      const request = new $dara.Request();
      const parsed = new URL(wsURL);
      request.protocol = parsed.protocol.replace(':', '');
      request.domain = parsed.host;
      request.pathname = parsed.pathname;
      request.headers = {};

      const runtimeObject = new $dara.RuntimeOptions({
        connectTimeout: 5000,
        readTimeout: 30000,
        webSocketPingInterval: 1000,
        webSocketPongTimeout: 500,
      });

      const handler = new MockWebSocketHandler();
      const client = $dara.newDefaultWebSocketClient(handler);
      const response = await client.connect(request, runtimeObject);
      assert.ok(response);
      await $dara.sleep(100);
      await client.disconnect();
    });
  });

  it('should reject reconnect when already connected', async function () {
    const testServer = createTestWebSocketServer();
    await new Promise<void>((resolve) => testServer.server.listen(0, resolve));
    const addr = testServer.server.address() as AddressInfo;

    const handler = new MockWebSocketHandler();
    const request = new $dara.Request();
    request.protocol = 'ws';
    request.domain = `127.0.0.1:${addr.port}`;
    request.pathname = '/';
    request.headers = { host: `127.0.0.1:${addr.port}` };

    const runtimeObject = new $dara.RuntimeOptions({
      webSocketEnableReconnect: true,
      webSocketMaxReconnectTimes: 3,
      webSocketReconnectInterval: 1000,
      webSocketHandshakeTimeout: 5000,
      webSocketPingInterval: 0,
      webSocketHandler: handler,
    });

    const { client } = await $dara.newWebSocketClientAndConnect(request, runtimeObject);
    assert.strictEqual(client.isConnected(), true);

    await assert.rejects(() => client.reconnect(), /already connected/);
    await client.close();
    await testServer.close();
  });

  it('should configure TLS options', function () {
    const client = new $dara.DefaultWebSocketClient(new MockWebSocketHandler());
    const ignoreSSL = client.configureTLS(new $dara.RuntimeOptions({ ignoreSSL: true }));
    assert.strictEqual(ignoreSSL.rejectUnauthorized, false);

    const verifySSL = client.configureTLS(new $dara.RuntimeOptions({ ignoreSSL: false }));
    assert.strictEqual(verifySSL.rejectUnauthorized, true);
  });

  it('should configure HTTP proxy', function () {
    const client = new $dara.DefaultWebSocketClient(new MockWebSocketHandler());
    const wsOptions: any = {};
    const parsed = urlParse('wss://example.com/ws');
    const request = new $dara.Request();
    request.headers = {};

    client.configureHTTPProxy(wsOptions, parsed, new $dara.RuntimeOptions({}), request);
    assert.strictEqual(wsOptions.agent, undefined);

    client.configureHTTPProxy(
      wsOptions,
      parsed,
      new $dara.RuntimeOptions({ httpsProxy: 'http://proxy.example.com:8080' }),
      request,
    );
    assert.ok(wsOptions.agent);

    const noProxyOptions: any = {};
    client.configureHTTPProxy(
      noProxyOptions,
      parsed,
      new $dara.RuntimeOptions({ httpsProxy: 'http://proxy.example.com:8080', noProxy: 'example.com' }),
      request,
    );
    assert.strictEqual(noProxyOptions.agent, undefined);

    const authRequest = new $dara.Request();
    authRequest.headers = {};
    const authOptions: any = {};
    client.configureHTTPProxy(
      authOptions,
      parsed,
      new $dara.RuntimeOptions({ httpsProxy: 'http://user:pass@proxy.example.com:8080' }),
      authRequest,
    );
    assert.ok(authRequest.headers['Proxy-Authorization']);
    assert.strictEqual(authRequest.headers['Proxy-Authorization'], 'Basic dXNlcjpwYXNz');
  });

  it('should configure SOCKS5 proxy', function () {
    const client = new $dara.DefaultWebSocketClient(new MockWebSocketHandler());
    const wsOptions: any = {};
    client.configureSOCKS5Proxy(
      wsOptions,
      new $dara.RuntimeOptions({ socks5Proxy: 'socks5://user:pass@127.0.0.1:1080' }),
    );
    assert.ok(wsOptions.agent);

    const emptyOptions: any = {};
    client.configureSOCKS5Proxy(emptyOptions, new $dara.RuntimeOptions({}));
    assert.strictEqual(emptyOptions.agent, undefined);
  });

  it('should expose websocket runtime getters', function () {
    assert.strictEqual($dara.getWebSocketPingInterval(null), undefined);
    assert.strictEqual($dara.getWebSocketPongTimeout(undefined), undefined);

    const runtime = new $dara.RuntimeOptions({
      webSocketPingInterval: 1000,
      webSocketPongTimeout: 2000,
      webSocketEnableReconnect: true,
      webSocketReconnectInterval: 3000,
      webSocketMaxReconnectTimes: 4,
      webSocketWriteTimeout: 5000,
      webSocketHandshakeTimeout: 6000,
      webSocketHandler: new MockWebSocketHandler(),
    });
    assert.strictEqual($dara.getWebSocketPingInterval(runtime), 1000);
    assert.strictEqual($dara.getWebSocketPongTimeout(runtime), 2000);
    assert.strictEqual($dara.getWebSocketEnableReconnect(runtime), true);
    assert.strictEqual($dara.getWebSocketReconnectInterval(runtime), 3000);
    assert.strictEqual($dara.getWebSocketMaxReconnectTimes(runtime), 4);
    assert.strictEqual($dara.getWebSocketWriteTimeout(runtime), 5000);
    assert.strictEqual($dara.getWebSocketHandshakeTimeout(runtime), 6000);
    assert.ok($dara.getWebSocketHandler(runtime));
  });

  it('should use AbstractWebSocketHandler defaults', function () {
    const handler = new $dara.AbstractWebSocketHandler();
    const session: $dara.WebSocketSessionInfo = {
      sessionID: 's',
      requestID: '',
      connectedAt: new Date(),
      remoteAddr: '',
      localAddr: '',
      attributes: {},
    };
    assert.strictEqual(handler.afterConnectionEstablished(session), undefined);
    assert.strictEqual(handler.handleRawMessage(session, {
      type: $dara.WebSocketMessageType.Text,
      payload: Buffer.from('x'),
      headers: {},
      timestamp: new Date(),
    }), undefined);
    assert.strictEqual(handler.handleError(session, new Error('e')), undefined);
    assert.strictEqual(handler.afterConnectionClosed(session, 1000, 'ok'), undefined);
  });

  it('should build websocket urls', function () {
    assert.throws(() => $dara.buildWebSocketURL(null as any), /request cannot be nil/);

    const fromHttp = new $dara.Request();
    fromHttp.protocol = 'http';
    fromHttp.domain = 'example.com';
    fromHttp.pathname = '/ws';
    assert.strictEqual($dara.buildWebSocketURL(fromHttp), 'ws://example.com/ws');

    const fromHttps = new $dara.Request();
    fromHttps.protocol = 'https';
    fromHttps.headers = { host: 'secure.example.com' };
    fromHttps.query = { a: '1', b: '2' };
    assert.strictEqual(
      $dara.buildWebSocketURL(fromHttps),
      'wss://secure.example.com/?a=1&b=2',
    );
  });

  it('should create websocket response with normalized headers', function () {
    const res = $dara.newWebSocketResponse(101, 'Switching Protocols', {
      'X-Acs-Request-Id': 'req-1',
      'set-cookie': ['a=1', 'b=2'],
      empty: undefined as any,
    });
    assert.strictEqual(res.statusCode, 101);
    assert.strictEqual(res.statusMessage, 'Switching Protocols');
    assert.strictEqual(res.headers['x-acs-request-id'], 'req-1');
    assert.strictEqual(res.headers['set-cookie'], 'a=1');
  });

  it('should configure TLS with cert key and ca', function () {
    const client = new $dara.DefaultWebSocketClient(new MockWebSocketHandler());
    const tls = client.configureTLS(new $dara.RuntimeOptions({
      ignoreSSL: false,
      key: 'key-pem',
      cert: 'cert-pem',
      ca: 'ca-pem',
    }));
    assert.strictEqual(tls.rejectUnauthorized, true);
    assert.strictEqual(tls.key, 'key-pem');
    assert.strictEqual(tls.cert, 'cert-pem');
    assert.strictEqual(tls.ca, 'ca-pem');
  });

  it('should configure proxy via socks5 and http protocol', function () {
    const client = new $dara.DefaultWebSocketClient(new MockWebSocketHandler());
    const socksOptions: any = {};
    client.configureProxy(
      socksOptions,
      urlParse('ws://example.com/ws'),
      new $dara.RuntimeOptions({ socks5Proxy: 'socks5://127.0.0.1:1080' }),
      new $dara.Request(),
    );
    assert.ok(socksOptions.agent);

    const httpOptions: any = {};
    const request = new $dara.Request();
    request.headers = {};
    client.configureHTTPProxy(
      httpOptions,
      urlParse('ws://example.com/ws'),
      new $dara.RuntimeOptions({ httpProxy: 'http://proxy.example.com:8080' }),
      request,
    );
    assert.ok(httpOptions.agent);

    const nullParsed: any = {};
    client.configureHTTPProxy(
      nullParsed,
      null,
      new $dara.RuntimeOptions({ httpProxy: 'http://proxy.example.com:8080' }),
      request,
    );
    assert.strictEqual(nullParsed.agent, undefined);
  });

  it('should use env proxy when runtime proxy is missing', function () {
    const client = new $dara.DefaultWebSocketClient(new MockWebSocketHandler());
    const prevHttp = process.env.HTTP_PROXY;
    const prevHttps = process.env.HTTPS_PROXY;
    const prevNoProxy = process.env.NO_PROXY;
    try {
      process.env.HTTP_PROXY = 'http://env-proxy:8080';
      process.env.HTTPS_PROXY = 'http://env-https-proxy:8080';
      delete process.env.NO_PROXY;
      delete process.env.no_proxy;

      const wsOptions: any = {};
      client.configureHTTPProxy(
        wsOptions,
        urlParse('ws://example.com/ws'),
        new $dara.RuntimeOptions({}),
        new $dara.Request(),
      );
      assert.ok(wsOptions.agent);

      const wssOptions: any = {};
      client.configureHTTPProxy(
        wssOptions,
        urlParse('wss://example.com/ws'),
        new $dara.RuntimeOptions({}),
        new $dara.Request(),
      );
      assert.ok(wssOptions.agent);
    } finally {
      if (prevHttp === undefined) delete process.env.HTTP_PROXY; else process.env.HTTP_PROXY = prevHttp;
      if (prevHttps === undefined) delete process.env.HTTPS_PROXY; else process.env.HTTPS_PROXY = prevHttps;
      if (prevNoProxy === undefined) delete process.env.NO_PROXY; else process.env.NO_PROXY = prevNoProxy;
    }
  });

  describe('DefaultWebSocketClient messaging and reconnect', function () {
    let testServer: ReturnType<typeof createTestWebSocketServer>;
    let wsURL = '';

    before(async function () {
      testServer = createTestWebSocketServer();
      await new Promise<void>((resolve) => testServer.server.listen(0, resolve));
      const addr = testServer.server.address() as AddressInfo;
      wsURL = `ws://127.0.0.1:${addr.port}`;
    });

    after(async function () {
      await testServer.close();
    });

    function buildRequest(): $dara.Request {
      const request = new $dara.Request();
      const parsed = new URL(wsURL);
      request.protocol = parsed.protocol.replace(':', '');
      request.domain = parsed.host;
      request.pathname = parsed.pathname;
      request.headers = {};
      return request;
    }

    it('should reject nil request or runtime on connect', async function () {
      const client = $dara.newDefaultWebSocketClient(new MockWebSocketHandler());
      await assert.rejects(() => client.connect(null as any, new $dara.RuntimeOptions({})), /request cannot be nil/);
      await assert.rejects(() => client.connect(buildRequest(), null as any), /runtimeObject cannot be nil/);
    });

    it('should send text and binary messages', async function () {
      const handler = new MockWebSocketHandler();
      const client = $dara.newDefaultWebSocketClient(handler);
      await client.connect(buildRequest(), new $dara.RuntimeOptions({
        connectTimeout: 5000,
        webSocketPingInterval: 0,
        webSocketWriteTimeout: 5000,
      }));

      assert.ok(client.getSessionInfo()?.sessionID);
      await client.sendText('hello-ws');
      for (let i = 0; i < 20 && handler.messageReceivedCount < 1; i++) {
        await $dara.sleep(25);
      }
      assert.ok(handler.messageReceivedCount >= 1);
      assert.strictEqual(handler.lastMessage?.type, $dara.WebSocketMessageType.Text);
      assert.strictEqual(handler.lastMessage?.payload.toString(), 'hello-ws');

      await client.sendBinary(Buffer.from([1, 2, 3]));
      for (let i = 0; i < 20 && handler.messageReceivedCount < 2; i++) {
        await $dara.sleep(25);
      }
      assert.ok(handler.messageReceivedCount >= 2);
      assert.strictEqual(handler.lastMessage?.type, $dara.WebSocketMessageType.Binary);

      await client.disconnect();
    });

    it('should reject send when disconnected', async function () {
      const client = $dara.newDefaultWebSocketClient(new MockWebSocketHandler());
      await assert.rejects(() => client.sendText('x'), /not connected/);
      await assert.rejects(() => client.sendBinary(Buffer.from('x')), /not connected/);
    });

    it('should reject reconnect when disabled', async function () {
      const handler = new MockWebSocketHandler();
      const client = $dara.newDefaultWebSocketClient(handler);
      const request = buildRequest();
      await client.connect(request, new $dara.RuntimeOptions({
        connectTimeout: 5000,
        webSocketPingInterval: 0,
        webSocketEnableReconnect: false,
        webSocketReconnectInterval: 10,
      }));
      await client.disconnect();
      await assert.rejects(() => client.reconnect(), /reconnect is disabled/);
    });

    it('should reconnect gracefully with session id header', async function () {
      const handler = new MockWebSocketHandler();
      const client = $dara.newDefaultWebSocketClient(handler);
      const request = buildRequest();
      await client.connect(request, new $dara.RuntimeOptions({
        connectTimeout: 5000,
        webSocketPingInterval: 0,
        webSocketEnableReconnect: true,
        webSocketReconnectInterval: 20,
        webSocketMaxReconnectTimes: 3,
      }));
      const sessionId = client.session!.sessionID;
      assert.ok(sessionId);

      const response = await client.reconnectGracefully();
      assert.ok(response);
      assert.strictEqual(client.isConnected(), true);
      assert.strictEqual(request.headers['X-Acs-Ws-Session-Id'], sessionId);
      await client.close();
    });

    it('should fail reconnect when max times reached', async function () {
      const client = $dara.newDefaultWebSocketClient(new MockWebSocketHandler());
      const request = buildRequest();
      await client.connect(request, new $dara.RuntimeOptions({
        connectTimeout: 500,
        webSocketPingInterval: 0,
        webSocketEnableReconnect: true,
        webSocketReconnectInterval: 10,
        webSocketMaxReconnectTimes: 1,
        webSocketHandshakeTimeout: 200,
      }));
      // Point at a closed port so the next reconnect attempt fails and increments count
      request.domain = '127.0.0.1:59998';
      await (client as any).cleanupResources();
      await assert.rejects(() => client.reconnect());
      await assert.rejects(() => client.reconnect(), /max reconnect times reached/);
    });

    it('should reject newWebSocketClientAndConnect without handler', async function () {
      await assert.rejects(
        () => $dara.newWebSocketClientAndConnect(buildRequest(), null as any),
        /runtimeObject cannot be nil/,
      );
      await assert.rejects(
        () => $dara.newWebSocketClientAndConnect(buildRequest(), new $dara.RuntimeOptions({})),
        /WebSocketHandler is required/,
      );
    });

    it('should fail on unexpected http response during handshake', async function () {
      const httpOnly = http.createServer((_req, res) => {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('bad');
      });
      await new Promise<void>((resolve) => httpOnly.listen(0, resolve));
      const addr = httpOnly.address() as AddressInfo;
      try {
        const request = new $dara.Request();
        request.protocol = 'ws';
        request.domain = `127.0.0.1:${addr.port}`;
        request.pathname = '/';
        request.headers = {};
        const client = $dara.newDefaultWebSocketClient(new MockWebSocketHandler());
        await assert.rejects(
          () => client.connect(request, new $dara.RuntimeOptions({
            connectTimeout: 2000,
            webSocketHandshakeTimeout: 2000,
            webSocketPingInterval: 0,
          })),
          /WebSocket handshake failed|Unexpected server response|400/,
        );
      } finally {
        await new Promise<void>((resolve, reject) => {
          httpOnly.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });

    it('should invoke handleError when message handler throws', async function () {
      class ThrowOnMessageHandler extends MockWebSocketHandler {
        handleRawMessage(): void {
          throw new Error('message handler failed');
        }
      }
      const handler = new ThrowOnMessageHandler();
      const client = $dara.newDefaultWebSocketClient(handler);
      await client.connect(buildRequest(), new $dara.RuntimeOptions({
        connectTimeout: 5000,
        webSocketPingInterval: 0,
      }));
      await client.sendText('boom');
      await $dara.sleep(80);
      assert.ok(handler.errorCount >= 1);
      await client.disconnect();
    });
  });

  describe('edge paths', function () {
    let testServer: ReturnType<typeof createTestWebSocketServer>;
    let wsURL = '';

    before(async function () {
      testServer = createTestWebSocketServer();
      await new Promise<void>((resolve) => testServer.server.listen(0, resolve));
      const addr = testServer.server.address() as AddressInfo;
      wsURL = `ws://127.0.0.1:${addr.port}`;
    });

    after(async function () {
      await testServer.close();
    });

    function buildRequest(): $dara.Request {
      const request = new $dara.Request();
      const parsed = new URL(wsURL);
      request.protocol = parsed.protocol.replace(':', '');
      request.domain = parsed.host;
      request.pathname = parsed.pathname || '/';
      request.headers = {};
      return request;
    }

    function runtime(extra: { [key: string]: any } = {}): $dara.RuntimeOptions {
      return new $dara.RuntimeOptions({
        connectTimeout: 5000,
        webSocketHandshakeTimeout: 5000,
        webSocketPingInterval: 0,
        webSocketEnableReconnect: true,
        webSocketReconnectInterval: 20,
        webSocketMaxReconnectTimes: 3,
        ...extra,
      });
    }

    it('should no-op disconnect before a connection exists', async function () {
      const client = $dara.newDefaultWebSocketClient(new MockWebSocketHandler());
      await client.disconnect();
      await client.close();
      assert.strictEqual(client.isConnected(), false);
      (client as any).configureNetDialer({}, new $dara.RuntimeOptions({}), 1000);
      await (client as any).waitForClose(null);
      await (client as any).waitForClose({ readyState: WebSocket.CLOSED });
      (client as any).abortController = null;
      await (client as any).sleepInterruptible(5);
    });

    it('should reject an invalid websocket url', async function () {
      const request = new $dara.Request();
      request.protocol = 'ws';
      request.domain = '/missing-host';
      request.headers = {};
      const client = $dara.newDefaultWebSocketClient(new MockWebSocketHandler());
      await assert.rejects(
        () => client.connect(request, runtime()),
        /invalid websocket url/,
      );
    });

    it('should build a url when the path already contains a query', function () {
      const request = new $dara.Request();
      request.protocol = 'HTTP';
      request.domain = 'example.com';
      request.pathname = '/ws?x=1';
      request.query = { a: 'b' };
      assert.strictEqual($dara.buildWebSocketURL(request), 'ws://example.com/ws?x=1&a=b');
    });

    it('should connect over wss and keep the session id from the handshake', async function () {
      const dir = mkdtempSync(join(tmpdir(), 'tea-ws-'));
      const keyPath = join(dir, 'key.pem');
      const certPath = join(dir, 'cert.pem');
      execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048',
        '-keyout', keyPath, '-out', certPath,
        '-days', '1', '-nodes', '-subj', '/CN=127.0.0.1',
      ], { stdio: 'ignore' });
      const key = readFileSync(keyPath);
      const cert = readFileSync(certPath);
      const server = https.createServer({ key, cert });
      const wss = new WebSocketServer({ server });
      wss.on('headers', (headers) => {
        headers.push('x-acs-ws-session-id: server-session');
        headers.push('x-acs-request-id: server-request');
      });
      wss.on('connection', (ws) => {
        ws.on('message', (data, isBinary) => {
          ws.send(data, { binary: isBinary });
        });
      });
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const port = (server.address() as AddressInfo).port;
      try {
        const request = new $dara.Request();
        request.protocol = 'wss';
        request.domain = `127.0.0.1:${port}`;
        request.pathname = '/socket';
        request.query = { q: '1' };
        request.headers = {
          host: 'ignored-host',
          'content-length': '0',
          'x-custom': 'yes',
          empty: '',
        };
        const handler = new MockWebSocketHandler();
        const client = $dara.newDefaultWebSocketClient(handler);
        const response = await client.connect(request, runtime({
          ignoreSSL: true,
          key: key.toString(),
          cert: cert.toString(),
          ca: cert.toString(),
          webSocketEnableReconnect: false,
        }));
        assert.strictEqual(response.statusCode, 101);
        assert.strictEqual(client.getSessionInfo()?.sessionID, 'server-session');
        assert.strictEqual(client.getSessionInfo()?.requestID, 'server-request');
        await client.disconnect();
      } finally {
        await new Promise<void>((resolve) => {
          Array.from(wss.clients).forEach((ws) => ws.terminate());
          wss.close(() => server.close(() => resolve()));
        });
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should time out when the handshake never completes', async function () {
      const hanging = http.createServer();
      const sockets = new Set<Socket>();
      hanging.on('connection', (socket) => {
        sockets.add(socket);
      });
      await new Promise<void>((resolve) => hanging.listen(0, resolve));
      const port = (hanging.address() as AddressInfo).port;
      try {
        const request = new $dara.Request();
        request.protocol = 'ws';
        request.domain = `127.0.0.1:${port}`;
        request.pathname = '/';
        request.headers = undefined as any;
        const client = $dara.newDefaultWebSocketClient(new MockWebSocketHandler());
        await assert.rejects(
          () => client.connect(request, runtime({
            connectTimeout: 80,
            webSocketHandshakeTimeout: 5000,
          })),
          /WebSocket connection timeout/,
        );
      } finally {
        sockets.forEach((socket) => socket.destroy());
        await new Promise<void>((resolve) => hanging.close(() => resolve()));
      }
    });

    it('should cover reconnect guards', async function () {
      const client = $dara.newDefaultWebSocketClient(new MockWebSocketHandler());
      (client as any).runtimeObject = runtime();
      await assert.rejects(
        () => client.reconnectGracefully(),
        /graceful reconnection requires existing session ID/,
      );

      (client as any).request = null;
      await assert.rejects(() => client.reconnect(), /request is nil/);
    });

    it('should reconnect without a session header and reject a concurrent attempt', async function () {
      const handler = new MockWebSocketHandler();
      const client = $dara.newDefaultWebSocketClient(handler);
      const request = buildRequest();
      await client.connect(request, runtime({ webSocketReconnectInterval: 150 }));
      request.headers['X-Acs-Ws-Session-Id'] = 'old-session';
      await client.disconnect();

      const first = client.reconnect();
      await assert.rejects(() => client.reconnect(), /reconnect already in progress/);
      await first;
      assert.strictEqual(request.headers['X-Acs-Ws-Session-Id'], undefined);
      assert.strictEqual(client.isConnected(), true);

      await client.disconnect();
      request.headers = undefined as any;
      await client.reconnect();
      assert.strictEqual(client.isConnected(), true);
      await client.close();
    });

    it('should abort a graceful reconnect and a connection that is already aborted', async function () {
      const client = $dara.newDefaultWebSocketClient(new MockWebSocketHandler());
      const request = buildRequest();
      await client.connect(request, runtime({ webSocketReconnectInterval: 400 }));

      const pending = client.reconnectGracefully();
      await $dara.sleep(80);
      (client as any).abortController.abort();
      await assert.rejects(pending, /connection aborted/);

      await assert.rejects(() => client.reconnectGracefully(), /connection aborted/);
      await client.disconnect();
    });

    it('should use the abort-controller polyfill when AbortController is missing', async function () {
      const original = global.AbortController;
      (global as any).AbortController = undefined;
      try {
        const client = $dara.newDefaultWebSocketClient(new MockWebSocketHandler());
        const request = buildRequest();
        await client.connect(request, runtime({ webSocketReconnectInterval: 400 }));
        const signal = (client as any).abortController.signal;
        signal.addEventListener('noop', function onAbort(): void { return; });
        const pending = client.reconnectGracefully();
        await $dara.sleep(80);
        (client as any).abortController.abort();
        (client as any).abortController.abort();
        await assert.rejects(pending, /connection aborted/);
        await client.disconnect();
      } finally {
        global.AbortController = original;
      }
    });

    it('should reject send when the socket is missing and exercise close helpers', async function () {
      const handler = new MockWebSocketHandler();
      const client = $dara.newDefaultWebSocketClient(handler) as any;
      client.state = 2;
      client.conn = null;
      await assert.rejects(() => client.sendText('a'), /connection is nil/);
      await assert.rejects(() => client.sendBinary(Buffer.from('b')), /connection is nil/);

      client.setupPongHandler();
      client.messageHandlersStarted = true;
      client.startMessageHandlers();
      client.messageHandlersStarted = false;
      client.startMessageHandlers();
      client.pingInterval = 0;
      client.startPingPong();

      let terminated = false;
      client.conn = {
        readyState: WebSocket.CONNECTING,
        terminate() { terminated = true; },
        close() { throw new Error('close'); },
        once(event: string, cb: () => void) {
          if (event === 'close') {
            cb();
          }
        },
      };
      client.session = {
        sessionID: 's',
        requestID: '',
        connectedAt: new Date(),
        remoteAddr: '',
        localAddr: '',
        attributes: {},
      };
      client.state = 2;
      client.abortController = null;
      await client.disconnectInternal(1000, 'bye');
      assert.strictEqual(terminated, true);
      assert.strictEqual(handler.closedCalled, true);

      client.conn = {
        readyState: WebSocket.OPEN,
        close() { throw new Error('close failed'); },
        terminate() { throw new Error('terminate failed'); },
        once(event: string, cb: () => void) {
          if (event === 'close') {
            cb();
          }
        },
      };
      client.session = {
        sessionID: 's2',
        requestID: '',
        connectedAt: new Date(),
        remoteAddr: '',
        localAddr: '',
        attributes: {},
      };
      client.abortController = new AbortController();
      await client.disconnectInternal(1000, 'again');

      client.conn = {
        readyState: WebSocket.CLOSING,
        close() { throw new Error('close'); },
        terminate() { throw new Error('terminate'); },
        once(event: string, cb: () => void) {
          if (event === 'close') {
            cb();
          }
        },
      };
      await client.cleanupResources();
      client.conn = {
        readyState: WebSocket.OPEN,
        terminate() { return; },
        once(event: string, cb: () => void) {
          if (event === 'close') {
            cb();
          }
        },
      };
      await client.cleanupConnection();
    });

    it('should handle messages, closes, ping failures, and write timeouts', async function () {
      const handler = new MockWebSocketHandler();
      const client = $dara.newDefaultWebSocketClient(handler);
      const request = buildRequest();
      await client.connect(request, runtime({ webSocketEnableReconnect: false }));
      const conn = (client as any).conn as WebSocket;

      conn.emit('message', 'plain-text', false);
      await $dara.sleep(30);
      assert.strictEqual(handler.lastMessage?.payload.toString(), 'plain-text');

      const errorsBefore = handler.errorCount;
      conn.emit('close', 1000, Buffer.from('normal'));
      conn.emit('close', 1001, Buffer.from('going away'));
      await $dara.sleep(20);
      assert.strictEqual(handler.errorCount, errorsBefore);

      conn.emit('error', new Error('socket error'));
      conn.emit('close', 4000, Buffer.from('abnormal'));
      await $dara.sleep(30);
      assert.ok(handler.errorCount > errorsBefore);

      (client as any).stopped = true;
      conn.emit('message', Buffer.from('ignored'), false);
      conn.emit('error', new Error('ignored'));
      conn.emit('close', 4000, Buffer.from('ignored'));
      (client as any).stopped = false;
      (client as any).session = null;
      conn.emit('message', Buffer.from('no-session'), false);
      conn.emit('error', new Error('no-session'));
      await client.disconnect();

      const anyClient = client as any;
      anyClient.writeTimeout = 30;
      await assert.rejects(
        () => anyClient.sendWithTimeout({ send() { return; } }, 'x', false),
        /write timeout/,
      );
      anyClient.writeTimeout = 1000;
      await assert.rejects(
        () => anyClient.sendWithTimeout({
          send(_data: unknown, _opts: unknown, cb: (err?: Error) => void) {
            cb(new Error('send failed'));
          },
        }, Buffer.from('x'), true),
        /send failed/,
      );
      anyClient.writeTimeout = 0;
      await anyClient.sendWithTimeout({
        send(_data: unknown, _opts: unknown, cb: (err?: Error) => void) {
          cb();
        },
      }, 'ok', false);

      let pingErrors = 0;
      const pingHandler = new MockWebSocketHandler();
      pingHandler.handleError = () => { pingErrors++; };
      const pingClient = $dara.newDefaultWebSocketClient(pingHandler) as any;
      const fake: any = {
        readyState: WebSocket.OPEN,
        ping() { throw new Error('ping failed'); },
        once() { return; },
      };
      pingClient.conn = fake;
      pingClient.session = {
        sessionID: 'ping',
        requestID: '',
        connectedAt: new Date(),
        remoteAddr: '',
        localAddr: '',
        attributes: {},
      };
      pingClient.runtimeObject = new $dara.RuntimeOptions({ webSocketEnableReconnect: false });
      pingClient.stopped = false;
      pingClient.pingInterval = 20;
      pingClient.pongTimeout = 10;
      pingClient.startPingPong();
      await $dara.sleep(40);
      pingClient.stopPingPong();
      assert.ok(pingErrors >= 1);

      fake.ping = () => { pingClient.pongReceived = true; };
      fake.readyState = WebSocket.OPEN;
      pingClient.runtimeObject = runtime();
      pingClient.pingInterval = 20;
      pingClient.pongTimeout = 10;
      pingClient.startPingPong();
      await $dara.sleep(40);
      pingClient.stopPingPong();

      fake.readyState = WebSocket.CLOSED;
      fake.ping = () => { return; };
      pingClient.pongReceived = false;
      pingClient.pingInterval = 15;
      pingClient.startPingPong();
      await $dara.sleep(40);
      pingClient.stopPingPong();

      fake.readyState = WebSocket.OPEN;
      pingClient.runtimeObject = new $dara.RuntimeOptions({ webSocketEnableReconnect: true });
      pingClient.request = null;
      pingClient.maxReconnectTimes = 3;
      pingClient.reconnectCount = 0;
      pingClient.reconnectInterval = 5;
      pingClient.pongReceived = false;
      pingClient.pingInterval = 20;
      pingClient.pongTimeout = 5;
      pingClient.startPingPong();
      await $dara.sleep(60);
      pingClient.stopPingPong();
    });

    it('should read lowercase proxy environment variables', function () {
      const client = new $dara.DefaultWebSocketClient(new MockWebSocketHandler());
      const keys = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy'];
      const prev: { [key: string]: string | undefined } = {};
      keys.forEach((key) => { prev[key] = process.env[key]; });
      try {
        keys.forEach((key) => { delete process.env[key]; });
        process.env.http_proxy = 'http://lower-proxy:8080';
        process.env.https_proxy = 'http://lower-https:8080';
        process.env.no_proxy = 'other.example';

        const request = new $dara.Request();
        request.headers = {};
        const wsOptions: any = {};
        client.configureHTTPProxy(wsOptions, urlParse('ws://example.com/ws'), new $dara.RuntimeOptions({}), request);
        assert.ok(wsOptions.agent);

        const wssOptions: any = {};
        client.configureHTTPProxy(wssOptions, urlParse('wss://example.com/ws'), new $dara.RuntimeOptions({}), request);
        assert.ok(wssOptions.agent);

        delete process.env.no_proxy;
        process.env.NO_PROXY = 'skip.me';
        const viaNoProxy: any = {};
        client.configureHTTPProxy(
          viaNoProxy,
          urlParse('ws://example.com/ws'),
          new $dara.RuntimeOptions({ httpProxy: 'http://proxy:1' }),
          request,
        );
        assert.ok(viaNoProxy.agent);
      } finally {
        keys.forEach((key) => {
          if (prev[key] === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = prev[key];
          }
        });
      }
    });
  });
});

function urlParse(url: string) {
  const { parse } = require('url');
  return parse(url);
}
