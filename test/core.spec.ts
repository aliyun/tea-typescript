'use strict';

import http from 'http';
import url from 'url';
import 'mocha';
import assert from 'assert';
import { AddressInfo } from 'net';
import { Readable, Writable } from 'stream';

import * as $dara from '../src/index';

const server = http.createServer((req, res) => {
  const urlObj = url.parse(req.url, true);
  if (urlObj.pathname === '/timeout') {
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Hello world!');
    }, 5000);
  } else if (urlObj.pathname === '/keepAlive') {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Client-Keep-Alive': req.headers.connection
    });
    res.end('Hello world!');
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
    const buffers: Buffer[] = [];
    readable.on('data', function (chunk) {
      buffers.push(chunk);
    });
    readable.on('end', function () {
      resolve(Buffer.concat(buffers));
    });
  });
}

describe('$dara', function () {

  before((done) => {
    server.listen(0, done);
  });

  after(function (done) {
    this.timeout(10000);
    server.close(done);
  });

  describe('cast', function () {

    it('cast should ok', function () {
      class ListInfo {
        length: number
        constructor(length: number) {
          this.length = length;
        }
      }
      class TypeInfo {
        type: string
        constructor(type: string) {
          this.type = type;
        }
      }
      const testStream = new Readable();
      const testWStream = new Writable();
      const meta: { [key: string]: string } = {
        'habits': 'dota'
      };
      const listInfo = new ListInfo(2);
      const typeList = [new TypeInfo('user'), new TypeInfo('admin')];
      const info = {
        info: 'ok'
      };
      const data = {
        items: [
          {
            domain_id: 'sz16',
            user_id: 'DING-EthqxxiPlOSS6gxxixxE',
            avatar: '',
            created_at: 1568773418121,
            updated_at: 1568773418121,
            email: '',
            nick_name: '朴X',
            strong: 'true',
            phone: '',
            role: 'user',
            status: 'enabled',
            titles: ['Node.js官方认证开发者', '深入浅出Node.js作者'],
            user_name: '朴X',
            description: '',
            default_drive_id: '',
            meta,
            extra: info,
            file: testWStream,
            float_id: '3.1415'
          },
          {
            domain_id: 'sz16',
            user_id: 'DING-aexxfgfelxx',
            avatar: '',
            created_at: 1568732914442,
            updated_at: 0,
            email: '',
            nick_name: '普X',
            strong: 1,
            phone: '',
            role: 'user',
            status: 'enabled',
            titles: ['写代码的'],
            user_name: '普X',
            description: '',
            default_drive_id: '',
            extra: 'simple',
          },
          {
            domain_id: 1234,
            user_id: 'DING-aefgfesd',
            avatar: '',
            created_at: '1568732914442',
            updated_at: '0',
            email: '',
            nick_name: 'test',
            strong: 'false',
            phone: '',
            role: 'user',
            status: 'enabled',
            titles: ['测试工程师'],
            user_name: 'TS',
            description: '',
            default_drive_id: '',
            extra: 'simple',
          }
        ],
        superadmin: {
          domain_id: 'sz16',
          user_id: 'superadmin',
          avatar: '',
          created_at: 1568732914502,
          updated_at: 0,
          email: '',
          nick_name: 'superadmin',
          strong: false,
          phone: '',
          role: 'superadmin',
          status: 'enabled',
          titles: ['superadmin'],
          user_name: 'superadmin',
          description: '',
          default_drive_id: '',
          meta
        },
        stream: testStream,
        list_info: listInfo,
        type_list: typeList,
        next_marker: 'next marker'
      };

      class BaseUserResponse extends $dara.Model {
        avatar?: string
        createdAt?: number
        defaultDriveId?: string
        description?: string
        domainId?: string
        email?: string
        nickName?: string
        strong?: boolean
        phone?: string
        role?: string
        status?: string
        titles?: string
        updatedAt?: number
        userId?: string
        userName?: string
        meta?: { [key: string]: any }
        file: Writable
        extra?: any
        floatId: number
        static names(): { [key: string]: string } {
          return {
            avatar: 'avatar',
            createdAt: 'created_at',
            defaultDriveId: 'default_drive_id',
            description: 'description',
            domainId: 'domain_id',
            email: 'email',
            nickName: 'nick_name',
            strong: 'strong',
            phone: 'phone',
            role: 'role',
            status: 'status',
            titles: 'titles',
            updatedAt: 'updated_at',
            userId: 'user_id',
            userName: 'user_name',
            meta: 'meta',
            extra: 'extra',
            file: 'file',
            floatId: 'float_id',
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
            strong: 'boolean',
            phone: 'string',
            role: 'string',
            status: 'string',
            titles: { type: 'array', itemType: 'string' },
            updatedAt: 'number',
            userId: 'string',
            userName: 'string',
            meta: { 'type': 'map', 'keyType': 'string', 'valueType': 'any' },
            extra: 'any',
            file: 'Writable',
            floatId: 'number',
          };
        }

        constructor(map: { [key: string]: any }) {
          super(map);
        }
      }

      class ListUserResponse extends $dara.Model {
        items?: BaseUserResponse[]
        superadmin?: BaseUserResponse
        stream?: Readable
        nextMarker?: string
        listInfo?: ListInfo
        typeList?: TypeInfo
        static names(): { [key: string]: string } {
          return {
            items: 'items',
            superadmin: 'superadmin',
            stream: 'stream',
            nextMarker: 'next_marker',
            listInfo: 'list_info',
            typeList: 'type_list',
          };
        }

        static types(): { [key: string]: any } {
          return {
            items: { 'type': 'array', 'itemType': BaseUserResponse },
            superadmin: BaseUserResponse,
            stream: 'Readable',
            nextMarker: 'string',
            listInfo: ListInfo,
            typeList: { 'type': 'array', 'itemType': TypeInfo },
          };
        }

        constructor(map: { [key: string]: any }) {
          super(map);
        }
      }

      const response = $dara.cast(data, new ListUserResponse({}));
      assert.deepStrictEqual(response, new ListUserResponse({
        items: [
          new BaseUserResponse({
            'avatar': '',
            'createdAt': 1568773418121,
            'defaultDriveId': '',
            'description': '',
            'domainId': 'sz16',
            'strong': true,
            'email': '',
            'nickName': '朴X',
            'phone': '',
            'role': 'user',
            'status': 'enabled',
            'titles': [ 'Node.js官方认证开发者', '深入浅出Node.js作者'],
            'updatedAt': 1568773418121,
            'userId': 'DING-EthqxxiPlOSS6gxxixxE',
            'userName': '朴X',
            'meta': meta,
            'extra': { info: 'ok' },
            'file': testWStream, 
            'floatId': 3.1415
          }),
          new BaseUserResponse({
            'avatar': '',
            'createdAt': 1568732914442,
            'defaultDriveId': '',
            'description': '',
            'domainId': 'sz16',
            'email': '',
            'nickName': '普X',
            'strong': true,
            'phone': '',
            'role': 'user',
            'status': 'enabled',
            'titles': ['写代码的'],
            'updatedAt': 0,
            'userId': 'DING-aexxfgfelxx',
            'userName': '普X',
            'meta': undefined,
            'extra': 'simple',
            'floatId': undefined
          }),
          new BaseUserResponse({
            'avatar': '',
            'createdAt': 1568732914442,
            'defaultDriveId': '',
            'description': '',
            'domainId': '1234',
            'email': '',
            'nickName': 'test',
            'strong': false,
            'phone': '',
            'role': 'user',
            'status': 'enabled',
            'titles': ['测试工程师'],
            'updatedAt': 0,
            'userId': 'DING-aefgfesd',
            'userName': 'TS',
            'meta': undefined,
            'extra': 'simple',
            'floatId': undefined
          })
        ],
        'superadmin': new BaseUserResponse({
          'avatar': '',
          'createdAt': 1568732914502,
          'defaultDriveId': '',
          'description': '',
          'domainId': 'sz16',
          'email': '',
          'nickName': 'superadmin',
          'strong': false,
          'phone': '',
          'role': 'superadmin',
          'status': 'enabled',
          'titles': ['superadmin'],
          'updatedAt': 0,
          'userId': 'superadmin',
          'userName': 'superadmin',
          'meta': meta
        }),
        'stream': testStream,
        'listInfo': listInfo,
        'typeList': typeList,
        'nextMarker': 'next marker'
      }));
    });

    it('cast wrong type should error', function () {
      class MetaInfo {
        meta: string
        constructor(meta: string) {
          this.meta = meta;
        }
      }
      class MapInfo {
        map: { [key: string]: any }
        static names(): { [key: string]: string } {
          return {
            map: 'map'
          };
        }

        static types(): { [key: string]: any } {
          return {
            map: { 'type': 'map', 'keyType': 'string', 'valueType': 'any' }
          };
        }
        constructor(map: { [key: string]: any }) {
          this.map = map;
        }
      }
      class UserInfoResponse extends $dara.Model {
        name: string
        age: number
        strong: boolean
        title: string[]
        metaInfo: MetaInfo
        static names(): { [key: string]: string } {
          return {
            name: 'name',
            title: 'title',
            strong: 'strong',
            age: 'age',
            metaInfo: 'metaInfo',
          };
        }

        static types(): { [key: string]: any } {
          return {
            title: { 'type': 'array', 'itemType': 'string' },
            name: 'string',
            age: 'number',
            strong: 'boolean',
            metaInfo: MetaInfo
          };
        }

        constructor(map: { [key: string]: any }) {
          super(map);
        }
      }

      assert.throws(function () {
        $dara.cast(undefined, new UserInfoResponse({}))
      }, function (err: Error) {
        assert.strictEqual(err.message, 'can not cast to Map');
        return true;
      });

      assert.throws(function () {
        const data = { map: 'string' };
        $dara.cast(data, new MapInfo({}))
      }, function (err: Error) {
        assert.strictEqual(err.message, 'type of map is mismatch, expect object, but string');
        return true;
      });

      assert.throws(function () {
        $dara.cast('data', new UserInfoResponse({}));
      }, function (err: Error) {
        assert.strictEqual(err.message, 'can not cast to Map');
        return true;
      });

      assert.throws(function () {
        const data = {
          name: ['123'],
          age: 21,
          strong: true,
          title: ['写代码的'],
          metaInfo: new MetaInfo('平台')
        }
        $dara.cast(data, new UserInfoResponse({}))
      }, function (err: Error) {
        assert.strictEqual(err.message, 'type of name is mismatch, expect string, but object');
        return true;
      });

      assert.throws(function () {
        const data = {
          name: '普X',
          age: 21,
          strong: true,
          title: '写代码的',
          metaInfo: new MetaInfo('平台')
        }
        $dara.cast(data, new UserInfoResponse({}));
      }, function (err: Error) {
        assert.strictEqual(err.message, 'type of title is mismatch, expect array, but string');
        return true;
      });

      assert.throws(function () {
        const data = {
          name: '普X',
          age: '21a',
          strong: true,
          title: ['写代码的'],
          metaInfo: new MetaInfo('平台')
        }
        $dara.cast(data, new UserInfoResponse({}))
      }, function (err: Error) {
        assert.strictEqual(err.message, 'type of age is mismatch, expect number, but string')
        return true;
      });

      assert.throws(function () {
        const data = {
          name: '普X',
          age: 21,
          strong: 'ture',
          title: ['写代码的'],
          metaInfo: new MetaInfo('平台')
        }
        $dara.cast(data, new UserInfoResponse({}))
      }, function (err: Error) {
        assert.strictEqual(err.message, 'type of strong is mismatch, expect boolean, but string')
        return true;
      });

      assert.throws(function () {
        const data = {
          name: '普X',
          age: 21,
          strong: true,
          title: ['写代码的'],
          metaInfo: '平台'
        }
        $dara.cast(data, new UserInfoResponse({}))
      }, function (err: Error) {
        assert.strictEqual(err.message, 'type of metaInfo is mismatch, expect object, but string')
        return true;
      });
    });

    it('cast should ok(with bytes)', function () {
      class BytesModel extends $dara.Model {
        bytes: Buffer;
        static names(): { [key: string]: string } {
          return {
            bytes: 'bytes',
          };
        }

        static types(): { [key: string]: any } {
          return {
            bytes: 'Buffer',
          };
        }

        constructor(map: { [key: string]: any }) {
          super(map);
        }
      }

      const response = $dara.cast({
        bytes: Buffer.from('bytes')
      }, new BytesModel({}));

      assert.deepStrictEqual(response.bytes, Buffer.from('bytes'));
    });

    it('cast should ok(with big number)', function () {
      class bigNumModel extends $dara.Model {
        num: number;
        str: string;
        static names(): { [key: string]: string } {
          return {
            num: 'num',
            str: 'str',
          };
        }

        static types(): { [key: string]: any } {
          return {
            num: 'number',
            str: 'string',
          };
        }

        constructor(map: { [key: string]: any }) {
          super(map);
        }
      }

      const response = $dara.cast({
        num: '9007199254740991',
        str: 9007199254740991,
      }, new bigNumModel({}));

      assert.deepStrictEqual(response, new bigNumModel({
        num: 9007199254740991,
        str: '9007199254740991',
      }));
    });
  });

  it('retryError should ok', function () {
    const err = $dara.retryError(new $dara.Request(), null);
    assert.strictEqual(err.name, 'RetryError');
  });

  it('readable with string should ok', async function () {
    const readable = new $dara.BytesReadable('string');
    const buffer = await read(readable);
    assert.strictEqual(buffer.toString(), 'string');
  });

  it('readable with buffer should ok', async function () {
    const readable = new $dara.BytesReadable(Buffer.from('string'));
    const buffer = await read(readable);
    assert.strictEqual(buffer.toString(), 'string');
  });

  it('isRetryable should ok', function () {
    assert.strictEqual($dara.isRetryable(undefined), false);
    assert.strictEqual($dara.isRetryable(null), false);
    assert.strictEqual($dara.isRetryable(new Error('')), false);
    const err = $dara.retryError(new $dara.Request(), null);
    assert.strictEqual($dara.isRetryable(err), true);
  });

  it('allowRetry should ok', function () {
    // first time to call allowRetry, return true
    assert.strictEqual($dara.allowRetry({}, 0, Date.now()), true);
    assert.strictEqual($dara.allowRetry({
      retryable: false
    }, 1, Date.now()), false);
    // never policy
    assert.strictEqual($dara.allowRetry({
      retryable: true,
      policy: 'never'
    }, 1, Date.now()), false);
    // always policy
    assert.strictEqual($dara.allowRetry({
      retryable: true,
      policy: 'always'
    }, 1, Date.now()), true);
    // simple policy
    assert.strictEqual($dara.allowRetry({
      retryable: true,
      policy: 'simple',
      maxAttempts: 3
    }, 1, Date.now()), true);
    assert.strictEqual($dara.allowRetry({
      retryable: true,
      policy: 'simple',
      maxAttempts: 3
    }, 3, Date.now()), false);
    // timeout
    assert.strictEqual($dara.allowRetry({
      retryable: true,
      policy: 'timeout',
      timeout: 10
    }, 1, Date.now() - 100), false);
    assert.strictEqual($dara.allowRetry({
      retryable: true,
      policy: 'timeout',
      timeout: 10
    }, 1, Date.now() - 5), true);
    // default
    assert.strictEqual($dara.allowRetry({
      retryable: true
    }, 1, Date.now()), false);
    assert.strictEqual($dara.allowRetry({
      retryable: true,
      maxAttempts: 'no'
    }, 1, Date.now()), false);
    assert.strictEqual($dara.allowRetry({
      retryable: true,
      maxAttempts: true
    }, 1, Date.now()), false);
    assert.strictEqual($dara.allowRetry({
      retryable: true,
      maxAttempts: 1
    }, 1, Date.now()), true);
    assert.strictEqual($dara.allowRetry({
      retryable: true,
      maxAttempts: 0
    }, 1, Date.now()), false);
  });

  it('getBackoffTime should ok', function () {
    // first time
    assert.strictEqual($dara.getBackoffTime({}, 0), 0);
    // no policy
    assert.strictEqual($dara.getBackoffTime({
      policy: 'no'
    }, 1), 0);

    // fixed policy
    assert.strictEqual($dara.getBackoffTime({
      policy: 'fixed',
      period: 100
    }, 1), 100);

    // random policy
    const time = $dara.getBackoffTime({
      policy: 'random',
      minPeriod: 10,
      maxPeriod: 100
    }, 1);
    assert.strictEqual(time >= 10 && time <= 100, true);

    // exponential policy
    // 1 time
    assert.strictEqual($dara.getBackoffTime({
      policy: 'exponential',
      initial: 10,
      max: 100,
      multiplier: 1
    }, 1), 10);
    // 2 time
    assert.strictEqual($dara.getBackoffTime({
      policy: 'exponential',
      initial: 10,
      max: 100,
      multiplier: 1
    }, 2), 20);
    assert.strictEqual($dara.getBackoffTime({
      policy: 'exponential',
      initial: 10,
      max: 100,
      multiplier: 1
    }, 3), 40);
    assert.strictEqual($dara.getBackoffTime({
      policy: 'exponential',
      initial: 10,
      max: 100,
      multiplier: 1
    }, 4), 80);
    assert.strictEqual($dara.getBackoffTime({
      policy: 'exponential',
      initial: 10,
      max: 100,
      multiplier: 1
    }, 5), 100);
    // exponential_random policy
    // 1 time
    let b = $dara.getBackoffTime({
      policy: 'exponential_random',
      initial: 10,
      max: 100,
      multiplier: 1
    }, 1);
    assert.strictEqual(b >= 5 && b <= 15, true);
    // 2 time
    b = $dara.getBackoffTime({
      policy: 'exponential_random',
      initial: 10,
      max: 100,
      multiplier: 1
    }, 2);
    assert.strictEqual(b >= 10 && b <= 30, true);
    b = $dara.getBackoffTime({
      policy: 'exponential_random',
      initial: 10,
      max: 100,
      multiplier: 1
    }, 3);
    assert.strictEqual(b >= 20 && b <= 60, true);
    b = $dara.getBackoffTime({
      policy: 'exponential_random',
      initial: 10,
      max: 100,
      multiplier: 1
    }, 4);
    assert.strictEqual(b >= 40 && b <= 100, true);
    b = $dara.getBackoffTime({
      policy: 'exponential_random',
      initial: 10,
      max: 100,
      multiplier: 1
    }, 5);
    assert.strictEqual(b, 100);

    // default
    assert.strictEqual($dara.getBackoffTime({
    }, 5), 0);
  });

  it('new Model should ok', function () {
    class SubModel extends $dara.Model {
      status?: number
      bytes?: Readable
      file?: Writable
      static names(): { [key: string]: string } {
        return {
          status: 'status',
          bytes: 'bytes',
          file: 'file',
        };
      }

      static types(): { [key: string]: any } {
        return {
          status: 'number',
          bytes: 'Readable',
          file: 'Writable'
        };
      }

      constructor(map: { [key: string]: any }) {
        super(map);
      }
    }
    class MyModel extends $dara.Model {
      avatar?: string
      role?: string[]
      status: SubModel
      static names(): { [key: string]: string } {
        return {
          avatar: 'avatar',
          status: 'status',
          role: 'role',
        };
      }

      static types(): { [key: string]: any } {
        return {
          avatar: 'string',
          status: SubModel,
          role: { type: 'array', itemType: 'string' }
        };
      }

      constructor(map: { [key: string]: any }) {
        super(map);
      }
    }

    let m = new MyModel(null);
    assert.strictEqual(m.avatar, undefined);
    assert.strictEqual($dara.toMap(m)['avatar'], undefined);
    assert.strictEqual($dara.toMap(), null);
    assert.strictEqual($dara.toMap(undefined), null);
    assert.strictEqual($dara.toMap(null), null);

    m = new MyModel({ avatar: 'avatar url' });
    assert.strictEqual(m.avatar, 'avatar url');
    assert.strictEqual($dara.toMap(m)['avatar'], 'avatar url');

    m = new MyModel({
      avatar: 'avatar url',
      role: ['admin', 'user'],
    });
    assert.strictEqual($dara.toMap(m)['role'][0], 'admin');
    assert.strictEqual($dara.toMap(m)['role'][1], 'user');
    const testReadalbe = new $dara.BytesReadable('test');
    const testWritable = new Writable();
    m = new MyModel({
      status: new SubModel({
        status: 1,
        bytes: testReadalbe,
        file: testWritable,
      })
    });
    assert.strictEqual($dara.toMap(m)['status']['status'], 1);
    assert.strictEqual($dara.toMap(m)['status']['bytes'], testReadalbe);
    assert.strictEqual($dara.toMap(m)['status']['file'], testWritable);

    assert.strictEqual($dara.toMap(m, true)['status']['status'], 1);
    assert.strictEqual($dara.toMap(m, true)['status']['bytes'], null);
    assert.strictEqual($dara.toMap(m, true)['status']['file'], null);
  });

  it('new Model with wrong type should error', function () {
    class MyModel extends $dara.Model {
      avatar?: string
      role?: string[]
      static names(): { [key: string]: string } {
        return {
          avatar: 'avatar',
          role: 'role',
        };
      }

      static types(): { [key: string]: any } {
        return {
          avatar: 'string',
          role: { type: 'array', itemType: 'string' }
        };
      }

      constructor(map: { [key: string]: any }) {
        super(map);
      }
    }
    assert.throws(function () {
      const m = new MyModel({
        avatar: 'avatar url',
        role: 'admin',
      });
    }, function (err: Error) {
      assert.strictEqual(err.message, 'expect: array, actual: string');
      return true;
    });
  });

  it('Model function should ok', async function () {
    class SubModel extends $dara.Model {
      status: number
      bytes?: Readable
      file?: Writable

      validate() {
        $dara.Model.validateRequired('status', this.status);
        $dara.Model.validateMaximum('status', this.status, 300);
        $dara.Model.validateMinimum('status', this.status, 100);
      }

      static names(): { [key: string]: string } {
        return {
          status: 'status',
          bytes: 'bytes',
          file: 'file',
        };
      }

      static types(): { [key: string]: any } {
        return {
          status: 'number',
          bytes: 'Readable',
          file: 'Writable'
        };
      }

      constructor(map: { [key: string]: any }) {
        super(map);
      }
    }
    class MyModel extends $dara.Model {
      avatar?: string
      role?: string[]
      status: SubModel
      static names(): { [key: string]: string } {
        return {
          avatar: 'avatar',
          status: 'status',
          role: 'role',
        };
      }

      static types(): { [key: string]: any } {
        return {
          avatar: 'string',
          status: SubModel,
          role: { type: 'array', itemType: 'string' }
        };
      }

      validate() {
        $dara.Model.validateRequired('status', this.status)
        $dara.Model.validateMaxLength('role', this.role, 5);
        $dara.Model.validateMinLength('role', this.role, 1);
        $dara.Model.validatePattern("avatar", this.avatar, "^https://");
        super.validate();
      }

      constructor(map: { [key: string]: any }) {
        super(map);
      }
    }

    const testReadalbe = new $dara.BytesReadable('test');
    const testWritable = new Writable();
    let m = new MyModel({
      avatar: 'https://avatarurl.com/path',
      role: ['admin', 'user'],
      status: new SubModel({
        status: 101,
        bytes: testReadalbe,
        file: testWritable,
      })
    });
    assert.doesNotThrow(m.validate.bind(m), $dara.BaseError);
    assert.deepStrictEqual(m.copyWithoutStream().toMap(), {
      avatar: 'https://avatarurl.com/path',
      role: ['admin', 'user'],
      status: {
        status: 101,
      }
    });

    assert.throws(function () {
      const m = new MyModel({
        avatar: 'avatarurl',
        status: new SubModel({
          status: 101,
        })
      });
      m.validate();
    }, function (err: $dara.BaseError) {
      assert.strictEqual(err.message, 'SDK.ValidateError: avatar is not match ^https://.');
      return true;
    });

    assert.throws(function () {
      const m = new MyModel({
        role: [],
        status: new SubModel({
          status: 101,
        })
      });
      m.validate();
    }, function (err: $dara.BaseError) {
      assert.strictEqual(err.message, 'SDK.ValidateError: role is exceed min-length: 1.');
      return true;
    });

    assert.throws(function () {
      const m = new MyModel({
        avatar: 'https://avatarurl.com/path',
        role: ['a', 'b', 'c', 'd', 'e', 'f'],
        status: new SubModel({
          status: 101,
          bytes: testReadalbe,
          file: testWritable,
        })
      });
      m.validate();
    }, function (err: $dara.BaseError) {
      assert.strictEqual(err.message, 'SDK.ValidateError: role is exceed max-length: 5.');
      return true;
    });

    assert.throws(function () {
      const m = new SubModel({
        status: 99,
      });
      m.validate();
    }, function (err: $dara.BaseError) {
      assert.strictEqual(err.message, 'SDK.ValidateError: status cannot be less than 100.');
      return true;
    });

    assert.throws(function () {
      const m = new SubModel({
        status: 301,
      });
      m.validate();
    }, function (err: $dara.BaseError) {
      assert.strictEqual(err.message, 'SDK.ValidateError: status cannot be greater than 300.');
      return true;
    });

    assert.throws(function () {
      const m = new SubModel({
        bytes: testReadalbe,
        file: testWritable,
      });
      m.validate();
    }, function (err: $dara.BaseError) {
      assert.strictEqual(err.message, 'SDK.ValidateError: status is required.');
      return true;
    });

    class ComplexModel extends $dara.Model {
      modelArr?: MyModel[][]
      modelMap?: { [key: string]: SubModel[] }
      modelMapArr?: { [key: string]: SubModel }[]
      static names(): { [key: string]: string } {
        return {
          modelArr: 'modelArr',
          modelMap: 'modelMap',
          modelMapArr: 'modelMapArr',
        };
      }

      static types(): { [key: string]: any } {
        return {
          modelArr: { type: 'array', itemType: { type: 'array', itemType: MyModel } },
          modelMap: { type: 'map',  'keyType': 'string', 'valueType': { type: 'array', itemType: SubModel } },
          modelMapArr: { type: 'array', itemType: { type: 'map',  'keyType': 'string', 'valueType': SubModel } },
        };
      }

      validate() {
        if(Array.isArray(this.modelArr)) {
          $dara.Model.validateArray(this.modelArr);
        }
        if(this.modelMap) {
          $dara.Model.validateMap(this.modelMap);
        }
        if(Array.isArray(this.modelMapArr)) {
          $dara.Model.validateArray(this.modelMapArr);
        }
        super.validate();
      }
    }
    m = new MyModel({
      avatar: 'https://avatarurl.com/path',
      role: ['admin', 'user'],
      status: new SubModel({
        status: 101,
        bytes: testReadalbe,
        file: testWritable,
      })
    });
    let subM = new SubModel({
      status: 101,
      bytes: testReadalbe,
      file: testWritable,
    });
    let cm = new ComplexModel({
      modelArr: [[m]],
      modelMap: {
        key: [subM],
        key1: undefined,
      },
      modelMapArr: [null]
    });
    assert.doesNotThrow(cm.validate.bind(cm), $dara.BaseError);

    assert.throws(function () {
      const m = new MyModel({
        avatar: 'avatarurl',
        status: new SubModel({
          status: 101,
        })
      });
      const subM = new SubModel({
        status: 101,
        bytes: testReadalbe,
        file: testWritable,
      });
      const cm = new ComplexModel({
        modelArr: [[m]],
        modelMap: {
          key: [subM],
          key1: undefined,
        },
        modelMapArr: []
      });
      cm.validate();
    }, function (err: $dara.BaseError) {
      assert.strictEqual(err.message, 'SDK.ValidateError: avatar is not match ^https://.');
      return true;
    });


    assert.throws(function () {
      const subM = new SubModel({
        status: 301,
      });
      const cm = new ComplexModel({
        modelMap: {
          key: [subM],
          key1: undefined,
        },
        modelMapArr: []
      });
      cm.validate();
    }, function (err: $dara.BaseError) {
      assert.strictEqual(err.message, 'SDK.ValidateError: status cannot be greater than 300.');
      return true;
    });

    assert.throws(function () {
      const subM = new SubModel({
        bytes: testReadalbe,
        file: testWritable,
      });
      const cm = new ComplexModel({
        modelMapArr: [{
          key: subM
        }]
      });
      cm.validate();
    }, function (err: $dara.BaseError) {
      assert.strictEqual(err.message, 'SDK.ValidateError: status is required.');
      return true;
    });
  });

  it('sleep should ok', async function () {
    const start = Date.now();
    await $dara.sleep(10);
    assert.ok(Date.now() - start >= 10);
  });

  it('doAction should ok', async function () {
    const request = new $dara.Request();
    request.pathname = '/';
    request.port = (server.address() as AddressInfo).port;
    request.headers['host'] = '127.0.0.1';
    request.query = { id: '1' };
    const res = await $dara.doAction(request, { timeout: 1000, ignoreSSL: true });
    assert.strictEqual(res.statusCode, 200);
    const bytes = await res.readBytes();
    assert.strictEqual(bytes.toString(), 'Hello world!');
  });

  it('doAction when path with query should ok', async function () {
    const request = new $dara.Request();
    request.pathname = '/?name';
    request.port = (server.address() as AddressInfo).port;
    request.headers['host'] = '127.0.0.1';
    request.query = { id: '1' };
    const res = await $dara.doAction(request, { timeout: 1000, ignoreSSL: true });
    assert.strictEqual(res.statusCode, 200);
    const bytes = await res.readBytes();
    assert.strictEqual(bytes.toString(), 'Hello world!');
  });

  it('doAction with post method should ok', async function () {
    const request = new $dara.Request();
    request.method = 'POST';
    request.pathname = '/';
    request.port = (server.address() as AddressInfo).port;
    request.headers['host'] = '127.0.0.1';
    const res = await $dara.doAction(request, { timeout: 1000, ignoreSSL: true });
    assert.strictEqual(res.statusCode, 200);
    const bytes = await res.readBytes();
    assert.strictEqual(bytes.toString(), 'Hello world!');
  });

  it('doAction with self-signed certificates should ok', async function () {
    const request = new $dara.Request();
    request.method = 'POST';
    request.pathname = '/';
    request.port = (server.address() as AddressInfo).port;
    request.headers['host'] = '127.0.0.1';
    const res = await $dara.doAction(request, {
      timeout: 1000,
      ignoreSSL: true,
      key: 'private rsa key',
      cert: 'private certification',
    });
    assert.strictEqual(res.statusCode, 200);
    const bytes = await res.readBytes();
    assert.strictEqual(bytes.toString(), 'Hello world!');
  });

  it('doAction with ca should ok', async function () {
    const request = new $dara.Request();
    request.method = 'POST';
    request.pathname = '/';
    request.port = (server.address() as AddressInfo).port;
    request.headers['host'] = '127.0.0.1';
    const res = await $dara.doAction(request, {
      timeout: 1000,
      ignoreSSL: true,
      ca: 'ca',
    });
    assert.strictEqual(res.statusCode, 200);
    const bytes = await res.readBytes();
    assert.strictEqual(bytes.toString(), 'Hello world!');
  });

  it('doAction with timeout should ok', async function () {
    const request = new $dara.Request();
    request.method = 'POST';
    request.pathname = '/timeout';
    request.port = (server.address() as AddressInfo).port;
    request.headers['host'] = '127.0.0.1';
    const res = await $dara.doAction(request, {
      connectTimeout: 6000,
      readTimeout: 6000
    });
    assert.strictEqual(res.statusCode, 200);
    const bytes = await res.readBytes();
    assert.strictEqual(bytes.toString(), 'Hello world!');
  });

  it('doAction with keepAlive should ok', async function () {
    const request = new $dara.Request();
    request.method = 'POST';
    request.pathname = '/keepAlive';
    request.port = (server.address() as AddressInfo).port;
    request.headers['host'] = '127.0.0.1';
    let res = await $dara.doAction(request);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['client-keep-alive'], 'keep-alive');
    let bytes = await res.readBytes();
    assert.strictEqual(bytes.toString(), 'Hello world!');

    res = await $dara.doAction(request, {
      keepAlive: true
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['client-keep-alive'], 'keep-alive');
    bytes = await res.readBytes();
    assert.strictEqual(bytes.toString(), 'Hello world!');

    res = await $dara.doAction(request, {
      keepAlive: false
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['client-keep-alive'], 'close');
    bytes = await res.readBytes();
    assert.strictEqual(bytes.toString(), 'Hello world!');
  });

  it('toMap another version model', async function () {
    class AnotherModel {
      toMap(): { [key: string]: any } {
        return {};
      }
    }

    const m = new AnotherModel();
    assert.deepStrictEqual($dara.toMap(m), {});
  });
});