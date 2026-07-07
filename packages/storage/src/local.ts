import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, unlink } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { ObjectMeta, StorageDriver } from './index';

/** 本地磁盘驱动:读取经由服务端流式返回(getSignedUrl 恒为 null) */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';

  constructor(private readonly baseDir: string) {}

  async put(key: string, body: Readable | Buffer, _meta: ObjectMeta): Promise<void> {
    const filePath = this.resolve(key);
    await mkdir(dirname(filePath), { recursive: true });
    const source = Buffer.isBuffer(body) ? Readable.from(body) : body;
    await pipeline(source, createWriteStream(filePath));
  }

  async getSignedUrl(): Promise<null> {
    return null;
  }

  async get(key: string): Promise<Readable> {
    return createReadStream(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }

  async exists(key: string): Promise<boolean> {
    return access(this.resolve(key)).then(
      () => true,
      () => false,
    );
  }

  /** 防路径穿越:解析后必须仍在 baseDir 内 */
  private resolve(key: string): string {
    const filePath = normalize(join(this.baseDir, key));
    if (!filePath.startsWith(normalize(this.baseDir) + sep)) {
      throw new Error(`invalid storage key: ${key}`);
    }
    return filePath;
  }
}
