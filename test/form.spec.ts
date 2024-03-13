import * as $dara from '../src/index';
import 'mocha';
import assert from 'assert';
import { createReadStream } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';

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

  it('toFormString should ok', function () {
    assert.deepStrictEqual($dara.Form.toFormString({}), '');
    assert.deepStrictEqual($dara.Form.toFormString({ a: 'b c d' }), 'a=b%20c%20d');
  });
});