import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      // 数据库不可用时不阻止进程启动,首个真实查询仍会抛错
      console.warn(`[prisma] database unreachable at startup: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
