import type { Readable } from 'node:stream';

export interface ObjectMeta {
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * 存储驱动统一接口,按 S3 语义设计。
 * 实现:local(默认)、s3(兼容阿里云 OSS S3 端点 / MinIO / 腾讯 COS / R2)。
 */
export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Readable | Buffer, meta: ObjectMeta): Promise<void>;
  /** 客户端可直接访问的预签名 URL;返回 null 表示该驱动需经服务端流式读取(见 get) */
  getSignedUrl(key: string, ttlSeconds: number): Promise<string | null>;
  /** 服务端流式读取 */
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export { LocalStorageDriver } from './local';
export { S3StorageDriver, type S3DriverConfig } from './s3';
