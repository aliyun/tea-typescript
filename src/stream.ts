import { Readable } from 'stream';

const DATA_PREFIX = 'data:';
const EVENT_PREFIX = 'event:';
const ID_PREFIX = 'id:';
const RETRY_PREFIX = 'retry:';

function isDigitsOnly(str: string) {
  for (let i = 0; i < str.length; i++) {
    const c = str.charAt(i);
    if (c < '0' || c > '9') {
      return false;
    }
  }
  return str.length > 0;
}

export class SSEEvent {
  data?: string;
  id?: string;
  event?: string;
  retry?: number;

  constructor(data: { [key: string]: any } = {}) {
    this.data = data.data;
    this.id = data.id;
    this.event = data.event;
    this.retry = data.retry;
  }
}


function read(readable: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let onData: { (chunk: any): void; (buf: Buffer): void; (chunk: any): void; },
      onError: { (err: Error): void; (err: Error): void; (err: Error): void; },
      onEnd: { (): void; (): void; (): void; };
    const cleanup = function () {
      // cleanup
      readable.removeListener('error', onError);
      readable.removeListener('data', onData);
      readable.removeListener('end', onEnd);
    };

    const bufs: Uint8Array[] | Buffer[] = [];
    let size = 0;

    onData = function (buf: Buffer) {
      bufs.push(buf);
      size += buf.length;
    };

    onError = function (err: Error) {
      cleanup();
      reject(err);
    };

    onEnd = function () {
      cleanup();
      resolve(Buffer.concat(bufs, size));
    };

    readable.on('error', onError);
    readable.on('data', onData);
    readable.on('end', onEnd);
  });
}



function readyToRead(readable: Readable) {
  return new Promise((resolve, reject) => {
    let onReadable: { (): void; (): void; (): void; },
      onEnd: { (): void; (): void; (): void; },
      onError: { (err: Error): void; (err: any): void; (err: Error): void; };
    const cleanup = function () {
      // cleanup
      readable.removeListener('error', onError);
      readable.removeListener('end', onEnd);
      readable.removeListener('readable', onReadable);
    };

    onReadable = function () {
      cleanup();
      resolve(false);
    };

    onEnd = function () {
      cleanup();
      resolve(true);
    };

    onError = function (err) {
      cleanup();
      reject(err);
    };

    readable.once('readable', onReadable);
    readable.once('end', onEnd);
    readable.once('error', onError);
  });
}

interface EventResult {
  events: SSEEvent[];
  remain: string;
}

function tryGetEvents(head: string, chunk: string): EventResult {
  const all = head + chunk;
  let start = 0;
  const events = [];
  for (let i = 0; i < all.length - 1; i++) {
    const c = all[i];
    const c2 = all[i + 1];
    if (c === '\n' && c2 === '\n') {
      const part = all.substring(start, i);
      const lines = part.split('\n');
      const event = new SSEEvent();
      lines.forEach((line: string) => {
        if (line.startsWith(DATA_PREFIX)) {
          event.data = line.substring(DATA_PREFIX.length).trim();
        } else if (line.startsWith(EVENT_PREFIX)) {
          event.event = line.substring(EVENT_PREFIX.length).trim();
        } else if (line.startsWith(ID_PREFIX)) {
          event.id = line.substring(ID_PREFIX.length).trim();
        } else if (line.startsWith(RETRY_PREFIX)) {
          const retry = line.substring(RETRY_PREFIX.length).trim();
          if (isDigitsOnly(retry)) {
            event.retry = parseInt(retry, 10);
          }
        } else if (line.startsWith(':')) {
          // ignore the line
        }
      });
      events.push(event);
      start = i + 2;
    }
  }

  const remain = all.substring(start);
  return { events, remain };
}


export default class TeaStream {

  static async readAsBytes(stream: Readable): Promise<Buffer> {
    return await read(stream);
  }

  static async readAsString(stream: Readable): Promise<string> {
    const buff = await TeaStream.readAsBytes(stream);
    return buff.toString();
  }

  static async readAsJSON(stream: Readable): Promise<any> {
    const str = await TeaStream.readAsString(stream);
    return JSON.parse(str);
  }

  static async *readAsSSE(stream: Readable): AsyncGenerator<SSEEvent> {
    let rest = '';
    while (true) {
      const ended = await readyToRead(stream);
      if (ended) {
        return;
      }

      let chunk;
      while (null !== (chunk = stream.read())) {
        const { events, remain } = tryGetEvents(rest, chunk.toString());
        rest = remain;
        if (events && events.length > 0) {
          for (const event of events) {
            yield event;
          }
        }
      }
    }
  }
}