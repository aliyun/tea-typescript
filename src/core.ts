import * as querystring from 'querystring';
import { IncomingMessage, IncomingHttpHeaders, Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { Readable, Writable } from 'stream';
import * as httpx from 'httpx';
import { parse } from 'url';
import { RetryOptions } from './retry';
import { BaseError } from './error';
import * as $tea from '@alicloud/tea-typescript';

type TeaDict = { [key: string]: string };
type TeaObject = { [key: string]: any };
type AgentOptions = { keepAlive: boolean };

export class BytesReadable extends Readable {
  value: Buffer

  constructor(value: string | Buffer) {
    super();
    if (typeof value === 'string') {
      this.value = Buffer.from(value);
    } else if (Buffer.isBuffer(value)) {
      this.value = value;
    }
  }

  _read() {
    this.push(this.value);
    this.push(null);
  }
}

export class Request {
  protocol: string;
  port: number;
  method: string;
  pathname: string;
  query: TeaDict;
  headers: TeaDict;
  body: Readable;

  constructor() {
    this.headers = {};
    this.query = {};
  }
}

export class Response {
  statusCode: number;
  statusMessage: string;
  headers: TeaDict;
  body: IncomingMessage;
  constructor(httpResponse: IncomingMessage) {
    this.statusCode = httpResponse.statusCode;
    this.statusMessage = httpResponse.statusMessage;
    this.headers = this.convertHeaders(httpResponse.headers);
    this.body = httpResponse;
  }

  convertHeaders(headers: IncomingHttpHeaders): TeaDict {
    const results: TeaDict = {};
    const keys = Object.keys(headers);
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      results[key] = <string>headers[key];
    }
    return results;
  }

  async readBytes(): Promise<Buffer> {
    const buff = await httpx.read(this.body, '');
    return <Buffer>buff;
  }
}

function buildURL(request: Request) {
  let url = `${request.protocol}://${request.headers['host']}`;
  if (request.port) {
    url += `:${request.port}`;
  }
  url += `${request.pathname}`;
  const urlInfo = parse(url);
  if (request.query && Object.keys(request.query).length > 0) {
    if (urlInfo.query) {
      url += `&${querystring.stringify(request.query)}`;
    } else {
      url += `?${querystring.stringify(request.query)}`;
    }
  }
  return url;
}

function isModelClass(t: any): boolean {
  if (!t) {
    return false;
  }
  return typeof t.types === 'function' && typeof t.names === 'function';
}

export async function doAction(request: Request, runtime: TeaObject = null): Promise<Response> {
  const url = buildURL(request);
  const method = (request.method || 'GET').toUpperCase();
  const options: httpx.Options = {
    method: method,
    headers: request.headers
  };

  if (method !== 'GET' && method !== 'HEAD') {
    options.data = request.body;
  }

  if (runtime) {
    if (typeof runtime.timeout !== 'undefined') {
      options.timeout = Number(runtime.timeout);
    }

    if (typeof runtime.readTimeout !== 'undefined') {
      options.readTimeout = Number(runtime.readTimeout);
    }

    if (typeof runtime.connectTimeout !== 'undefined') {
      options.connectTimeout = Number(runtime.connectTimeout);
    }

    if (typeof runtime.ignoreSSL !== 'undefined') {
      options.rejectUnauthorized = !runtime.ignoreSSL;
    }

    if (typeof runtime.key !== 'undefined') {
      options.key = String(runtime.key);
    }

    if (typeof runtime.cert !== 'undefined') {
      options.cert = String(runtime.cert);
    }

    if (typeof runtime.ca !== 'undefined') {
      options.ca = String(runtime.ca);
    }

    // keepAlive: default true
    const agentOptions: AgentOptions = {
      keepAlive: true,
    };
    if (typeof runtime.keepAlive !== 'undefined') {
      agentOptions.keepAlive = runtime.keepAlive;
      if (request.protocol && request.protocol.toLowerCase() === 'https') {
        options.agent = new HttpsAgent(agentOptions);
      } else {
        options.agent = new HttpAgent(agentOptions);
      }
    }


  }

  const response = await httpx.request(url, options);

  return new Response(response);
}





