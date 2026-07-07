import type { PrismaService } from '../src/prisma/prisma.service';

/** 套件开始前清空数据,保证测试互不依赖执行顺序(按外键依赖顺序删除) */
export async function cleanDatabase(prisma: PrismaService) {
  await prisma.docLink.deleteMany();
  await prisma.editLock.deleteMany();
  await prisma.revision.deleteMany();
  await prisma.document.deleteMany();
  await prisma.node.deleteMany();
  await prisma.spaceMember.deleteMany();
  await prisma.space.deleteMany();
  await prisma.apiToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.user.deleteMany();
}
