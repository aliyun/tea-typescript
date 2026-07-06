import * as crypto from 'crypto';
import * as http from 'http';
import { IncomingMessage } from 'http';
import * as querystring from 'querystring';
import * as tls from 'tls';
import { parse as urlParse, UrlWithStringQuery } from 'url';
import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { Request, Response, RuntimeOptions } from './core';

export enum WebSocketMessageType {
  Text = 0,
  Binary = 1,
  Ping = 2,
  Pong = 3,
  Close = 4,
}

export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload: Buffer;
  headers: { [key: string]: string };
  timestamp: Date;
}

export interface WebSocketSessionInfo {
  sessionID: string;
  requestID: string;
  connectedAt: Date;
  remoteAddr: string;
  localAddr: string;
  attributes: { [key: string]: any };
}

const STATE_DISCONNECTED = 0;
const STATE_CONNECTING = 1;
const STATE_CONNECTED = 2;
const STATE_DISCONNECTING = 3;

export function getWebSocketPingInterval(runtime: RuntimeOptions | null | undefined): number | undefined {
  return runtime?.webSocketPingInterval;
}

export function getWebSocketPongTimeout(runtime: RuntimeOptions | null | undefined): number | undefined {
  return runtime?.webSocketPongTimeout;
}

export function getWebSocketEnableReconnect(runtime: RuntimeOptions | null | undefined): boolean | undefined {
  return runtime?.webSocketEnableReconnect;
}

export function getWebSocketReconnectInterval(runtime: RuntimeOptions | null | undefined): number | undefined {
  return runtime?.webSocketReconnectInterval;
}

export function getWebSocketMaxReconnectTimes(runtime: RuntimeOptions | null | undefined): number | undefined {
  return runtime?.webSocketMaxReconnectTimes;
}

export function getWebSocketWriteTimeout(runtime: RuntimeOptions | null | undefined): number | undefined {
  return runtime?.webSocketWriteTimeout;
}

export function getWebSocketHandshakeTimeout(runtime: RuntimeOptions | null | undefined): number | undefined {
  return runtime?.webSocketHandshakeTimeout;
}

export function getWebSocketHandler(runtime: RuntimeOptions | null | undefined): WebSocketHandler | undefined {
  return runtime?.webSocketHandler;
}

export function getWebsocketSubProtocol(runtime: RuntimeOptions | null | undefined): string | undefined {
  return runtime?.websocketSubProtocol;
}

export function newWebSocketResponse(statusCode: number, statusMessage: string, headers: http.IncomingHttpHeaders): Response {
  const fakeResponse = {
    statusCode,
    statusMessage,
    headers,
  } as IncomingMessage;
  const res = new Response(fakeResponse);
  const normalizedHeaders: { [key: string]: string } = {};
  Object.keys(headers || {}).forEach((key) => {
    const val = headers[key];
    if (val) {
      normalizedHeaders[key.toLowerCase()] = Array.isArray(val) ? val[0] : `${val}`;
    }
  });
  res.headers = normalizedHeaders;
  return res;
}

export interface WebSocketHandler {
  afterConnectionEstablished(session: WebSocketSessionInfo): Promise<void> | void;
  handleRawMessage(session: WebSocketSessionInfo, message: WebSocketMessage): Promise<void> | void;
  handleError(session: WebSocketSessionInfo, err: Error): Promise<void> | void;
  afterConnectionClosed(session: WebSocketSessionInfo, code: number, reason: string): Promise<void> | void;
}

export class AbstractWebSocketHandler implements WebSocketHandler {
  afterConnectionEstablished(_session: WebSocketSessionInfo): void {
    return;
  }

  handleRawMessage(_session: WebSocketSessionInfo, _message: WebSocketMessage): void {
    return;
  }

  handleError(_session: WebSocketSessionInfo, _err: Error): void {
    return;
  }

  afterConnectionClosed(_session: WebSocketSessionInfo, _code: number, _reason: string): void {
    return;
  }
}

