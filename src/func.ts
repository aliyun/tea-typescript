
import * as _ from 'lodash';

export function isNull<T>(data: T | null | undefined): data is null | undefined {
  if (typeof data === 'undefined') {
    return true;
  }

  return data === null || data === undefined;
}

export function merge(source: { [key: string]: any }, data: { [key: string]: any }): { [key: string]: any } {
  if (!source && !data) {
    return null;
  }
  return _.merge({}, source, data);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
