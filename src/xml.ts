// This file is auto-generated, don't edit it
import { Parser, Builder } from 'xml2js';

export default class TeaXML {

  static parseXml<T>(body: string, response: T): { [key: string]: any } {
    let ret: { [key: string]: any } = this._parseXML(body);
    if (response !== null && typeof response !== 'undefined') {
      ret = this._xmlCast(ret, response);
    }
    return ret;
  }

  static toXML(body: { [key: string]: any }): string {
    const builder = new Builder();
    return builder.buildObject(body);
  }

  static _parseXML(body: string): any {
    const parser = new Parser({ explicitArray: false });
    const result: { [key: string]: any } = {};
    parser.parseString(body, function (err: any, output: any) {
      result.err = err;
      result.output = output;
    });
    if (result.err) {
      throw result.err;
    }

    return result.output;
  }

  static _xmlCast<T>(obj: any, clazz: T): { [key: string]: any } {
    obj = obj || {};
    const ret: { [key: string]: any } = {};
    const clz = clazz as any;
    const names: { [key: string]: string } = clz.names();
    const types: { [key: string]: any } = clz.types();

    Object.keys(names).forEach((key) => {
      const originName = names[key];
      let value = obj[originName];
      const type = types[key];
      switch (type) {
      case 'boolean':
        if (!value) {
          ret[originName] = false;
          return;
        }
        ret[originName] = value === 'false' ? false : true;
        return;
      case 'number':
        if (value != 0 && !value) {
          ret[originName] = NaN;
          return;
        }
        ret[originName] = +value;
        return;
      case 'string':
        if (!value) {
          ret[originName] = '';
          return;
        }
        ret[originName] = value.toString();
        return;
      default:
        if (type.type === 'array') {
          if (!value) {
            ret[originName] = [];
            return;
          }
          if (!Array.isArray(value)) {
            value = [value];
          }
          if (typeof type.itemType === 'function') {
            ret[originName] = value.map((d: any) => {
              return this._xmlCast(d, type.itemType);
            });
          } else {
            ret[originName] = value;
          }
        } else if (typeof type === 'function') {
          if (!value) {
            value = {}
          }
          ret[originName] = this._xmlCast(value, type);
        } else {
          ret[originName] = value;
        }
      }
    })
    return ret;
  }

}