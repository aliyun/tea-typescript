'use strict';

const http = require('http');
const assert = require('assert');
const url = require('url');

const {
  $send, $read
} = require('../lib/core');

const server = http.createServer((req, res) => {
  const urlObj = url.parse(req.url, true);
  if (urlObj.pathname === '/readTimeout') {
    setTimeout(() => {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Hello world!');
    }, 200);
  } else if (urlObj.pathname === '/timeout') {
    setTimeout(() => {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Hello world!');
    }, 200);
  } else if (urlObj.pathname === '/query') {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(JSON.stringify(urlObj.query));
  } else {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Hello world!');
  }
});

describe('httpx', () => {
  before((done) => {
    server.listen(0, done);
  });

  after(function (done) {
    this.timeout(10000);
    server.close(done);
  });

  it('should ok', async function () {
    var request = {
      pathname: '/',
      port: server.address().port,
      headers: {
        host: '127.0.0.1',
      }
    };

    const res = await $send(request);
    assert.equal(res.statusCode, 200);
    var result = await $read(res, 'utf8');
    assert.equal(result, 'Hello world!');
  });

  it('should ok with port', async function () {
    var request = {
      pathname: '/',
      port: server.address().port,
      headers: {
        host: '127.0.0.1',
      }
    };

    const res = await $send(request);
    assert.equal(res.statusCode, 200);
    var result = await $read(res, 'utf8');
    assert.equal(result, 'Hello world!');
  });

  it('should ok with query', async function () {
    var request = {
      pathname: '/query',
      query: {
        query: 'string'
      },
      port: server.address().port,
      headers: {
        host: '127.0.0.1',
      }
    };

    const res = await $send(request);
    assert.equal(res.statusCode, 200);
    var result = await $read(res, 'utf8');
    assert.equal(result, '{"query":"string"}');
  });

  it('timeout should ok', async function () {
    var request = {
      pathname: '/timeout',
      port: server.address().port,
      headers: {
        host: '127.0.0.1',
      }
    };

    try {
      await $send(request, {timeout: 100});
    } catch (ex) {
      assert.equal(ex.name, 'RequestTimeoutError');
      const port = server.address().port;
      assert.equal(ex.message, `Timeout(100). GET http://127.0.0.1:${port}/timeout failed.`);
      return;
    }

    assert.ok(false, 'should not ok');
  });

  it('timeout should ok', async function () {
    var request = {
      pathname: '/readTimeout',
      port: server.address().port,
      headers: {
        host: '127.0.0.1',
      }
    };

    try {
      await $send(request, { readTimeout: 100, connectTimeout: 50 });
    } catch (ex) {
      assert.equal(ex.name, 'RequestTimeoutError');
      const port = server.address().port;
      assert.equal(ex.message, `Timeout(100). GET http://127.0.0.1:${port}/readTimeout failed.`);
      return;
    }

    assert.ok(false, 'should not ok');
  });
});
