import 'mocha';
import assert from 'assert';

import * as $dara from "../src/darabonba";

describe('$dara', function () {
    it('isUnset', function () {
        assert.strictEqual($dara.isUnset(undefined), true);
        assert.strictEqual($dara.isUnset(null), true);
        assert.strictEqual($dara.isUnset(1), false);
        assert.strictEqual($dara.isUnset({}), false);
    });

    it('setToMap', function () {
        const m : {[key: string]: any} = {};
        $dara.setToMap(m, 'key', 'value');
        assert.strictEqual(m['key'], 'value');
        $dara.setToMap(m, 'empty', undefined);
        assert.strictEqual(m['empty'], undefined);
    });

    it('mapify', function () {
        // null, undefined
        assert.strictEqual($dara.mapify(undefined), undefined);
        assert.strictEqual($dara.mapify(null), null);
        // primary type
        assert.strictEqual($dara.mapify(1), 1);
        // Model
        class SubModel extends $dara.Model {
            toMap(): {[key: string]: any} {
                return {};
            }
        }
        assert.deepStrictEqual($dara.mapify(new SubModel()), {});
        // array
        assert.deepStrictEqual($dara.mapify([]), []);
        assert.deepStrictEqual($dara.mapify([new SubModel()]), [{}]);
        // map
        const m = {key: 'string'};
        assert.deepStrictEqual($dara.mapify(m), {key: 'string'});
        const m2 = {key: new SubModel()};
        assert.deepStrictEqual($dara.mapify(m2), {key: {}});
    });

    it('push', function () {
        assert.deepStrictEqual($dara.push([], 1), [1]);
    });

    it('Model', function () {
        const m = new $dara.Model();
        assert.throws(() => {
            m.toMap();
        }, (e) => {
            assert.strictEqual(e.message, 'sub-class of Model should implement toMap() method');
            return true;
        });
    });
});
