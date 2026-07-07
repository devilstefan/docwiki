import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { SpaceRoleGuard } from '../spaces/space-role.guard';
import { RequireSpaceRole } from '../spaces/require-space-role.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

@Controller('spaces/:spaceId/attachments')
@UseGuards(SpaceRoleGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post()
  @RequireSpaceRole('EDITOR')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.attachments.upload(spaceId, user.id, file);
  }

  @Get()
  @RequireSpaceRole('VIEWER')
  list(@Param('spaceId') spaceId: string) {
    return this.attachments.list(spaceId);
  }

  @Delete(':id')
  @RequireSpaceRole('EDITOR')
  remove(@Param('spaceId') spaceId: string, @Param('id') id: string) {
    return this.attachments.remove(spaceId, id);
  }
}

/** 文件读取:URL 即凭证(不可猜测 id),供 <img> 等无法带 Authorization 头的场景使用 */
@Controller('files')
export class FilesController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Public()
  @Get(':id')
  async serve(@Param('id') id: string, @Res() res: Response) {
    const { redirect, stream, attachment } = await this.attachments.resolveForServing(id);
    if (redirect) return res.redirect(302, redirect);

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', attachment.size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    // SVG 内联渲染有 XSS 风险,强制下载
    const isSvg = attachment.mimeType.includes('svg');
    const disposition = attachment.mimeType.startsWith('image/') && !isSvg ? 'inline' : 'attachment';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
    );
    stream!.pipe(res);
  }
}
