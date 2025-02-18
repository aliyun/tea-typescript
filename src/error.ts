

import { Request, Response } from './core';
import { RetryPolicyContext } from './retry';

export class BaseError extends Error {
  name: string;
  code: string;

  constructor(map: { [key: string]: any }) {
    super(`${map.code}: ${map.message}`);
    this.name = 'BaseError';
    this.code = map.code;
  }
}

export class ResponseError extends BaseError {
  code: string
  statusCode?: number
  retryAfter?: number
  data?: any
  description?: string
  accessDeniedDetail?: any

  constructor(map: any) {
    super(map);
    this.name = 'ResponseError';
    this.data = map.data;
    this.description = map.description;
    this.retryAfter = map.retryAfter;
    this.accessDeniedDetail = map.accessDeniedDetail;
    if (this.data && this.data.statusCode) {
      this.statusCode = Number(this.data.statusCode);
    } 
  }
}



class UnretryableError extends Error {
  data: any

  constructor(message: string) {
    super(message);
    this.name = 'UnretryableError';
  }
}

class RetryError extends Error {
  retryable: boolean
  data: any

  constructor(message: string) {
    super(message);
    this.name = 'RetryError';
  }
}

export function retryError(request: Request, response: Response): Error {
  const e = new RetryError('');
  e.data = {
    request: request,
    response: response
  };
  return e;
}


export function newError(data: any): ResponseError {
  return new ResponseError(data);
}

export function newUnretryableError(ctx: RetryPolicyContext | Request): Error {
  if(ctx instanceof RetryPolicyContext && ctx.exception) {
    return ctx.exception;
  } else {
    const e = new UnretryableError('');
    e.data = {
      lastRequest: ctx
    };
    return e;
  }
}