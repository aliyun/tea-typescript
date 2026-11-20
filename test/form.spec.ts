import * as $dara from '../src/index';
import 'mocha';
import assert from 'assert';
import { createReadStream } from 'fs';
import { join } from 'path';
import { Readable, Writable, pipeline } from 'stream';
import { promisify } from 'util';

async function read(readable: Readable): Promise<string> {
  const buffers: Uint8Array[] | Buffer[] = [];
  for await (const chunk of readable) {
    buffers.push(chunk);
  }
  return Buffer.concat(buffers).toString();
}

describe('$dara form', function () {

  it('getBoundary should ok', function () {
    assert.ok($dara.Form.getBoundary().length > 10);
  });

  it('toFileForm should ok', async function () {
    const result = await read($dara.Form.toFileForm({
      stringkey: 'string'
    }, 'boundary'));
    assert.deepStrictEqual(result, '--boundary\r\n'
        + 'Content-Disposition: form-data; name="stringkey"\r\n\r\n'
        + 'string\r\n'
        + '\r\n'
        + '--boundary--\r\n');
  });

  it('file field should ok', async function () {
    const fileStream = createReadStream(join(__dirname, './fixtures/test.json'));
    const result = await read($dara.Form.toFileForm({
      stringkey: 'string',
      filefield: new $dara.FileField({
        filename: 'fakefilename',
        contentType: 'application/json',
        content: fileStream
      }),
    }, 'boundary'));
    assert.deepStrictEqual(result, '--boundary\r\n'
      + 'Content-Disposition: form-data; name="stringkey"\r\n\r\n'
      + 'string\r\n'
      + '--boundary\r\n'
      + 'Content-Disposition: form-data; name="filefield"; filename="fakefilename"\r\n'
      + 'Content-Type: application/json\r\n'
      + '\r\n'
      + '{"key":"value"}'
      + '\r\n'
      + '--boundary--\r\n');
  });

  it('文件流遵循下游背压，缓冲不随文件大小增长', async function () {
    let produced = 0;
    let consumed = 0;
    let maximumAhead = 0;
    const payload = Buffer.alloc(64 * 1024, 0xff);
    const source = Readable.from((async function* () {
      for (let i = 0; i < 128; i++) {
        produced++;
        maximumAhead = Math.max(maximumAhead, produced - consumed);
        yield payload;
      }
    })());
    const form = $dara.Form.toFileForm({ file: new $dara.FileField({
      filename: 'file.bin', contentType: 'application/octet-stream', content: source,
    }) }, 'boundary');
    await promisify(pipeline)(form, new Writable({ highWaterMark: 1,
      write(chunk, encoding, done) {
        if (chunk.length === payload.length) { consumed++; }
        setTimeout(done, 1);
      },
    }));
    assert.strictEqual(consumed, 128);
    assert.ok(maximumAhead <= 8, '不应提前缓存整个文件: ' + maximumAhead);
  });

  it('文件源错误传递给 multipart 消费方', async function () {
    const error = new Error('测试读取失败');
    const source = new Readable({ read() { this.destroy(error); } });
    await assert.rejects(read($dara.Form.toFileForm({ file: new $dara.FileField({
      filename: 'file.bin', contentType: 'application/octet-stream', content: source,
    }) }, 'boundary')), error);
    assert.strictEqual(source.listenerCount('data'), 0);
    assert.strictEqual(source.listenerCount('end'), 0);
  });

  it('toFormString should ok', function () {
    assert.deepStrictEqual($dara.Form.toFormString({}), '');
    assert.deepStrictEqual($dara.Form.toFormString({ a: 'b c d' }), 'a=b%20c%20d');
  });
});