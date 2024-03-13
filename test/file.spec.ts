import * as $dara from '../src/index';
import 'mocha';
import path from 'path';
import assert from 'assert';
import * as fs from 'fs';
import moment from 'moment';

describe('$dara file', function () {
  const file = new $dara.File(path.join(__dirname, './fixtures/test.txt'));
  fs.writeFileSync(path.join(__dirname, './fixtures/test.txt'), 'Test For File', 'utf8');
  const stat = fs.statSync(path.join(__dirname, './fixtures/test.txt'));
  it('path should be ok', () => {
    assert.strictEqual(file.path(), path.join(__dirname, './fixtures/test.txt'));
  });

  it('createTime should ok', async () => {
    const createTime = await file.createTime();
    assert.strictEqual(createTime.format('YYYY-MM-DD HH:mm:ss'), moment(stat.birthtime).format('YYYY-MM-DD HH:mm:ss'));
    const newFile = new $dara.File(path.join(__dirname, './fixtures/test.txt'));
    const newCreateTime = await newFile.createTime();
    assert.strictEqual(newCreateTime.format('YYYY-MM-DD HH:mm:ss'), moment(stat.birthtime).format('YYYY-MM-DD HH:mm:ss'));
  });

  it('modifyTime should ok', async () => {
    const modifyTime = await file.modifyTime();
    assert.strictEqual(modifyTime.format('YYYY-MM-DD HH:mm:ss'), moment(stat.mtime).format('YYYY-MM-DD HH:mm:ss'));
    const newFile = new $dara.File(path.join(__dirname, './fixtures/test.txt'));
    const newModifyTime = await newFile.modifyTime();
    assert.strictEqual(newModifyTime.format('YYYY-MM-DD HH:mm:ss'), moment(stat.mtime).format('YYYY-MM-DD HH:mm:ss'));
  });

  it('length should ok', async () => {
    assert.strictEqual(await file.length(), stat.size);
    const newFile = new $dara.File(path.join(__dirname, './fixtures/test.txt'));
    assert.strictEqual(await newFile.length(), stat.size);
  });

  it('read should ok', async () => {
    const text1 = await file.read(4);
    assert.strictEqual(text1.toString(), 'Test');
    const text2 = await file.read(4);
    assert.strictEqual(text2.toString(), ' For');
    assert.strictEqual(file._position, 8);
    const emptyFile = new $dara.File(path.join(__dirname, './fixtures/empty.txt'));
    const empty = await emptyFile.read(10);
    assert.strictEqual(empty, null);
    await emptyFile.close();
  });


  it('write should ok', async () => {
    await file.write(Buffer.from(' Test'));
    const modifyTime = await file.modifyTime();
    const length = await file.length();
    assert.strictEqual(modifyTime.format('YYYY-MM-DD HH:mm:ss'), moment().format('YYYY-MM-DD HH:mm:ss'));
    assert.strictEqual(length, stat.size + 5);
    await file.close();
    const newFile = new $dara.File(path.join(__dirname, './fixtures/newfile.txt'));
    await newFile.write(Buffer.from('Test'));
    const text = await newFile.read(4);
    assert.strictEqual(text.toString(), 'Test');
    await newFile.close();
  });

  it('exists should ok', async () => {
    assert.ok(await $dara.File.exists(path.join(__dirname, './fixtures/test.txt')));
    assert.ok(!(await $dara.File.exists(path.join(__dirname, './fixtures/test1.txt'))));
  });

  it('creatStream should ok', function () {
    const rs = $dara.File.createReadStream(path.join(__dirname, './fixtures/test.txt'));
    const ws = $dara.File.createWriteStream(path.join(__dirname, './fixtures/test.txt'));
    rs.pipe(ws);
  });

});