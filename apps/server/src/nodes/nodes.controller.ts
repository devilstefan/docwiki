import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { CreateNodeDto, MoveNodeDto, RenameNodeDto } from './dto/node.dto';
import { SpaceRoleGuard } from '../spaces/space-role.guard';
import { RequireSpaceRole } from '../spaces/require-space-role.decorator';

@Controller('spaces/:spaceId')
@UseGuards(SpaceRoleGuard)
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Get('nodes')
  @RequireSpaceRole('VIEWER')
  list(@Param('spaceId') spaceId: string) {
    return this.nodes.list(spaceId);
  }

  @Post('nodes')
  @RequireSpaceRole('EDITOR')
  create(@Param('spaceId') spaceId: string, @Body() dto: CreateNodeDto) {
    return this.nodes.create(spaceId, dto);
  }

  @Patch('nodes/:nodeId')
  @RequireSpaceRole('EDITOR')
  rename(@Param('spaceId') spaceId: string, @Param('nodeId') nodeId: string, @Body() dto: RenameNodeDto) {
    return this.nodes.rename(spaceId, nodeId, dto);
  }

  @Post('nodes/:nodeId/move')
  @RequireSpaceRole('EDITOR')
  move(@Param('spaceId') spaceId: string, @Param('nodeId') nodeId: string, @Body() dto: MoveNodeDto) {
    return this.nodes.move(spaceId, nodeId, dto);
  }

  @Delete('nodes/:nodeId')
  @RequireSpaceRole('EDITOR')
  softDelete(@Param('spaceId') spaceId: string, @Param('nodeId') nodeId: string) {
    return this.nodes.softDelete(spaceId, nodeId);
  }

  @Get('trash')
  @RequireSpaceRole('EDITOR')
  listTrash(@Param('spaceId') spaceId: string) {
    return this.nodes.listTrash(spaceId);
  }

  @Post('nodes/:nodeId/restore')
  @RequireSpaceRole('EDITOR')
  restore(@Param('spaceId') spaceId: string, @Param('nodeId') nodeId: string) {
    return this.nodes.restore(spaceId, nodeId);
  }
}
