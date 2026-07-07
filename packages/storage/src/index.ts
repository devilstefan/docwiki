import type { Readable } from 'node:stream';

export interface ObjectMeta {
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * 存储驱动统一接口,按 S3 语义设计。
 * 实现:local(默认)、aliyun-oss、s3(兼容 MinIO/COS/R2)。
 */
export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Readable | Buffer, meta: ObjectMeta): Promise<void>;
  /** 私有读走签名 URL;local 驱动返回由 server 代理的签名路径 */
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface StorageDriverFactory {
  readonly driverName: string;
  create(config: Record<string, string>): StorageDriver;
}
