import * as fs from 'fs';
import * as util from 'util';
import { Readable, Writable } from 'stream';
import TeaDate from './date';

const exists = util.promisify(fs.exists);
const stat = util.promisify(fs.stat);
const read = util.promisify(fs.read);
const write = util.promisify(fs.write);
const open = util.promisify(fs.open);
const close = util.promisify(fs.close);
export default class TeaFile {
  _path: string
  _stat: fs.Stats
  _fd: number
  _position: number

  constructor(path: string) {
    this._path = path;
    this._position = 0;
  }

  path(): string{
    return this._path;
  }

  async createTime(): Promise<TeaDate>{
    if(!this._stat) {
      this._stat = await stat(this._path);
    }
    return new TeaDate(this._stat.birthtime);
  }

  async modifyTime(): Promise<TeaDate>{
    if(!this._stat) {
      this._stat = await stat(this._path);
    }
    return new TeaDate(this._stat.mtime);
  }

  async length(): Promise<number>{
    if(!this._stat) {
      this._stat = await stat(this._path);
    }
    return this._stat.size;
  }

  async read(size: number): Promise<Buffer> {
    if(!this._fd) {
      this._fd = await open(this._path, 'a+');
    }
    const buf = Buffer.alloc(size);
    const { bytesRead, buffer } = await read(this._fd, buf, 0, size, this._position);
    if(!bytesRead) {
      return null;
    }
    this._position += bytesRead;
    return buffer;
  }

  async write(data: Buffer): Promise<void> {
    if(!this._fd) {
      this._fd = await open(this._path, 'a+');
    }
    
    await write(this._fd, data);
    
    this._stat = await stat(this._path);
    return;
  }

  async close(): Promise<void> {
    if(!this._fd) {
      return;
    }
    await close(this._fd);
    return;
  }

  static async exists(path: string): Promise<boolean> {
    return await exists(path);
  }

  static createReadStream(path: string): Readable {
    return fs.createReadStream(path);
  }

  static createWriteStream(path: string): Writable {
    return fs.createWriteStream(path);
  }
}