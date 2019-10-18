import * as querystring from 'querystring';
import { IncomingMessage, IncomingHttpHeaders } from 'http';

import * as httpx from 'httpx';

type Dict = { [key: string]: string };

export class Request {
    protocol: string;
    port: number;
    method: string;
    pathname: string;
    query: Dict;
    headers: Dict;
    body: string;

    constructor() {
        this.headers = {};
        this.query = {};
    }
}

export class Response {
    statusCode: number;
    statusMessage: string;
    headers: { [key: string]: string };
    _response: IncomingMessage;
    constructor(res: IncomingMessage) {
        this.statusCode = res.statusCode;
        this.statusMessage = res.statusMessage;
        this.headers = this.convertHeaders(res.headers);
        this._response = res;
    }

    convertHeaders(headers: IncomingHttpHeaders): Dict {
        let results: Dict = {};
        const keys = Object.keys(headers);
        for (let index = 0; index < keys.length; index++) {
            const key = keys[index];
            results[key] = <string>headers[key];
        }
        return results;
    }

    async readBytes(): Promise<Buffer> {
        let buff = await httpx.read(this._response, '');
        return <Buffer>buff;
    }
}

function buildURL(request: Request) {
    let url = `${request.protocol}://${request.headers['host']}`;
    if (request.port) {
        url += `:${request.port}`;
    }
    url += `${request.pathname}`;
    if (request.query && Object.keys(request.query).length > 0) {
        url += `?${querystring.stringify(request.query)}`;
    }
    return url;
}

export async function doAction(request: Request, runtime: { [key: string]: any } = null): Promise<Response> {
    let url = buildURL(request);
    let method = (request.method || 'GET').toUpperCase();
    let options: httpx.Options = {
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

        if (typeof runtime.ignoreSSL !== 'undefined') {
            options.rejectUnauthorized = !!runtime.ignoreSSL;
        }
    }

    let response = await httpx.request(url, options);

    return new Response(response);
}

export function newError(data: any): Error {
    let message = `${data.code}: ${data.message}`;
    return new Error(message);
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
    return new type(value);
}

function toMap(value: any): any {
    if (value instanceof Model) {
        return value.toMap();
    }

    if (Array.isArray(value)) {
        return value.map((item) => {
            return toMap(item);
        })
    }

    return value;
}

export class Model {
    [key: string]: any

    constructor(map?: { [key: string]: any }) {
        if (map == null) {
            return;
        }

        let clz = <any>this.constructor;
        let names = <{ [key: string]: string }>clz.names();
        let types = <{ [key: string]: any }>clz.types();
        Object.keys(names).forEach((name => {
            let value = map[name];
            if (value === undefined || value === null) {
                return;
            }
            let type = types[name];
            this[name] = getValue(type, value);
        }));
    }

    toMap(): { [key: string]: any } {
        const map: { [key: string]: any } = {};
        let clz = <any>this.constructor;
        let names = <{ [key: string]: string }>clz.names();
        Object.keys(names).forEach((name => {
            const originName = names[name];
            const value = this[name];
            map[originName] = toMap(value);
        }));
        return map;
    }
}

export function cast<T>(obj: any, t: T): T {
    if (!obj) {
        throw new Error('can not cast to Map');
    }

    if (typeof obj !== 'object') {
        throw new Error('can not cast to Map');
    }

    let map = obj as { [key: string]: any };
    let clz = t.constructor as any;
    let names: { [key: string]: string } = clz.names();
    let types: { [key: string]: any } = clz.types();
    Object.keys(names).forEach((key) => {
        let originName = names[key];
        let value = map[originName];
        let type = types[key];
        if (typeof value === 'undefined' || value == null) {
            return;
        }

        if (typeof type === 'string') {
            if (typeof value !== type) {
                throw new Error(`type of ${key} is mismatch, expect ${type}, but ${typeof value}`);
            }
            (<any>t)[key] = value;
        } else if (type.type === 'array') {
            if (!Array.isArray(value)) {
                throw new Error(`type of ${key} is mismatch, expect array, but ${typeof value}`);
            }
            (<any>t)[key] = value.map((d: any) => {
                return cast(d, new type.itemType({}));
            });
        } else {

        }
    });

    return t;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export function allowRetry(retry: { [key: string]: any }, retryTimes: number, startTime: number): boolean {
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

    // 默认不重试
    return false;
}

export function getBackoffTime(backoff: { [key: string]: any }, retryTimes: number): number {
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
        let min = backoff['minPeriod'];
        let max = backoff['maxPeriod'];
        return min + (max - min) * Math.random();
    }

    if (backoff.policy === 'exponential') {
        // 指数退避
        let init = backoff.initial;
        let multiplier = backoff.multiplier;
        let time = init * Math.pow(1 + multiplier, retryTimes - 1);
        let max = backoff.max;
        return Math.min(time, max);
    }

    if (backoff.policy === 'exponential_random') {
        // 指数随机退避
        let init = backoff.initial;
        let multiplier = backoff.multiplier;
        let time = init * Math.pow(1 + multiplier, retryTimes - 1);
        let max = backoff.max;
        return Math.min(time * (0.5 + Math.random()), max);
    }

    return 0;
}

class UnretryableError extends Error {
    data: any

    constructor(message: string) {
        super(message);
        this.name = 'UnretryableError';
    }
}

export function newUnretryableError(request: Request): Error {
    var e = new UnretryableError('');
    e.data = {
        lastRequest: request
    };
    return e;
}

class RetryError extends Error {
    retryable: boolean
    data: any

    constructor(message: string) {
        super(message);
        this.name = 'RetryError';
    }
}

export function retryError(request: Request, response: Response): Error {
    let e = new RetryError('');
    e.data = {
        request: request,
        response: response
    };
    return e;
}

export function isRetryable(err: Error): boolean {
    return err instanceof RetryError;
}