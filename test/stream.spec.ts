import * as $dara from '../src/index';
import 'mocha';
import assert from 'assert';
import { Readable } from 'stream';
import * as http from 'http';
import * as httpx from 'httpx';
import { SSEEvent } from '../src/stream';


const server = http.createServer((req, res) => {
  const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
  };
  res.writeHead(200, headers);
  res.flushHeaders();
  let count = 0;
  const timer = setInterval(() => {
    if (count >= 5) {
      clearInterval(timer);
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({count: count})}\nevent: flow\nid: sse-test\nretry: 3\n:heartbeat\n\n`);
    count++;
  }, 100);
});

class MyReadable extends Readable {
  value: Buffer

  constructor(value: Buffer) {
    super();
    this.value = value;
  }

  _read() {
    this.push(this.value);
    this.push(null);
  }
}

describe('$dara stream', function () {

  before((done) => {
    server.listen(8384, done);
  });
    
  after(function (done) {
    this.timeout(20000);
    server.close(done);
  });

  it('readAsJSON', async function () {
    const readable = new MyReadable(Buffer.from(JSON.stringify({ 'a': 'b' })));
    const result = await $dara.Stream.readAsJSON(readable);
    assert.deepStrictEqual(result, { 'a': 'b' });
  });

  it('readAsBytes', async function () {
    const readable = new MyReadable(Buffer.from(JSON.stringify({ 'a': 'b' })));
    const result = await $dara.Stream.readAsBytes(readable);
    assert.deepStrictEqual(result, Buffer.from('{"a":"b"}'));
  });

  it('readAsString', async function () {
    const readable = new MyReadable(Buffer.from(JSON.stringify({ 'a': 'b' })));
    const result = await $dara.Stream.readAsString(readable);
    assert.deepStrictEqual(result, '{"a":"b"}');
  });

  it('readAsSSE', async function () {
    const res = await httpx.request("http://127.0.0.1:8384", {readTimeout: 5000});
    assert.strictEqual(res.statusCode, 200);
    const events: SSEEvent[] = [];
        
    for await (const event of $dara.Stream.readAsSSE(res)) {
          
      events.push(event);
    }
    assert.strictEqual(events.length, 5);
    
    assert.deepStrictEqual([new SSEEvent({
      data: '{"count":0}',
      event: 'flow',
      id: 'sse-test',
      retry: 3,
    }), new SSEEvent({
      data: '{"count":1}',
      event: 'flow',
      id: 'sse-test',
      retry: 3,
    }), new SSEEvent({
      data: '{"count":2}',
      event: 'flow',
      id: 'sse-test',
      retry: 3,
    }), new SSEEvent({
      data: '{"count":3}',
      event: 'flow',
      id: 'sse-test',
      retry: 3,
    }), new SSEEvent({
      data: '{"count":4}',
      event: 'flow',
      id: 'sse-test',
      retry: 3,
    })], events);
  });
});