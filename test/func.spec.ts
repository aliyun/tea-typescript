import * as $dara from '../src/index';
import 'mocha';
import assert from 'assert';
import moment from 'moment';

describe('$dara func', function () {

  it('isNull should ok', function () {
    assert.deepStrictEqual($dara.isNull(null), true);
    assert.deepStrictEqual($dara.isNull(undefined), true);
    assert.deepStrictEqual($dara.isNull(false), false);
    assert.deepStrictEqual($dara.isNull({}), false);
  });

  it('merge should ok', async function () {
    const obj1 = {
      a: 1,
      b: { c: 2, d: { e: 3 } },
      c: 4,
    };
    const obj2 = {
      b: { d: { f: 4 }, g: 5 },
      h: 6,
    };
    const expectedResult = {
      a: 1,
      b: { c: 2, d: { e: 3, f: 4 }, g: 5 },
      c: 4,
      h: 6
    };
    assert.deepStrictEqual($dara.merge(obj1, obj2), expectedResult);
    assert.deepStrictEqual($dara.merge(obj1, null), obj1);
    assert.deepStrictEqual($dara.merge(obj1, undefined), obj1);
    assert.deepStrictEqual($dara.merge(null, undefined), null);
  });

  it('sleep should ok', async function () {
    const begin = moment().unix();
    await $dara.sleep(1000);
    const end = moment().unix();
    assert.deepStrictEqual(end - begin, 1);
  });
});