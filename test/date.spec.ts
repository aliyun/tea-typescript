import * as $dara from '../src/index';
import moment from 'moment';
import 'mocha';
import assert from 'assert';

describe('$dara date', function () {
  it('init should be okay', () => {
    const date = new $dara.Date('2023-12-31 00:00:00');
    const expectDate = moment('2023-12-31 00:00:00');
    assert.strictEqual(date.unix(), expectDate.unix());
  });

  it('method should be okay', () => {
    const date = new $dara.Date('2023-12-31 00:00:00.916000 +0800 UTC');
    assert.strictEqual(date.format("YYYY-MM-DD HH:mm:ss"), '2023-12-31 08:00:00');
    assert.strictEqual(date.unix(), 1703980800);
    const yesterday = date.sub("day", 1);
    assert.strictEqual(yesterday.format("YYYY-MM-DD HH:mm:ss"), '2023-12-30 08:00:00');
    assert.strictEqual(date.diff("day", yesterday), 1);
    const tomorrow = date.add("day", 1);
    assert.strictEqual(date.diff("day", tomorrow), -1);
    assert.strictEqual(date.hour(), 8);
    assert.strictEqual(date.minute(), 0);
    assert.strictEqual(date.second(), 0);
    assert.strictEqual(date.dayOfMonth(), 31);
    assert.strictEqual(date.dayOfWeek(), 7);
    assert.strictEqual(date.weekOfMonth(), 5);
    assert.strictEqual(tomorrow.weekOfMonth(), 1);
    assert.strictEqual(yesterday.weekOfMonth(), 5);
    assert.strictEqual(date.weekOfYear(), 52);
    assert.strictEqual(tomorrow.weekOfYear(), 1);
    assert.strictEqual(yesterday.weekOfYear(), 52);
    assert.strictEqual(date.month(), 12);
    assert.strictEqual(date.year(), 2023);
    assert.strictEqual(yesterday.month(), 12);
    assert.strictEqual(yesterday.year(), 2023);
    assert.strictEqual(tomorrow.month(), 1);
    assert.strictEqual(tomorrow.year(), 2024);
  });
});