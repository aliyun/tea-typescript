'use strict';

const querystring = require('querystring');

const httpx = require('httpx');

function filter(object) {
  if (typeof object === 'object') {
    const result = {};
    Object.keys(object).forEach((key) => {
      var value = object[key];
      if (value !== '' && value !== null && value !== undefined) {
        result[key] = value;
      }
    });
    return result;
  }

  return object;
}

/**
 * Send request
 * @param {Request} request the request object
 * @return {Promise<Response>} the Promise with response object
 */
exports.$send = function (request, runtime = {}) {
  const protocol = request.protocol || 'http';
  const headers = filter(request.headers || {});
  const hostname = headers.host;
  const port = request.port;
  const pathname = request.pathname;
  const query = filter(request.query);

  var url = `${protocol}://${hostname}`;
  if (port) {
    url += `:${port}`;
  }
  url += `${pathname}`;

  if (query && Object.keys(query).length > 0) {
    url += `?${querystring.stringify(query)}`;
  }

  const opts = {
    method: request.method || 'GET',
    headers: headers,
    data: request.body
  };

  if (typeof runtime.timeout !== 'undefined') {
    opts.timeout = Number(runtime.timeout);
  }

  if (typeof runtime.ignoreSSL !== 'undefined') {
    opts.rejectUnauthorized = !!runtime.ignoreSSL;
  }

  return httpx.request(url, opts);
};

/**
 * Read content from readable Response
 * @param {Response} response the response object
 * @param {String} encoding the request object
 * @return {Promise<String|Buffer>} the Promise with response content
 */
exports.$read = function (response, encoding) {
  return httpx.read(response, encoding);
};

exports.$allowRetry = function (retry, retryTimes, startTime) {
  // 还未重试
  if (retryTimes === 0) {
    return true;
  }

  if (retry.retryable !== true) {
    return false;
  }

  if (retry.policy === 'never') {
    return false;
  }

  if (retry.policy === 'always') {
    return true;
  }

  if (retry.policy === 'simple') {
    return (retryTimes < retry['max-attempts']);
  }

  if (retry.policy === 'timeout') {
    return Date.now() - startTime < retry.timeout;
  }

  // 默认不重试
  return false;
};

exports.$getBackoffTime = function (backoff, retryTimes) {
  if (retryTimes === 0) {
    // 首次调用，不使用退避策略
    return 0;
  }

  if (backoff.policy === 'no') {
    // 不退避
    return 0;
  }

  if (backoff.policy === 'fixed') {
    // 固定退避
    return backoff.period;
  }

  if (backoff.policy === 'random') {
    // 随机退避
    let min = backoff['min-period'];
    let max = backoff['max-period'];
    return min + (max - min) * Math.random();
  }

  if (backoff.policy === 'exponential') {
    // 指数退避
    let init = backoff.initial;
    let max = backoff.max;
    let multiplier = backoff.multiplier;
    let time = init * Math.pow(1 + multiplier, retryTimes - 1);
    return Math.min(time, max);
  }

  if (backoff.policy === 'exponential_random') {
    // 指数随机退避
    let init = backoff.initial;
    let max = backoff.max;
    let multiplier = backoff.multiplier;
    let time = init * Math.pow(1 + multiplier, retryTimes - 1);
    return Math.min(time, max) * (1 + Math.random() * (multiplier - 1));
  }

  return 0;
};

exports.$sleep = function (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

exports.$retryError = function (request, response) {
  var e = new Error();
  e.name = 'RetryError';
  e.retryable = true;
  e.data = {
    request: request,
    response: response
  };
  return e;
};

exports.$unableRetryError = function (request) {
  var e = new Error();
  e.name = 'UnableRetryError';
  e.data = {
    lastRequest: request
  };
  return e;
};
