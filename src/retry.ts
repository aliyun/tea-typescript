import * as $core from './core';
import * as $error from './error';
const MAX_DELAY_TIME = 120 * 1000;
const MIN_DELAY_TIME = 100;
export class BackoffPolicy{
  policy: string;
  constructor(option: {[key: string]: any}) {
    this.policy = option.policy;
  }

  getDelayTime(ctx: RetryPolicyContext): number{
    throw Error('un-implement');
  }

  static newBackoffPolicy(option: {[key: string]: any}): BackoffPolicy {
    switch(option.policy) {
    case 'Fixed': 
      return new FixedBackoffPolicy(option);
    case 'Random': 
      return new RandomBackoffPolicy(option);
    case 'Exponential': 
      return new ExponentialBackoffPolicy(option);
    case 'EqualJitter':
    case 'ExponentialWithEqualJitter':
      return new EqualJitterBackoffPolicy(option);
    case 'FullJitter':
    case 'ExponentialWithFullJitter':
      return new FullJitterBackoffPolicy(option);
    }
  }
}


class FixedBackoffPolicy extends BackoffPolicy {
  period: number;
  constructor(option: {[key: string]: any}) {
    super(option);
    this.period = option.period;
  }

  getDelayTime(ctx: RetryPolicyContext): number{
    return this.period;
  }
}

class RandomBackoffPolicy extends BackoffPolicy {
  period: number;
  cap: number;
  constructor(option: {[key: string]: any}) {
    super(option);
    this.period = option.period;
    this.cap = option.cap || 20 * 1000;
  }

  getDelayTime(ctx: RetryPolicyContext): number{
    const randomTime =  Math.floor(Math.random() * (ctx.retriesAttempted * this.period));
    if(randomTime > this.cap) {
      return this.cap;
    }
    return randomTime;
  }
}

class ExponentialBackoffPolicy extends BackoffPolicy {
  period: number;
  cap: number;
  constructor(option: {[key: string]: any}) {
    super(option);
    this.period = option.period;
    //default value: 3 days
    this.cap = option.cap || 3 * 24 * 60 * 60 * 1000;
  }

  getDelayTime(ctx: RetryPolicyContext): number{
    const randomTime =  Math.pow(2, ctx.retriesAttempted * this.period);
    if(randomTime > this.cap) {
      return this.cap;
    }
    return randomTime;
  }
}

class EqualJitterBackoffPolicy extends BackoffPolicy {
  period: number;
  cap: number;
  constructor(option: {[key: string]: any}) {
    super(option);
    this.period = option.period;
    //default value: 3 days
    this.cap = option.cap || 3 * 24 * 60 * 60 * 1000;
  }

  getDelayTime(ctx: RetryPolicyContext): number{
    const ceil = Math.min(this.cap, Math.pow(2, ctx.retriesAttempted * this.period));
    return ceil / 2 + Math.floor(Math.random() * (ceil / 2 + 1));
  }
}

class FullJitterBackoffPolicy extends BackoffPolicy {
  period: number;
  cap: number;
  constructor(option: {[key: string]: any}) {
    super(option);
    this.period = option.period;
    //default value: 3 days
    this.cap = option.cap || 3 * 24 * 60 * 60 * 1000;
  }

  getDelayTime(ctx: RetryPolicyContext): number{
    const ceil = Math.min(this.cap, Math.pow(2, ctx.retriesAttempted * this.period));
    return Math.floor(Math.random() * ceil);
  }
}


export class RetryCondition {
  maxAttempts: number;
  backoff: BackoffPolicy;
  exception: string[];
  errorCode: string[];
  maxDelay: number;
  constructor(condition: {[key: string]: any}) {
    this.maxAttempts = condition.maxAttempts;
    this.backoff = condition.backoff && BackoffPolicy.newBackoffPolicy(condition.backoff);
    this.exception = condition.exception;
    this.errorCode = condition.errorCode;
    this.maxDelay = condition.maxDelay;
  }
}


export class RetryOptions {
  retryable: boolean;
  retryCondition: RetryCondition[];
  noRetryCondition: RetryCondition[];
  constructor(options: {[key: string]: any}) {
    this.retryable = options.retryable;
    this.retryCondition = (options.retryCondition || []).map((condition: { [key: string]: any; }) => {
      return new RetryCondition(condition);
    });

    this.noRetryCondition = (options.noRetryCondition || []).map((condition: { [key: string]: any; }) => {
      return new RetryCondition(condition);
    });
  }
}

export class RetryPolicyContext {
  key: string;
  retriesAttempted: number;
  httpRequest: $core.Request;
  httpResponse: $core.Response;
  exception: $error.ResponseError | $error.BaseError;
  constructor(options: {[key: string]: any}) {
    this.key = options.key;
    this.retriesAttempted = options.retriesAttempted || 0;
    this.httpRequest = options.httpRequest || null;
    this.httpResponse = options.httpResponse || null;
    this.exception = options.exception || null;
  }
}

export function shouldRetry(options: RetryOptions, ctx: RetryPolicyContext): boolean {
  if(ctx.retriesAttempted === 0) {
    return true;
  }
  if(!options || !options.retryable) {
    return false;
  }
  const retriesAttempted = ctx.retriesAttempted;
  const ex = ctx.exception;
  let conditions = options.noRetryCondition;
  for(let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    if(condition.exception.includes(ex.name) || condition.errorCode.includes(ex.code)) {
      return false;
    }
  }
  conditions = options.retryCondition;
  for(let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    if(!condition.exception.includes(ex.name) && !condition.errorCode.includes(ex.code)) {
      continue;
    }
    if(retriesAttempted >= condition.maxAttempts) {
      return false;
    }
    return true;
  }
  return false;
}

export function getBackoffDelay(options: RetryOptions, ctx: RetryPolicyContext): number {
  const ex = ctx.exception;
  const conditions = options.retryCondition;
  for(let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    if(!condition.exception.includes(ex.name) && !condition.errorCode.includes(ex.code)) {
      continue;
    }
    const maxDelay = condition.maxDelay || MAX_DELAY_TIME;
    const retryAfter = (ctx.exception as $error.ResponseError).retryAfter;
    if(retryAfter !== undefined) {
      return Math.min(retryAfter, maxDelay);
    }

    if(!condition.backoff) {
      return MIN_DELAY_TIME;
    }
    return Math.min(condition.backoff.getDelayTime(ctx), maxDelay);
  }
  return MIN_DELAY_TIME;
}