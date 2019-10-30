'use strict';

import http from 'http';
import url from 'url';
import * as $tea from "../src/tea";
import 'mocha';
import assert, { rejects } from 'assert';
import { AddressInfo } from 'net';
import { Readable } from 'stream';

const server = http.createServer((req, res) => {
    const urlObj = url.parse(req.url, true);
    if (urlObj.pathname === '/timeout') {
        setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Hello world!');
        }, 200);
    } else if (urlObj.pathname === '/query') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(JSON.stringify(urlObj.query));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello world!');
    }
});

function read(readable: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        let buffers : Buffer[] = [];
        readable.on('data', function (chunk) {
            buffers.push(chunk);
        });
        readable.on('end', function () {
            resolve(Buffer.concat(buffers));
        });
    });
}

describe('$tea', function () {

    before((done) => {
        server.listen(0, done);
    });

    after(function (done) {
        this.timeout(10000);
        server.close(done);
    });

    it('cast should ok', async function () {
        let data = {
            items: [
                {
                    domain_id: 'sz16',
                    user_id: 'DING-EthqiPlOSS6giE',
                    avatar: '',
                    created_at: 1568773418121,
                    updated_at: 1568773418121,
                    email: '',
                    nick_name: '朴灵',
                    phone: '',
                    role: 'user',
                    status: 'enabled',
                    user_name: '朴灵',
                    description: '',
                    default_drive_id: ''
                },
                {
                    domain_id: 'sz16',
                    user_id: 'superadmin',
                    avatar: '',
                    created_at: 1568732914502,
                    updated_at: 0,
                    email: '',
                    nick_name: 'superadmin',
                    phone: '',
                    role: 'superadmin',
                    status: 'enabled',
                    user_name: 'superadmin',
                    description: '',
                    default_drive_id: ''
                }
            ],
            next_marker: 'next marker'
        };

        class BaseUserResponse extends $tea.Model {
            avatar?: string
            createdAt?: number
            defaultDriveId?: string
            description?: string
            domainId?: string
            email?: string
            nickName?: string
            phone?: string
            role?: string
            status?: string
            updatedAt?: number
            userId?: string
            userName?: string
            static names(): { [key: string]: string } {
                return {
                    avatar: 'avatar',
                    createdAt: 'created_at',
                    defaultDriveId: 'default_drive_id',
                    description: 'description',
                    domainId: 'domain_id',
                    email: 'email',
                    nickName: 'nick_name',
                    phone: 'phone',
                    role: 'role',
                    status: 'status',
                    updatedAt: 'updated_at',
                    userId: 'user_id',
                    userName: 'user_name',
                };
            }

            static types(): { [key: string]: any } {
                return {
                    avatar: 'string',
                    createdAt: 'number',
                    defaultDriveId: 'string',
                    description: 'string',
                    domainId: 'string',
                    email: 'string',
                    nickName: 'string',
                    phone: 'string',
                    role: 'string',
                    status: 'string',
                    updatedAt: 'number',
                    userId: 'string',
                    userName: 'string',
                };
            }

            constructor(map: { [key: string]: any }) {
                super(map);
            }
        }

        class ListUserResponse extends $tea.Model {
            items?: BaseUserResponse[]
            nextMarker?: string
            static names(): { [key: string]: string } {
                return {
                    items: 'items',
                    nextMarker: 'next_marker',
                };
            }

            static types(): { [key: string]: any } {
                return {
                    items: { 'type': 'array', 'itemType': BaseUserResponse },
                    nextMarker: 'string',
                };
            }

            constructor(map: { [key: string]: any }) {
                super(map);
            }
        }

        let response = $tea.cast(data, new ListUserResponse({}));

        assert.deepStrictEqual(response, new ListUserResponse({
            items: [
                new BaseUserResponse({
                    "avatar": "",
                    "createdAt": 1568773418121,
                    "defaultDriveId": "",
                    "description": "",
                    "domainId": "sz16",
                    "email": "",
                    "nickName": "朴灵",
                    "phone": "",
                    "role": "user",
                    "status": "enabled",
                    "updatedAt": 1568773418121,
                    "userId": "DING-EthqiPlOSS6giE",
                    "userName": "朴灵",
                }),
                new BaseUserResponse({
                    "avatar": "",
                    "createdAt": 1568732914502,
                    "defaultDriveId": "",
                    "description": "",
                    "domainId": "sz16",
                    "email": "",
                    "nickName": "superadmin",
                    "phone": "",
                    "role": "superadmin",
                    "status": "enabled",
                    "updatedAt": 0,
                    "userId": "superadmin",
                    "userName": "superadmin"
                })
            ],
            "nextMarker": "next marker"
        }));
    });

    it("retryError should ok", function () {
        let err = $tea.retryError(new $tea.Request(), null);
        assert.strictEqual(err.name, "RetryError");
    });

    it("readable with string should ok", async function () {
        let readable = new $tea.BytesReadable('string');
        const buffer = await read(readable);
        assert.strictEqual(buffer.toString(), 'string');
    });

    it("readable with buffer should ok", async function () {
        let readable = new $tea.BytesReadable(Buffer.from('string'));
        const buffer = await read(readable);
        assert.strictEqual(buffer.toString(), 'string');
    });

    it("isRetryable should ok", function () {
        assert.strictEqual($tea.isRetryable(new Error('')), false);
        let err = $tea.retryError(new $tea.Request(), null);
        assert.strictEqual($tea.isRetryable(err), true);
    });

    it('newUnretryableError should ok', function () {
        let err = $tea.newUnretryableError(new $tea.Request());
        assert.strictEqual(err.name, "UnretryableError");
    });

    it('allowRetry should ok', function () {
        // first time to call allowRetry, return true
        assert.strictEqual($tea.allowRetry({}, 0, Date.now()), true);
        assert.strictEqual($tea.allowRetry({
            retryable: false
        }, 1, Date.now()), false);
        // never policy
        assert.strictEqual($tea.allowRetry({
            retryable: true,
            policy: 'never'
        }, 1, Date.now()), false);
        // always policy
        assert.strictEqual($tea.allowRetry({
            retryable: true,
            policy: 'always'
        }, 1, Date.now()), true);
        // simple policy
        assert.strictEqual($tea.allowRetry({
            retryable: true,
            policy: 'simple',
            maxAttempts: 3
        }, 1, Date.now()), true);
        assert.strictEqual($tea.allowRetry({
            retryable: true,
            policy: 'simple',
            maxAttempts: 3
        }, 3, Date.now()), false);
        // timeout
        assert.strictEqual($tea.allowRetry({
            retryable: true,
            policy: 'timeout',
            timeout: 10
        }, 1, Date.now() - 100), false);
        assert.strictEqual($tea.allowRetry({
            retryable: true,
            policy: 'timeout',
            timeout: 10
        }, 1, Date.now() - 5), true);
        // default
        assert.strictEqual($tea.allowRetry({
            retryable: true
        }, 1, Date.now()), false);
    });

    it('getBackoffTime should ok', function () {
        // first time
        assert.strictEqual($tea.getBackoffTime({}, 0), 0);
        // no policy
        assert.strictEqual($tea.getBackoffTime({
            policy: 'no'
        }, 1), 0);

        // fixed policy
        assert.strictEqual($tea.getBackoffTime({
            policy: 'fixed',
            period: 100
        }, 1), 100);

        // random policy
        let time = $tea.getBackoffTime({
            policy: 'random',
            minPeriod: 10,
            maxPeriod: 100
        }, 1);
        assert.strictEqual(time >= 10 && time <= 100, true);

        // exponential policy
        // 1 time
        assert.strictEqual($tea.getBackoffTime({
            policy: 'exponential',
            initial: 10,
            max: 100,
            multiplier: 1
        }, 1), 10);
        // 2 time
        assert.strictEqual($tea.getBackoffTime({
            policy: 'exponential',
            initial: 10,
            max: 100,
            multiplier: 1
        }, 2), 20);
        assert.strictEqual($tea.getBackoffTime({
            policy: 'exponential',
            initial: 10,
            max: 100,
            multiplier: 1
        }, 3), 40);
        assert.strictEqual($tea.getBackoffTime({
            policy: 'exponential',
            initial: 10,
            max: 100,
            multiplier: 1
        }, 4), 80);
        assert.strictEqual($tea.getBackoffTime({
            policy: 'exponential',
            initial: 10,
            max: 100,
            multiplier: 1
        }, 5), 100);
        // exponential_random policy
        // 1 time
        let b = $tea.getBackoffTime({
            policy: 'exponential_random',
            initial: 10,
            max: 100,
            multiplier: 1
        }, 1);
        assert.strictEqual(b >= 5 && b <= 15, true);
        // 2 time
        b = $tea.getBackoffTime({
            policy: 'exponential_random',
            initial: 10,
            max: 100,
            multiplier: 1
        }, 2);
        assert.strictEqual(b >= 10 && b <= 30, true);
        b = $tea.getBackoffTime({
            policy: 'exponential_random',
            initial: 10,
            max: 100,
            multiplier: 1
        }, 3);
        assert.strictEqual(b >= 20 && b <= 60, true);
        b = $tea.getBackoffTime({
            policy: 'exponential_random',
            initial: 10,
            max: 100,
            multiplier: 1
        }, 4);
        assert.strictEqual(b >= 40 && b <= 100, true);
        b = $tea.getBackoffTime({
            policy: 'exponential_random',
            initial: 10,
            max: 100,
            multiplier: 1
        }, 5);
        assert.strictEqual(b, 100);

        // default
        assert.strictEqual($tea.getBackoffTime({
        }, 5), 0);
    });

    it("new Model should ok", function () {
        class MyModel extends $tea.Model {
            avatar?: string
            static names(): { [key: string]: string } {
                return {
                    avatar: 'avatar',
                    createdAt: 'created_at',
                    defaultDriveId: 'default_drive_id',
                    description: 'description',
                    domainId: 'domain_id',
                    email: 'email',
                    nickName: 'nick_name',
                    phone: 'phone',
                    role: 'role',
                    status: 'status',
                    updatedAt: 'updated_at',
                    userId: 'user_id',
                    userName: 'user_name',
                };
            }

            static types(): { [key: string]: any } {
                return {
                    avatar: 'string'
                };
            }

            constructor(map: { [key: string]: any }) {
                super(map);
            }
        }

        let m = new MyModel(null);
        assert.strictEqual(m.avatar, undefined);
        assert.strictEqual(m.toMap()["avatar"], undefined);

        m = new MyModel({ avatar: "avatar url" });
        assert.strictEqual(m.avatar, "avatar url");
        assert.strictEqual(m.toMap()["avatar"], "avatar url");
    });

    it("sleep should ok", async function () {
        let start = Date.now();
        await $tea.sleep(10);
        assert.ok(Date.now() - start >= 10);
    });

    it("newError should ok", function () {
        let err = $tea.newError({
            code: "code",
            message: "message"
        });
        assert.strictEqual(err.message, 'code: message');
    });

    it('doAction should ok', async function () {
        let request = new $tea.Request();
        request.pathname = '/';
        request.port = (server.address() as AddressInfo).port;
        request.headers['host'] = '127.0.0.1';
        let res = await $tea.doAction(request);
        assert.strictEqual(res.statusCode, 200);
        let bytes = await res.readBytes();
        assert.strictEqual(bytes.toString(), 'Hello world!');
    });
});
