import { Readable } from 'stream';
import { stringify } from 'querystring';

export class FileFormStream extends Readable {
  form: { [key: string]: any };
  boundary: string;
  keys: string[];
  index: number;
  streaming: boolean;
  private activeContent?: Readable;
  private detachContent?: () => void;

  constructor(form: { [key: string]: any }, boundary: string) {
    super();
    this.form = form;
    this.keys = Object.keys(form);
    this.index = 0;
    this.boundary = boundary;
    this.streaming = false;
  }

  _read() {
    if (this.streaming) {
      // 仅在下游继续读取时恢复文件源，避免慢速上传或落盘时缓存整个文件。
      this.activeContent.resume();
      return;
    }

    const separator = this.boundary;
    if (this.index < this.keys.length) {
      const name = this.keys[this.index];
      const fieldValue = this.form[name];
      if (typeof fieldValue.filename === 'string' &&
        typeof fieldValue.contentType === 'string' &&
        fieldValue.content instanceof Readable) {
        const body =
          `--${separator}\r\n` +
          `Content-Disposition: form-data; name="${name}"; filename="${fieldValue.filename}"\r\n` +
          `Content-Type: ${fieldValue.contentType}\r\n\r\n`;
        this.push(Buffer.from(body));
        this.streaming = true;
        const content: Readable = fieldValue.content;
        this.activeContent = content;
        const onData = (chunk: any) => {
          if (!this.push(chunk)) { content.pause(); }
        };
        const onError = (error: Error) => { this.destroy(error); };
        const onEnd = () => {
          this.detachContent();
          this.detachContent = undefined;
          this.activeContent = undefined;
          this.index++;
          this.streaming = false;
          this.push('');
        };
        this.detachContent = () => {
          content.removeListener('data', onData);
          content.removeListener('error', onError);
          content.removeListener('end', onEnd);
        };
        content.on('data', onData);
        content.once('error', onError);
        content.once('end', onEnd);
      } else {
        this.push(Buffer.from(`--${separator}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
          `${fieldValue}\r\n`));
        this.index++;
      }
    } else {
      this.push(Buffer.from(`\r\n--${separator}--\r\n`));
      this.push(null);
    }
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    if (this.detachContent) { this.detachContent(); }
    if (this.activeContent) { this.activeContent.destroy(); }
    this.activeContent = undefined;
    this.detachContent = undefined;
    callback(error);
  }
}

export default class Form {

  static getBoundary(): string {
    return 'boundary' + Math.random().toString(16).slice(-12);
  }

  static toFileForm(form: { [key: string]: any }, boundary: string): Readable {
    return new FileFormStream(form, boundary);
  }

  static toFormString(data: { [key: string]: any }) {
    return stringify(data);
  }

}