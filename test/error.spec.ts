import * as $dara from '../src/index';
import 'mocha';
import assert from 'assert';

describe('$dara error', function () {
  it('init Base Error should be okay', () => {
    const err = new $dara.BaseError({
      code: 'Error',
      message: 'Test Error Message'
    });
    assert.strictEqual(err.name, 'BaseError');
    assert.strictEqual(err.code, 'Error');
    assert.strictEqual(err.message, 'Error: Test Error Message');
  });

  it('retryError should ok', function () {
    const err = $dara.retryError(new $dara.Request(), null);
    assert.strictEqual(err.name, 'RetryError');
  });

  it('newUnretryableError should ok', function () {
    const err = $dara.newUnretryableError(new $dara.RetryPolicyContext({}));
    assert.strictEqual(err.name, 'UnretryableError');
  });

  it('newError should ok', function () {
    let err = $dara.newError({
      code: 'code',
      message: 'message'
    });
    assert.strictEqual(err.message, 'code: message');
    assert.strictEqual(err.code, 'code');
    assert.ok(err.statusCode === undefined);
    assert.ok(err.data === undefined);
    err = $dara.newError({
      code: 'code',
      message: 'message',
      data: {
        statusCode: 200,
        description: 'description'
      },
      description: 'error description',
      accessDeniedDetail: {
        'AuthAction': 'ram:ListUsers',
        'AuthPrincipalType': 'SubUser',
        'PolicyType': 'ResourceGroupLevelIdentityBassdPolicy',
        'NoPermissionType': 'ImplicitDeny'
      }
    });
    assert.strictEqual(err.message, 'code: message');
    assert.strictEqual(err.code, 'code');
    assert.strictEqual(err.statusCode, 200);
    assert.strictEqual(err.data.statusCode, 200);
    assert.strictEqual(err.data.description, 'description');
    assert.strictEqual(err.description, 'error description');
    assert.ok(typeof err.accessDeniedDetail === 'object');
    assert.strictEqual(err.accessDeniedDetail.NoPermissionType, 'ImplicitDeny');
  });
});