import * as $dara from '../src/index';
import 'mocha';
import assert from 'assert';
import moment from 'moment';

describe('$dara retry', function () {
  class AErr extends $dara.BaseError {

    constructor(map: { [key: string]: any }) {
      super(map);
      this.name = 'AErr';
    }
  }

  class BErr extends $dara.BaseError {

    constructor(map: { [key: string]: any }) {
      super(map);
      this.name = 'BErr';
    }
  }

  class CErr extends $dara.ResponseError {

    constructor(map: { [key: string]: any }) {
      super(map);
      this.name = 'BErr';
    }
  }

  it('init base backoff policy should not okay', function() {
    try {
      const err = new $dara.BackoffPolicy({});
      const context = new $dara.RetryPolicyContext({
        retriesAttempted: 3,
        exception: new AErr({
          code: 'A1Err',
          message: 'a1 error',
        })
      });
      err.getDelayTime(context);
    } catch(err) {
      assert.deepStrictEqual(err.message, 'un-implement')
    }
  });

  it('shouldRetry should ok', function () {
    let context = new $dara.RetryPolicyContext({
      retriesAttempted: 3,
    });
    assert.deepStrictEqual($dara.shouldRetry(undefined, context), false);
    assert.deepStrictEqual($dara.shouldRetry(null, context), false);

    context = new $dara.RetryPolicyContext({
      retriesAttempted: 0,
    });
    assert.deepStrictEqual($dara.shouldRetry(undefined, context), true);

    const condition1 = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['AErr'],
      errorCode: ['A1Err']
    });
    let option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition1]
    });

    context = new $dara.RetryPolicyContext({
      retriesAttempted: 3,
      exception: new AErr({
        code: 'A1Err',
        message: 'a1 error',
      })
    });
    assert.deepStrictEqual($dara.shouldRetry(option, context), false);

    option = new $dara.RetryOptions({
      retryable: true,
    });
    assert.deepStrictEqual($dara.shouldRetry(option, context), false);

    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition1]
    });
    context = new $dara.RetryPolicyContext({
      retriesAttempted: 2,
      exception: new AErr({
        code: 'A1Err',
        message: 'a1 error',
      })
    });
    assert.deepStrictEqual($dara.shouldRetry(option, context), true);
    context = new $dara.RetryPolicyContext({
      retriesAttempted: 2,
      exception: new AErr({
        code: 'B1Err',
        message: 'b1 error',
      })
    });
    assert.deepStrictEqual($dara.shouldRetry(option, context), true);
    context = new $dara.RetryPolicyContext({
      retriesAttempted: 2,
      exception: new BErr({
        code: 'B1Err',
        message: 'b1 error',
      })
    });
    assert.deepStrictEqual($dara.shouldRetry(option, context), false);
    context = new $dara.RetryPolicyContext({
      retriesAttempted: 2,
      exception: new BErr({
        code: 'A1Err',
        message: 'b1 error',
      })
    });
    assert.deepStrictEqual($dara.shouldRetry(option, context), true);
    const condition2 = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['BErr'],
      errorCode: ['B1Err']
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition2],
      noRetryCondition: [condition2]
    });
    context = new $dara.RetryPolicyContext({
      retriesAttempted: 2,
      exception: new AErr({
        code: 'B1Err',
        message: 'b1 error',
      })
    });
    assert.deepStrictEqual($dara.shouldRetry(option, context), false);

    context = new $dara.RetryPolicyContext({
      retriesAttempted: 2,
      exception: new BErr({
        code: 'A1Err',
        message: 'a1 error',
      })
    });
    assert.deepStrictEqual($dara.shouldRetry(option, context), false);
    context = new $dara.RetryPolicyContext({
      retriesAttempted: 1,
      exception: new BErr({
        code: 'A1Err',
        message: 'b1 error',
      })
    });
    assert.deepStrictEqual($dara.shouldRetry(option, context), false);
  });

  it('getBackoffDelay should ok', async function () {
    const condition = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['AErr'],
      errorCode: ['A1Err'],
    });
    let option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition]
    });

    let context = new $dara.RetryPolicyContext({
      retriesAttempted: 2,
      exception: new AErr({
        code: 'A1Err',
        message: 'a1 error',
      })
    });
    
    assert.deepStrictEqual($dara.getBackoffDelay(option, context), 100);

    context = new $dara.RetryPolicyContext({
      retriesAttempted: 2,
      exception: new BErr({
        code: 'B1Err',
        message: 'a1 error',
      })
    });
    
    assert.deepStrictEqual($dara.getBackoffDelay(option, context), 100);

    const fixedPolicy = $dara.BackoffPolicy.newBackoffPolicy({
      policy: 'Fixed',
      period: 1000,
    });
    const condition1 = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['AErr'],
      errorCode: ['A1Err'],
      backoff: fixedPolicy, 
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition1]
    });
    context = new $dara.RetryPolicyContext({
      retriesAttempted: 2,
      exception: new AErr({
        code: 'A1Err',
        message: 'a1 error',
      })
    });

    
    assert.deepStrictEqual($dara.getBackoffDelay(option, context), 1000);

    const randomPolicy = $dara.BackoffPolicy.newBackoffPolicy({
      policy: 'Random',
      period: 1000,
      cap: 10000,
    });

    const condition2 = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['AErr'],
      errorCode: ['A1Err'],
      backoff: randomPolicy, 
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition2]
    });

    assert.ok($dara.getBackoffDelay(option, context) < 10000);

    const randomPolicy2 = $dara.BackoffPolicy.newBackoffPolicy({
      policy: 'Random',
      period: 10000,
      cap: 10,
    });

    const condition2Other = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['AErr'],
      errorCode: ['A1Err'],
      backoff: randomPolicy2, 
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition2Other]
    });

    assert.deepStrictEqual($dara.getBackoffDelay(option, context), 10);


    let exponentialPolicy = $dara.BackoffPolicy.newBackoffPolicy({
      policy: 'Exponential',
      period: 5,
      cap: 10000,
    });

    const condition3 = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['AErr'],
      errorCode: ['A1Err'],
      backoff: exponentialPolicy, 
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition3]
    });

    assert.deepStrictEqual($dara.getBackoffDelay(option, context), 1024);

    exponentialPolicy = $dara.BackoffPolicy.newBackoffPolicy({
      policy: 'Exponential',
      period: 10,
      cap: 10000,
    });

    const condition4 = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['AErr'],
      errorCode: ['A1Err'],
      backoff: exponentialPolicy, 
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition4]
    });

    assert.deepStrictEqual($dara.getBackoffDelay(option, context), 10000);

    let equalJitterPolicy = $dara.BackoffPolicy.newBackoffPolicy({
      policy: 'EqualJitter',
      period: 5,
      cap: 10000,
    });

    const condition5 = new $dara.RetryCondition({
      maxAttempts: 2,
      exception: ['AErr'],
      errorCode: ['A1Err'],
      backoff: equalJitterPolicy, 
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition5]
    });
    let backoffTime = $dara.getBackoffDelay(option, context)
    assert.ok(backoffTime > 512 && backoffTime < 1024);

    equalJitterPolicy = $dara.BackoffPolicy.newBackoffPolicy({
      policy: 'EqualJitter',
      period: 10,
      cap: 10000,
    });

    const condition6 = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['AErr'],
      errorCode: ['A1Err'],
      backoff: equalJitterPolicy, 
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition6]
    });
    backoffTime = $dara.getBackoffDelay(option, context)
    assert.ok(backoffTime > 5000 && backoffTime < 10000);


    let fullJitterPolicy = $dara.BackoffPolicy.newBackoffPolicy({
      policy: 'fullJitter',
      period: 5,
      cap: 10000,
    });

    const condition7 = new $dara.RetryCondition({
      maxAttempts: 2,
      exception: ['AErr'],
      errorCode: ['A1Err'],
      backoff: fullJitterPolicy, 
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition7]
    });
    backoffTime = $dara.getBackoffDelay(option, context)
    assert.ok(backoffTime >= 0 && backoffTime < 1024);

    fullJitterPolicy = $dara.BackoffPolicy.newBackoffPolicy({
      policy: 'ExponentialWithFullJitter',
      period: 10,
      cap: 10000,
    });

    const condition8 = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['AErr'],
      errorCode: ['A1Err'],
      backoff: fullJitterPolicy, 
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition8]
    });
    backoffTime = $dara.getBackoffDelay(option, context)
    assert.ok(backoffTime >= 0 && backoffTime < 10000);

    const condition9 = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['AErr'],
      errorCode: ['A1Err'],
      backoff: fullJitterPolicy, 
      maxDelay: 1000,
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition9]
    });
    backoffTime = $dara.getBackoffDelay(option, context)
    assert.ok(backoffTime >= 0 && backoffTime <= 1000);


    fullJitterPolicy = $dara.BackoffPolicy.newBackoffPolicy({
      policy: 'ExponentialWithFullJitter',
      period: 100,
      cap: 10000 * 10000,
    });

    const condition12 = new $dara.RetryCondition({
      maxAttempts: 2,
      exception: ['AErr'],
      errorCode: ['A1Err'],
      backoff: fullJitterPolicy,
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition12]
    });
    backoffTime = $dara.getBackoffDelay(option, context);
    assert.ok(backoffTime >= 0 && backoffTime <= 120 * 1000);

    context = new $dara.RetryPolicyContext({
      retriesAttempted: 2,
      exception: new CErr({
        code: 'CErr',
        message: 'c error',
        retryAfter: 3000
      })
    });
    const condition10 = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['CErr'],
      errorCode: ['CErr'],
      backoff: fullJitterPolicy, 
      maxDelay: 5000,
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition10]
    });
    backoffTime = $dara.getBackoffDelay(option, context)
    assert.strictEqual(backoffTime, 3000);

    const condition11 = new $dara.RetryCondition({
      maxAttempts: 3,
      exception: ['CErr'],
      errorCode: ['CErr'],
      backoff: fullJitterPolicy, 
      maxDelay: 1000,
    });
    option = new $dara.RetryOptions({
      retryable: true,
      retryCondition: [condition11]
    });
    backoffTime = $dara.getBackoffDelay(option, context)
    assert.strictEqual(backoffTime, 1000);

  
    
  });


  
});