import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { DocsService } from './docs.service';
import { SaveContentDto } from './dto/doc.dto';
import { SpaceRoleGuard } from '../spaces/space-role.guard';
import { RequireSpaceRole } from '../spaces/require-space-role.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@Controller('spaces/:spaceId/docs/:nodeId')
@UseGuards(SpaceRoleGuard)
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  @Get()
  @RequireSpaceRole('VIEWER')
  get(@Param('spaceId') spaceId: string, @Param('nodeId') nodeId: string) {
    return this.docs.get(spaceId, nodeId);
  }

  @Put('content')
  @RequireSpaceRole('EDITOR')
  save(
    @Param('spaceId') spaceId: string,
    @Param('nodeId') nodeId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SaveContentDto,
  ) {
    return this.docs.saveContent(spaceId, nodeId, user, dto);
  }

  @Post('lock')
  @RequireSpaceRole('EDITOR')
  acquireLock(@Param('spaceId') spaceId: string, @Param('nodeId') nodeId: string, @CurrentUser() user: AuthUser) {
    return this.docs.acquireLock(spaceId, nodeId, user);
  }

  @Delete('lock')
  @RequireSpaceRole('EDITOR')
  releaseLock(@Param('spaceId') spaceId: string, @Param('nodeId') nodeId: string, @CurrentUser() user: AuthUser) {
    return this.docs.releaseLock(spaceId, nodeId, user);
  }

  @Get('revisions')
  @RequireSpaceRole('VIEWER')
  listRevisions(@Param('spaceId') spaceId: string, @Param('nodeId') nodeId: string) {
    return this.docs.listRevisions(spaceId, nodeId);
  }

  @Get('revisions/:version')
  @RequireSpaceRole('VIEWER')
  getRevision(
    @Param('spaceId') spaceId: string,
    @Param('nodeId') nodeId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.docs.getRevision(spaceId, nodeId, version);
  }

  @Post('revisions/:version/restore')
  @RequireSpaceRole('EDITOR')
  restoreRevision(
    @Param('spaceId') spaceId: string,
    @Param('nodeId') nodeId: string,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.docs.restoreRevision(spaceId, nodeId, version, user);
  }

  @Get('backlinks')
  @RequireSpaceRole('VIEWER')
  backlinks(@Param('spaceId') spaceId: string, @Param('nodeId') nodeId: string) {
    return this.docs.backlinks(spaceId, nodeId);
  }
}
