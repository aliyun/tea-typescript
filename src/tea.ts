import * as querystring from 'querystring';
import { IncomingMessage, IncomingHttpHeaders } from 'http';

import * as httpx from 'httpx';

type Dict = {[key: string]: string};

export class Request {
    protocol: string;
    port: number;
    method: string;
    pathname: string;
    query: Dict;
    headers: Dict;
    body: string;
}

export class Response {
    statusCode: number;
    statusMessage: string;
    headers: {[key: string]: string};
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

export async function doAction(request: Request): Promise<Response> {
    let url = buildURL(request);
    let method = request.method.toUpperCase();
    let options: httpx.Options = {
        method: method,
        headers: request.headers
    };

    if (method !== 'GET' && method !== 'HEAD') {
        options.data = request.body;
    }

    let response = await httpx.request(url, options);

    return new Response(response);
}

export function newError(data: any): Error {
    let message = `${data.code}: ${data.message}`;
    return new Error(message);
}

export class Model {
    [key: string]: any

    constructor(map?: {[key: string]: string}) {
        if (map == null) {
            return;
        }
        let clz = <any>this.constructor;
        let names = <{[key: string]: string }>clz.names;
        let types = <{[key: string]: any }>clz.types;
        Object.keys(names).forEach((name => {
            this[name] = map[name];
        }));
    }

    toMap(): {[key: string]: string} {
        const map : {[key: string]: string} = {};
        let clz = <any>this.constructor;
        let names = <{[key: string]: string }>clz.names;
        let types = <{[key: string]: any }>clz.types;
        Object.keys(names).forEach((name => {
            const originName = names[name];
            map[originName] = this[name];
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
    let map = obj as {[key: string]: any};
    let clz = t.constructor as any;
    let names: {[key: string]: string} = clz.names;
    let types: {[key: string]: any} = clz.types;
    Object.keys(names).forEach((key) => {
        let originName = names[key];
        let type = types[key];
        if (typeof type === 'string') {
            if (typeof map[originName] !== type) {
                throw new Error(`type of ${key} is mismatch, expect ${type}, but ${typeof map[originName]}`);
            }
            (<any>t)[key] = map[originName];
        } else if (type.type === 'array') {
            if (!Array.isArray(map[originName])) {
                throw new Error(`type of ${key} is mismatch, expect array, but ${typeof map[originName]}`);
            }
            (<any>t)[key] = map[originName].map((d : any) => {
                return cast(d, new type.itemType({}));
            });
        } else {

        }
    });

    return t;
}

export function toMap(obj: any): {[key: string]: any} {
    return obj.toMap();
}
