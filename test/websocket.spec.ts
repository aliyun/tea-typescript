'use strict';

import http from 'http';
import { AddressInfo } from 'net';
import 'mocha';
import assert from 'assert';
import { WebSocketServer } from 'ws';

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
    ws.on('message', (data) => {
      ws.send(data);
    });
  });
  return {
    server,
    wss,
    close: () => new Promise((resolve, reject) => {
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
  });
});

function urlParse(url: string) {
  const { parse } = require('url');
  return parse(url);
}