export interface WebSocketClient {
  connect(request: Request, runtimeObject: RuntimeOptions): Promise<Response>;
  disconnect(): Promise<void>;
  reconnect(): Promise<Response>;
  reconnectGracefully(): Promise<Response>;
  isConnected(): boolean;
  sendText(text: string): Promise<void>;
  sendBinary(data: Buffer): Promise<void>;
  getSessionInfo(): WebSocketSessionInfo | null;
  close(): Promise<void>;
}

export class DefaultWebSocketClient implements WebSocketClient {
  private handler: WebSocketHandler;
  private stopped = false;
  private pongReceived = false;
  private state = STATE_DISCONNECTED;
  private conn: WebSocket | null = null;
  session: WebSocketSessionInfo | null = null;
  private request: Request | null = null;
  private runtimeObject: RuntimeOptions | null = null;
  private reconnectCount = 0;
  private pingTimer: NodeJS.Timeout | null = null;
  private pingInterval = 30000;
  private reconnectInterval = 5000;
  private writeTimeout = 30000;
  private readTimeout = 0;
  private pongTimeout = 5000;
  private maxReconnectTimes = 5;
  private reconnectLock = false;
  private websocketSubProtocol: string | undefined;
  private abortController: AbortController | null = null;
  private messageHandlersStarted = false;

  constructor(handler: WebSocketHandler) {
    if (!handler) {
      throw new Error('handler cannot be nil');
    }
    this.handler = handler;
  }

