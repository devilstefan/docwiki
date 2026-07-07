import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';
import type { StorageDriver } from '@docwiki/storage';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE } from '../storage/storage.module';

const MAX_FILENAME_LEN = 180;
/** 预签名 URL 有效期(秒),S3 类驱动使用 */
const SIGNED_URL_TTL = 3600;

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageDriver,
  ) {}

  async upload(spaceId: string, uploaderId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('file field is required (multipart/form-data)');

    // multer latin1 → utf8,处理中文文件名
    const filename = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, MAX_FILENAME_LEN);
    const ext = extname(filename).toLowerCase().slice(0, 16);
    const key = `${spaceId}/${new Date().toISOString().slice(0, 7)}/${randomBytes(8).toString('hex')}${ext}`;

    await this.storage.put(key, file.buffer, {
      filename,
      mimeType: file.mimetype,
      size: file.size,
    });
    const attachment = await this.prisma.attachment.create({
      data: {
        uploaderId,
        spaceId,
        driver: this.storage.name,
        key,
        filename,
        mimeType: file.mimetype,
        size: file.size,
      },
    });
    return this.toDto(attachment);
  }

  async list(spaceId: string) {
    const rows = await this.prisma.attachment.findMany({
      where: { spaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((a) => this.toDto(a));
  }

  async remove(spaceId: string, id: string) {
    const attachment = await this.prisma.attachment.findFirst({ where: { id, spaceId } });
    if (!attachment) throw new NotFoundException('attachment not found');
    await this.storage.delete(attachment.key);
    await this.prisma.attachment.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * 文件读取:id 为不可猜测的 cuid,作为 MVP 的访问控制;
   * S3 类驱动 302 到预签名 URL,local 驱动由服务端流式返回。
   * TODO(M2): 私密空间附件叠加签名校验。
   */
  async resolveForServing(id: string) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException('file not found');
    const signedUrl = await this.storage.getSignedUrl(attachment.key, SIGNED_URL_TTL);
    if (signedUrl) return { redirect: signedUrl, attachment };
    return { stream: await this.storage.get(attachment.key), attachment };
  }

  /** 引用 URL 与 driver 解耦:统一走 /api/files/:id,S3 时服务端再 302 */
  private toDto(a: { id: string; filename: string; mimeType: string; size: number; createdAt: Date }) {
    return {
      id: a.id,
      url: `/api/files/${a.id}`,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt,
    };
  }
}
