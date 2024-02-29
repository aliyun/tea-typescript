import * as url from 'url';

type DATE_TYPE = string | Date | moment.Moment

const portMap: { [key: string]: string } = {
  ftp: '21',
  gopher: '70',
  http: '80',
  https: '443',
  ws: '80',
  wss: '443',
};

export default class TeaURL {
  _url: url.URL

  constructor(str: string) {
    this._url = new url.URL(str);
  }

  path(): string {
    return this._url.pathname + this._url.search;
  }

  pathname(): string {
    return this._url.pathname;
  }

  protocol(): string {
    return this._url.protocol ? this._url.protocol.replace(':', '') : '';
  }

  hostname(): string {
    return this._url.hostname;
  }

  host(): string {
    return this._url.host;
  }

  port(): string {
    return this._url.port || portMap[this.protocol()];
  }

  hash(): string {
    return this._url.hash ? this._url.hash.replace('#', '') : '';
  }

  search(): string {
    return this._url.search ? this._url.search.replace('?', '') : '';
  }

  href(): string {
    return this._url.href;
  }

  auth(): string {
    return `${this._url.username}:${this._url.password}`;
  }

  static parse(url: string): TeaURL {
    return new TeaURL(url);
  }

  static urlEncode(url: string): string {
    return url != null ? encodeURIComponent(url) : '';
  }

  static percentEncode(raw: string): string {
    return raw != null ? encodeURIComponent(raw).replace('+', '%20')
      .replace('*', '%2A').replace('%7E', '~') : null;
  }

  static pathEncode(path: string): string {
    if (!path || path === '/') {
      return path;
    }
    const paths = path.split('/');
    const sb = [];
    for (const s of paths) {
      sb.push(TeaURL.percentEncode(s));
    }
    return sb.join('/');
  }
}