  async connect(request: Request, runtimeObject: RuntimeOptions): Promise<Response> {
    if (!request) {
      throw new Error('request cannot be nil');
    }
    if (!runtimeObject) {
      throw new Error('runtimeObject cannot be nil');
    }

    this.request = request;
    this.runtimeObject = runtimeObject;
    this.updateTimeoutConfig(runtimeObject);
    this.websocketSubProtocol = getWebsocketSubProtocol(runtimeObject);
    this.state = STATE_CONNECTING;
    this.stopped = false;
    this.pongReceived = false;

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    const requestURL = buildWebSocketURL(request);
    const parsed = urlParse(requestURL);
    if (!parsed.protocol || !parsed.host) {
      this.state = STATE_DISCONNECTED;
      throw new Error(`invalid websocket url: ${requestURL}`);
    }

    const handshakeTimeout = runtimeObject.webSocketHandshakeTimeout && runtimeObject.webSocketHandshakeTimeout > 0
      ? runtimeObject.webSocketHandshakeTimeout
      : 30000;
    const connectTimeout = runtimeObject.connectTimeout && runtimeObject.connectTimeout > 0
      ? runtimeObject.connectTimeout
      : 10000;

    const headers: { [key: string]: string } = {};
    if (request.headers) {
      Object.keys(request.headers).forEach((k) => {
        const v = request.headers[k];
        if (v && k !== 'host' && k !== 'content-length') {
          headers[k] = v;
        }
      });
    }

    if (this.websocketSubProtocol) {
      headers['Sec-WebSocket-Protocol'] = this.websocketSubProtocol;
    }

    const wsOptions: WebSocket.ClientOptions = {
      handshakeTimeout,
      headers,
      rejectUnauthorized: !runtimeObject.ignoreSSL,
    };

    if (parsed.protocol === 'wss:' || parsed.protocol === 'https:') {
      const tlsOptions = this.configureTLS(runtimeObject);
      wsOptions.rejectUnauthorized = tlsOptions.rejectUnauthorized;
      if (tlsOptions.cert) {
        wsOptions.cert = tlsOptions.cert;
      }
      if (tlsOptions.key) {
        wsOptions.key = tlsOptions.key;
      }
      if (tlsOptions.ca) {
        wsOptions.ca = tlsOptions.ca;
      }
    }

    this.configureProxy(wsOptions, parsed, runtimeObject, request);

    const protocols = this.websocketSubProtocol ? [this.websocketSubProtocol] : undefined;

    return new Promise<Response>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.state === STATE_CONNECTING) {
          this.state = STATE_DISCONNECTED;
          reject(new Error('WebSocket connection timeout'));
        }
      }, connectTimeout);

      let upgradeResponse: http.IncomingMessage | null = null;
      const ws = new WebSocket(requestURL, protocols, wsOptions);

      ws.on('upgrade', (response) => {
        upgradeResponse = response;
      });

      ws.on('open', async () => {
        clearTimeout(timeoutId);
        this.conn = ws;
        this.state = STATE_CONNECTED;
        this.setupPongHandler();
        this.startMessageHandlers();

        if (this.pingInterval > 0) {
          this.startPingPong();
        }

        const sessionID = upgradeResponse?.headers['x-acs-ws-session-id']
          || upgradeResponse?.headers['X-Acs-Ws-Session-Id']
          || generateSessionID();
        const requestID = upgradeResponse?.headers['x-acs-request-id']
          || upgradeResponse?.headers['X-Acs-Request-Id']
          || '';

        this.session = {
          sessionID: Array.isArray(sessionID) ? sessionID[0] : `${sessionID}`,
          requestID: Array.isArray(requestID) ? requestID[0] : `${requestID}`,
          connectedAt: new Date(),
          remoteAddr: `${ws.url}`,
          localAddr: '',
          attributes: {},
        };

        try {
          await this.handler.afterConnectionEstablished(this.session);
        } catch (err) {
          await this.cleanupConnection();
          this.state = STATE_DISCONNECTED;
          reject(err);
          return;
        }

        const statusCode = upgradeResponse?.statusCode || 101;
        const statusMessage = upgradeResponse?.statusMessage || 'Switching Protocols';
        resolve(newWebSocketResponse(statusCode, statusMessage, upgradeResponse?.headers || {}));
      });

      ws.on('error', (err) => {
        clearTimeout(timeoutId);
        if (this.state === STATE_CONNECTING) {
          this.state = STATE_DISCONNECTED;
          reject(err);
        }
      });

      ws.on('unexpected-response', (_req, res) => {
        clearTimeout(timeoutId);
        this.state = STATE_DISCONNECTED;
        reject(new Error(`WebSocket handshake failed with status ${res.statusCode}`));
      });
    });
  }

  async disconnect(): Promise<void> {
    return this.disconnectInternal(1000, 'Normal closure');
  }

  private async disconnectInternal(code: number, reason: string): Promise<void> {
    if (this.state === STATE_DISCONNECTED && !this.abortController) {
      return;
    }

    this.state = STATE_DISCONNECTING;
    this.stopPingPong();
    this.stopped = true;

    const conn = this.conn;
    this.conn = null;
    if (conn && conn.readyState === WebSocket.OPEN) {
      try {
        conn.close(code, reason);
      } catch (_err) {
        // ignore close errors
      }
    } else if (conn) {
      conn.terminate();
    }

    await this.waitForClose(conn);

    if (this.session) {
      await this.handler.afterConnectionClosed(this.session, code, reason);
    }

    this.state = STATE_DISCONNECTED;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async reconnect(): Promise<Response> {
    return this.reconnectInternal(false);
  }

  async reconnectGracefully(): Promise<Response> {
    return this.reconnectInternal(true);
  }

  private async reconnectInternal(graceful: boolean): Promise<Response> {
    if (!graceful && this.isConnected()) {
      throw new Error('already connected');
    }

    if (this.abortController?.signal.aborted) {
      throw new Error('connection aborted');
    }

    if (this.reconnectLock) {
      throw new Error('reconnect already in progress');
    }

    this.reconnectLock = true;
    try {
      if (!this.runtimeObject?.webSocketEnableReconnect) {
        throw new Error('reconnect is disabled');
      }

      if (this.reconnectCount >= this.maxReconnectTimes) {
        throw new Error(`max reconnect times reached: ${this.maxReconnectTimes}`);
      }

      let previousSessionID = '';
      if (graceful) {
        if (this.session?.sessionID) {
          previousSessionID = this.session.sessionID;
        } else {
          throw new Error('graceful reconnection requires existing session ID');
        }
      }

      await this.cleanupResources();

      this.stopped = false;
      this.reconnectCount++;

      if (!this.request) {
        throw new Error('request is nil, cannot reconnect');
      }

      if (graceful && previousSessionID) {
        this.request.headers = this.request.headers || {};
        this.request.headers['X-Acs-Ws-Session-Id'] = previousSessionID;
      } else if (this.request.headers) {
        delete this.request.headers['X-Acs-Ws-Session-Id'];
      }

      await this.sleepInterruptible(this.reconnectInterval);

      if (this.abortController?.signal.aborted) {
        throw new Error('connection aborted');
      }

      const result = await this.connect(this.request, this.runtimeObject!);
      this.reconnectCount = 0;
      return result;
    } finally {
      this.reconnectLock = false;
    }
  }

  private async cleanupResources(): Promise<void> {
    this.state = STATE_DISCONNECTING;
    this.stopPingPong();
    this.stopped = true;

    const conn = this.conn;
    this.conn = null;
    if (conn) {
      try {
        if (conn.readyState === WebSocket.OPEN) {
          conn.close(1001, 'Reconnecting');
        } else {
          conn.terminate();
        }
      } catch (_err) {
        // ignore
      }
      await this.waitForClose(conn);
    }

    this.session = null;
    this.messageHandlersStarted = false;
    this.state = STATE_DISCONNECTED;
  }

  isConnected(): boolean {
    return this.state === STATE_CONNECTED;
  }

  async sendText(text: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('not connected');
    }
    const conn = this.conn;
    if (!conn) {
      throw new Error('connection is nil');
    }
    await this.sendWithTimeout(conn, text, false);
  }

  async sendBinary(data: Buffer): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('not connected');
    }
    const conn = this.conn;
    if (!conn) {
      throw new Error('connection is nil');
    }
    await this.sendWithTimeout(conn, data, true);
  }

  getSessionInfo(): WebSocketSessionInfo | null {
    return this.session;
  }

  async close(): Promise<void> {
    return this.disconnectInternal(1000, 'Client closed');
  }

  configureTLS(runtimeObject: RuntimeOptions): tls.ConnectionOptions {
    if (runtimeObject.ignoreSSL) {
      return { rejectUnauthorized: false };
    }

    const tlsOptions: tls.ConnectionOptions = {
      rejectUnauthorized: true,
    };

    if (runtimeObject.key && runtimeObject.cert) {
      tlsOptions.cert = runtimeObject.cert;
      tlsOptions.key = runtimeObject.key;
    }

    if (runtimeObject.ca) {
      tlsOptions.ca = runtimeObject.ca;
    }

    return tlsOptions;
  }

  configureProxy(
    wsOptions: WebSocket.ClientOptions,
    parsed: UrlWithStringQuery | null,
    runtimeObject: RuntimeOptions,
    request: Request,
  ): void {
    if (runtimeObject.socks5Proxy) {
      this.configureSOCKS5Proxy(wsOptions, runtimeObject);
      return;
    }

    this.configureHTTPProxy(wsOptions, parsed, runtimeObject, request);
  }

  configureSOCKS5Proxy(wsOptions: WebSocket.ClientOptions, runtimeObject: RuntimeOptions): void {
    const socks5Proxy = runtimeObject.socks5Proxy;
    if (!socks5Proxy) {
      return;
    }
    wsOptions.agent = new SocksProxyAgent(socks5Proxy);
  }

  configureHTTPProxy(
    wsOptions: WebSocket.ClientOptions,
    parsed: UrlWithStringQuery | null,
    runtimeObject: RuntimeOptions,
    request: Request,
  ): void {
    if (!parsed) {
      return;
    }

    const protocol = parsed.protocol.replace(':', '');
    const host = parsed.hostname;
    const noProxyList = getNoProxy(protocol, runtimeObject);
    for (const noProxyHost of noProxyList) {
      if (noProxyHost === host) {
        return;
      }
    }

    const proxyURL = getHttpProxyURL(protocol, host, runtimeObject);
    if (!proxyURL) {
      return;
    }

    if (protocol === 'wss' || protocol === 'https') {
      wsOptions.agent = new HttpsProxyAgent(proxyURL);
    } else {
      wsOptions.agent = new HttpProxyAgent(proxyURL);
    }

    const parsedProxy = urlParse(proxyURL);
    if (parsedProxy.auth) {
      request.headers = request.headers || {};
      request.headers['Proxy-Authorization'] = `Basic ${Buffer.from(parsedProxy.auth).toString('base64')}`;
    }
  }

  configureNetDialer(_wsOptions: WebSocket.ClientOptions, _runtimeObject: RuntimeOptions, _connectTimeout: number): void {
    // ws package handles direct connections via default agent
  }

  private updateTimeoutConfig(runtimeObject: RuntimeOptions): void {
    this.pingInterval = runtimeObject.webSocketPingInterval && runtimeObject.webSocketPingInterval > 0
      ? runtimeObject.webSocketPingInterval
      : 30000;
    this.reconnectInterval = runtimeObject.webSocketReconnectInterval && runtimeObject.webSocketReconnectInterval > 0
      ? runtimeObject.webSocketReconnectInterval
      : 5000;
    this.writeTimeout = runtimeObject.webSocketWriteTimeout && runtimeObject.webSocketWriteTimeout > 0
      ? runtimeObject.webSocketWriteTimeout
      : 30000;
    this.readTimeout = runtimeObject.readTimeout && runtimeObject.readTimeout > 0
      ? runtimeObject.readTimeout
      : 0;
    this.pongTimeout = runtimeObject.webSocketPongTimeout && runtimeObject.webSocketPongTimeout > 0
      ? runtimeObject.webSocketPongTimeout
      : 5000;
    this.maxReconnectTimes = runtimeObject.webSocketMaxReconnectTimes && runtimeObject.webSocketMaxReconnectTimes > 0
      ? runtimeObject.webSocketMaxReconnectTimes
      : 5;
  }

  private setupPongHandler(): void {
    const conn = this.conn;
    if (!conn) {
      return;
    }
    conn.on('pong', () => {
      this.pongReceived = true;
    });
  }

  private startMessageHandlers(): void {
    if (this.messageHandlersStarted) {
      return;
    }
    this.messageHandlersStarted = true;
    const conn = this.conn;
    if (!conn) {
      return;
    }

    conn.on('message', async (data, isBinary) => {
      if (this.stopped) {
        return;
      }

      const payload = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      const msg: WebSocketMessage = {
        type: isBinary ? WebSocketMessageType.Binary : WebSocketMessageType.Text,
        payload,
        headers: {},
        timestamp: new Date(),
      };

      if (!this.session) {
        return;
      }

      try {
        await this.handler.handleRawMessage(this.session, msg);
      } catch (err) {
        await this.handler.handleError(this.session, err as Error);
      }
    });

    conn.on('close', async (code, reasonBuffer) => {
      if (this.stopped) {
        return;
      }

      const reason = reasonBuffer.toString();
      if (this.session && code !== 1000 && code !== 1001) {
        await this.handler.handleError(this.session, new Error(`WebSocket closed: ${code} ${reason}`));
      }

      if (this.runtimeObject?.webSocketEnableReconnect && this.request && !this.stopped) {
        this.reconnect().catch(() => {
          // ignore reconnect errors triggered from read loop
        });
      }
    });

    conn.on('error', async (err) => {
      if (this.stopped || !this.session) {
        return;
      }
      await this.handler.handleError(this.session, err);
    });
  }

  private startPingPong(): void {
    if (this.pingInterval <= 0) {
      return;
    }

    this.stopPingPong();
    this.pingTimer = setInterval(async () => {
      if (this.stopped || !this.conn || this.conn.readyState !== WebSocket.OPEN) {
        return;
      }

      this.pongReceived = false;
      try {
        this.conn.ping();
      } catch (err) {
        if (this.session) {
          await this.handler.handleError(this.session, err as Error);
        }
        return;
      }

      await this.sleepInterruptible(this.pongTimeout);
      if (!this.pongReceived && this.runtimeObject?.webSocketEnableReconnect) {
        this.reconnect().catch(() => {
          // ignore
        });
      }
    }, this.pingInterval);
  }

  private stopPingPong(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private async cleanupConnection(): Promise<void> {
    this.stopPingPong();
    this.stopped = true;
    const conn = this.conn;
    this.conn = null;
    if (conn) {
      conn.terminate();
      await this.waitForClose(conn);
    }
  }

  private async sendWithTimeout(conn: WebSocket, data: string | Buffer, binary: boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = this.writeTimeout > 0
        ? setTimeout(() => reject(new Error('write timeout')), this.writeTimeout)
        : null;

      conn.send(data, { binary }, (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async waitForClose(conn: WebSocket | null): Promise<void> {
    if (!conn) {
      return;
    }
    if (conn.readyState === WebSocket.CLOSED) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      conn.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private sleepInterruptible(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (this.abortController) {
        this.abortController.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      }
    });
  }
}

export function newDefaultWebSocketClient(handler: WebSocketHandler): DefaultWebSocketClient {
  return new DefaultWebSocketClient(handler);
}

export async function newWebSocketClientAndConnect(
  request: Request,
  runtimeObject: RuntimeOptions,
): Promise<{ client: DefaultWebSocketClient; response: Response }> {
  if (!runtimeObject) {
    throw new Error('runtimeObject cannot be nil');
  }

  const handler = runtimeObject.webSocketHandler;
  if (!handler) {
    throw new Error('WebSocketHandler is required: please set it in runtimeObject.webSocketHandler');
  }

  const client = new DefaultWebSocketClient(handler);
  const response = await client.connect(request, runtimeObject);
  return { client, response };
}

export function buildWebSocketURL(request: Request): string {
  if (!request) {
    throw new Error('request cannot be nil');
  }

  let protocol = request.protocol || 'ws';
  protocol = protocol.toLowerCase();
  if (protocol === 'http') {
    protocol = 'ws';
  } else if (protocol === 'https') {
    protocol = 'wss';
  }

  let domain = request.domain;
  if (!domain) {
    domain = request.headers['host'];
  }
  if (!domain) {
    throw new Error('domain is required (set in request.headers["host"] or request.domain)');
  }

  let requestURL = `${protocol}://${domain}`;
  requestURL += request.pathname || '/';

  if (request.query && Object.keys(request.query).length > 0) {
    const qs = querystring.stringify(request.query);
    if (qs) {
      requestURL += requestURL.indexOf('?') >= 0 ? `&${qs}` : `?${qs}`;
    }
  }

  return requestURL;
}

export function convertToWebSocketMessageType(messageType: number): WebSocketMessageType {
  switch (messageType) {
    case 1:
      return WebSocketMessageType.Text;
    case 2:
      return WebSocketMessageType.Binary;
    case 9:
      return WebSocketMessageType.Ping;
    case 10:
      return WebSocketMessageType.Pong;
    case 8:
      return WebSocketMessageType.Close;
    default:
      return WebSocketMessageType.Binary;
  }
}

function generateSessionID(): string {
  return `ws-session-${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
}

function getNoProxy(protocol: string, runtime: RuntimeOptions): string[] {
  if (runtime.noProxy) {
    return runtime.noProxy.split(',');
  }
  if (process.env.NO_PROXY) {
    return process.env.NO_PROXY.split(',');
  }
  if (process.env.no_proxy) {
    return process.env.no_proxy.split(',');
  }
  return [];
}

function getHttpProxyURL(protocol: string, host: string, runtime: RuntimeOptions): string | null {
  const noProxyList = getNoProxy(protocol, runtime);
  for (const noProxyHost of noProxyList) {
    if (noProxyHost === host) {
      return null;
    }
  }

  let proxyProtocol = protocol;
  if (protocol === 'wss') {
    proxyProtocol = 'https';
  } else if (protocol === 'ws') {
    proxyProtocol = 'http';
  }

  if (proxyProtocol === 'https') {
    if (runtime.httpsProxy) {
      return runtime.httpsProxy;
    }
    if (process.env.HTTPS_PROXY) {
      return process.env.HTTPS_PROXY;
    }
    if (process.env.https_proxy) {
      return process.env.https_proxy;
    }
  } else {
    if (runtime.httpProxy) {
      return runtime.httpProxy;
    }
    if (process.env.HTTP_PROXY) {
      return process.env.HTTP_PROXY;
    }
    if (process.env.http_proxy) {
      return process.env.http_proxy;
    }
  }

  return null;
}