function getValue(type: any, value: any): any {
  if (typeof type === 'string') {
    // basic type
    return value;
  }
  if (type.type === 'array') {
    if (!Array.isArray(value)) {
      throw new Error(`expect: array, actual: ${typeof value}`);
    }
    return value.map((item: any) => {
      return getValue(type.itemType, item);
    });
  }
  if (typeof type === 'function') {
    if (isModelClass(type)) {
      return new type(value);
    }
    return value;
  }
  return value;
}

export function toMap(value: any = undefined, withoutStream: boolean = false): any {
  if (typeof value === 'undefined' || value == null) {
    return null;
  }

  if (value instanceof Model) {
    return value.toMap(withoutStream);
  }

  // 如果是另一个版本的 tea-typescript 创建的 model，instanceof 会判断不通过
  // 这里做一下处理
  if (typeof value.toMap === 'function') {
    return value.toMap(withoutStream);
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      return toMap(item, withoutStream);
    })
  }

  if(withoutStream && (value instanceof Readable || value instanceof Writable)) {
    return null;
  }

  return value;
}

export class Model extends $tea.Model {
  [key: string]: any

  constructor(map?: TeaObject) {
    super();
    if (map == null) {
      return;
    }

    const clz = <any>this.constructor;
    const names = <TeaDict>clz.names();
    const types = <TeaObject>clz.types();
    Object.keys(names).forEach((name => {
      const value = map[name];
      if (value === undefined || value === null) {
        return;
      }
      const type = types[name];
      this[name] = getValue(type, value);
    }));
  }

  validate(): void {}

  copyWithoutStream<T extends Model>(): T {
    const map: TeaObject = this.toMap(true);
    const clz = <any>this.constructor;
    return new clz(map);
  }

  toMap(withoutStream: boolean = false): TeaObject {
    const map: TeaObject = {};
    const clz = <any>this.constructor;
    const names = <TeaDict>clz.names();
    Object.keys(names).forEach((name => {
      const originName = names[name];
      const value = this[name];
      if (typeof value === 'undefined' || value == null) {
        return;
      }
      map[originName] = toMap(value, withoutStream);
    }));
    return map;
  }

  static validateRequired(key: string, value: any) {
    if(value === null || typeof value === 'undefined') {
      throw new BaseError({
        code: 'SDK.ValidateError',
        message: `${key} is required.`,
      });
    }
  }

  static validateMaxLength(key: string, value: any, max: number) {
    if(value === null || typeof value === 'undefined') {
      return;
    }
    if(value.length > max) {
      throw new BaseError({
        code: 'SDK.ValidateError',
        message: `${key} is exceed max-length: ${max}.`,
      });
    }
  }

  static validateMinLength(key: string, value: any, min: number) {
    if(value === null || typeof value === 'undefined') {
      return;
    }
    if(value.length < min) {
      throw new BaseError({
        code: 'SDK.ValidateError',
        message: `${key} is exceed min-length: ${min}.`,
      });
    }
  }

  static validateMaximum(key: string, value: number | undefined, max: number) {
    if(value === null || typeof value === 'undefined') {
      return;
    }
    if(value > max) {
      throw new BaseError({
        code: 'SDK.ValidateError',
        message: `${key} cannot be greater than ${max}.`,
      });
    }
  }

  static validateMinimum(key: string, value: number | undefined, min: number) {
    if(value === null || typeof value === 'undefined') {
      return;
    }
    if(value < min) {
      throw new BaseError({
        code: 'SDK.ValidateError',
        message: `${key} cannot be less than ${min}.`,
      });
    }
  }

  static validatePattern(key: string, value: any, val: string) {
    if(value === null || typeof value === 'undefined') {
      return;
    }
    const reg = new RegExp(val);
    if(!reg.test(value)) {
      throw new BaseError({
        code: 'SDK.ValidateError',
        message: `${key} is not match ${val}.`,
      });
    }
  }

