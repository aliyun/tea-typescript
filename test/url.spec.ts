import * as $dara from '../src/index';
import 'mocha';
import assert from 'assert';
import moment from 'moment';

describe('$dara url', function () {

  it('parse should ok', function () {
    const url = 'https://sdk:test@ecs.aliyuncs.com:443/sdk/?api&ok=test#sddd';
    const ret = $dara.URL.parse(url);
    assert.deepStrictEqual(ret.path(), '/sdk/?api&ok=test');
    assert.deepStrictEqual(ret.pathname(), '/sdk/');
    assert.deepStrictEqual(ret.protocol(), 'https');
    assert.deepStrictEqual(ret.hostname(), 'ecs.aliyuncs.com');
    assert.deepStrictEqual(ret.host(), 'ecs.aliyuncs.com');
    assert.deepStrictEqual(ret.port(), '443');
    assert.deepStrictEqual(ret.hash(), 'sddd');
    assert.deepStrictEqual(ret.search(), 'api&ok=test');
    assert.deepStrictEqual(ret.href(), 'https://sdk:test@ecs.aliyuncs.com/sdk/?api&ok=test#sddd');
    assert.deepStrictEqual(ret.auth(), 'sdk:test');
  });

  it('urlEncode should ok', async function () {
    const result = $dara.URL.urlEncode('https://www.baidu.com/')
    assert.strictEqual("https%3A%2F%2Fwww.baidu.com%2F", result);
  });

  it('percentEncode should ok', async function () {
    const result = $dara.URL.percentEncode('https://www.bai+*~du.com/')
    assert.strictEqual("https%3A%2F%2Fwww.bai%2B%2A~du.com%2F", result);
  });

  it('pathEncode should ok', async function () {
    const result = $dara.URL.pathEncode("/work_space/DARABONBA/GIT/darabonba-util/ts")
    assert.strictEqual("/work_space/DARABONBA/GIT/darabonba-util/ts", result);
  });
});