import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageDriver, S3StorageDriver, type StorageDriver } from '@docwiki/storage';
import { resolve } from 'node:path';

export const STORAGE = Symbol('STORAGE_DRIVER');

@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageDriver => {
        const driver = config.get<string>('STORAGE_DRIVER', 'local');
        if (driver === 's3') {
          return new S3StorageDriver({
            endpoint: config.get('S3_ENDPOINT'),
            region: config.getOrThrow('S3_REGION'),
            bucket: config.getOrThrow('S3_BUCKET'),
            accessKeyId: config.getOrThrow('S3_ACCESS_KEY_ID'),
            secretAccessKey: config.getOrThrow('S3_SECRET_ACCESS_KEY'),
            forcePathStyle: config.get('S3_FORCE_PATH_STYLE') === 'true',
          });
        }
        return new LocalStorageDriver(resolve(config.get('STORAGE_LOCAL_DIR', './uploads')));
      },
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