  static validateArray(data?: any[]) {
    if(data === null || typeof data === 'undefined') {
      return;
    }
    data.map(ele => {
      if(!ele) {
        return;
      }
      if(ele instanceof Model || typeof ele.validate === 'function') {
        ele.validate();
      } else if(Array.isArray(ele)) {
        Model.validateArray(ele);
      } else if(ele instanceof Object) {
        Model.validateMap(ele);
      }
    })
  }

  static validateMap(data?: { [key: string]: any }) {
    if(data === null || typeof data === 'undefined') {
      return;
    }
    Object.keys(data).map(key => {
      const ele = data[key];
      if(!ele) {
        return;
      }
      if(ele instanceof Model || typeof ele.validate === 'function') {
        ele.validate();
      } else if(Array.isArray(ele)) {
        Model.validateArray(ele);
      } else if(ele instanceof Object) {
        Model.validateMap(ele);
      }
    })
  }
}


export class FileField extends Model {
  filename: string;
  contentType: string;
  content: Readable;
  static names(): { [key: string]: string } {
    return {
      filename: 'filename',
      contentType: 'contentType',
      content: 'content',
    };
  }

  static types(): { [key: string]: any } {
    return {
      filename: 'string',
      contentType: 'string',
      content: 'Readable',
    };
  }

  constructor(map?: { [key: string]: any }) {
    super(map);
  }
}

export class ExtendsParameters extends $tea.Model {
  headers?: { [key: string]: string };
  queries?: { [key: string]: string };
  static names(): { [key: string]: string } {
    return {
      headers: 'headers',
      queries: 'queries',
    };
  }

  static types(): { [key: string]: any } {
    return {
      headers: { 'type': 'map', 'keyType': 'string', 'valueType': 'string' },
      queries: { 'type': 'map', 'keyType': 'string', 'valueType': 'string' },
    };
  }

  constructor(map?: { [key: string]: any }) {
    super(map);
  }
}

export class RuntimeOptions extends $tea.Model {
  retryOptions?: RetryOptions;
  autoretry?: boolean;
  ignoreSSL?: boolean;
  key?: string;
  cert?: string;
  ca?: string;
  maxAttempts?: number;
  backoffPolicy?: string;
  backoffPeriod?: number;
  readTimeout?: number;
  connectTimeout?: number;
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
  maxIdleConns?: number;
  keepAlive?: boolean;
  extendsParameters?: ExtendsParameters;
  static names(): { [key: string]: string } {
    return {
      autoretry: 'autoretry',
      ignoreSSL: 'ignoreSSL',
      key: 'key',
      cert: 'cert',
      ca: 'ca',
      maxAttempts: 'max_attempts',
      backoffPolicy: 'backoff_policy',
      backoffPeriod: 'backoff_period',
      readTimeout: 'readTimeout',
      connectTimeout: 'connectTimeout',
      httpProxy: 'httpProxy',
      httpsProxy: 'httpsProxy',
      noProxy: 'noProxy',
      maxIdleConns: 'maxIdleConns',
      keepAlive: 'keepAlive',
      extendsParameters: 'extendsParameters',
    };
  }

  static types(): { [key: string]: any } {
    return {
      retryOptions: RetryOptions,
      autoretry: 'boolean',
      ignoreSSL: 'boolean',
      key: 'string',
      cert: 'string',
      ca: 'string',
      maxAttempts: 'number',
      backoffPolicy: 'string',
      backoffPeriod: 'number',
      readTimeout: 'number',
      connectTimeout: 'number',
      httpProxy: 'string',
      httpsProxy: 'string',
      noProxy: 'string',
      maxIdleConns: 'number',
      keepAlive: 'boolean',
      extendsParameters: ExtendsParameters,
    };
  }

  constructor(map?: { [key: string]: any }) {
    super(map);
  }
}

