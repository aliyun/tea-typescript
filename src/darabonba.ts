
export function isUnset(value: any): boolean {
    if (typeof value === 'undefined') {
        return true;
    }
    if (value == null) {
        return true;
    }
    return false;
}

export function setToMap(map: {[key: string]: any}, key: string, value: any) {
    if (isUnset(value)) {
        return;
    }
    map[key] = value;
}

export function mapify(value: any): any {
    // null, undefined
    if (isUnset(value)) {
        return value;
    }

    // Model
    if (value instanceof Model) {
        return value.toMap();
    }

    // 如果是另一个版本的 tea-typescript 创建的 model，instanceof 会判断不通过
    // 这里做一下处理
    if (typeof value.toMap === 'function') {
        return value.toMap();
    }

    // array
    if (Array.isArray(value)) {
        return value.map((item) => {
            return mapify(item);
        });
    }

    // map
    if (typeof value === 'object') {
        let map: {[key: string]: any} = {};
        for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                map[key] = mapify(value[key]);
            }
        }
        return map;
    }

    return value;
}

export function push<T>(list: T[], item: T): T[] {
    list.push(item);
    return list;
}

export function newError(data: any): Error {
    let message = `${data.code}: ${data.message}`;
    return new Error(message);
}

export function toMap(value: any = undefined): any {
    if (typeof value === 'undefined' || value == null) {
        return null;
    }

    if (value instanceof Model) {
        return value.toMap();
    }

    // 如果是另一个版本的 tea-typescript 创建的 model，instanceof 会判断不通过
    // 这里做一下处理
    if (typeof value.toMap === 'function') {
        return value.toMap();
    }

    if (Array.isArray(value)) {
        return value.map((item) => {
            return toMap(item);
        })
    }

    return value;
}

export class Model {
    toMap(): { [key: string]: any} {
        throw new Error("sub-class of Model should implement toMap() method");
    }
}
