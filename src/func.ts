
import * as _ from 'lodash';

export function isNull(data: any): boolean{
  if (typeof data === 'undefined') {
    return true;
  }

  if (data === null) {
    return true;
  }

  return false;
}

export function merge(source: {[key: string]: any}, data: {[key: string]: any}): {[key: string]: any}{
  if(!source && !data) {
    return null;
  }
  return _.merge({}, source, data);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