export function cast<T>(obj: any, t: T): T {
  if (!obj) {
    throw new Error('can not cast to Map');
  }

  if (typeof obj !== 'object') {
    throw new Error('can not cast to Map');
  }

  const map = obj as TeaObject;
  const clz = t.constructor as any;
  const names: TeaDict = clz.names();
  const types: TeaObject = clz.types();
  Object.keys(names).forEach((key) => {
    const originName = names[key];
    const value = map[originName];
    const type = types[key];
    if (typeof value === 'undefined' || value == null) {
      return;
    }
    if (typeof type === 'string') {
      if (type === 'Readable' ||
          type === 'Writable' ||
          type === 'map' ||
          type === 'Buffer' ||
          type === 'any' ||
          typeof value === type) {
        (<any>t)[key] = value;
        return;
      }
      if (type === 'string' &&
          (typeof value === 'number' ||
            typeof value === 'boolean')) {
        (<any>t)[key] = value.toString();
        return;
      }
      if (type === 'boolean') {
        if (value === 1 || value === 0) {
          (<any>t)[key] = !!value;
          return;
        }
        if (value === 'true' || value === 'false') {
          (<any>t)[key] = value === 'true';
          return;
        }
      }

      if (type === 'number' && typeof value === 'string') {
        if (value.match(/^\d*$/)) {
          (<any>t)[key] = parseInt(value);
          return;
        }
        if (value.match(/^[\.\d]*$/)) {
          (<any>t)[key] = parseFloat(value);
          return;
        }
      }
      throw new Error(`type of ${key} is mismatch, expect ${type}, but ${typeof value}`);
    } else if (type.type === 'map') {
      if (!(value instanceof Object)) {
        throw new Error(`type of ${key} is mismatch, expect object, but ${typeof value}`);
      }
      (<any>t)[key] = value;
    } else if (type.type === 'array') {
      if (!Array.isArray(value)) {
        throw new Error(`type of ${key} is mismatch, expect array, but ${typeof value}`);
      }
      if (typeof type.itemType === 'function') {
        (<any>t)[key] = value.map((d: any) => {
          if (isModelClass(type.itemType)) {
            return cast(d, new type.itemType({}));
          }
          return d;
        });
      } else {
        (<any>t)[key] = value;
      }

    } else if (typeof type === 'function') {
      if (!(value instanceof Object)) {
        throw new Error(`type of ${key} is mismatch, expect object, but ${typeof value}`);
      }
      if (isModelClass(type)) {
        (<any>t)[key] = cast(value, new type({}));
        return;
      }
      (<any>t)[key] = value;
    } else {

    }
  });

  return t;
}

export function allowRetry(retry: TeaObject, retryTimes: number, startTime: number): boolean {
  // 还未重试
  if (retryTimes === 0) {
    return true;
  }

  if (retry.retryable !== true) {
    return false;
  }

  if (retry.policy === 'never') {
    return false;
  }

  if (retry.policy === 'always') {
    return true;
  }

  if (retry.policy === 'simple') {
    return (retryTimes < retry['maxAttempts']);
  }

  if (retry.policy === 'timeout') {
    return Date.now() - startTime < retry.timeout;
  }

  if (retry.maxAttempts && typeof retry.maxAttempts === 'number') {
    return retry.maxAttempts >= retryTimes;
  }

  // 默认不重试
  return false;
}

export function getBackoffTime(backoff: TeaObject, retryTimes: number): number {
  if (retryTimes === 0) {
    // 首次调用，不使用退避策略
    return 0;
  }

  if (backoff.policy === 'no') {
    // 不退避
    return 0;
  }

  if (backoff.policy === 'fixed') {
    // 固定退避
    return backoff.period;
  }

  if (backoff.policy === 'random') {
    // 随机退避
    const min = backoff['minPeriod'];
    const max = backoff['maxPeriod'];
    return min + (max - min) * Math.random();
  }

  if (backoff.policy === 'exponential') {
    // 指数退避
    const init = backoff.initial;
    const multiplier = backoff.multiplier;
    const time = init * Math.pow(1 + multiplier, retryTimes - 1);
    const max = backoff.max;
    return Math.min(time, max);
  }

  if (backoff.policy === 'exponential_random') {
    // 指数随机退避
    const init = backoff.initial;
    const multiplier = backoff.multiplier;
    const time = init * Math.pow(1 + multiplier, retryTimes - 1);
    const max = backoff.max;
    return Math.min(time * (0.5 + Math.random()), max);
  }

  return 0;
}

export function isRetryable(err: Error): boolean {
  if (typeof err === 'undefined' || err === null) {
    return false;
  }
  return err.name === 'RetryError';
}

