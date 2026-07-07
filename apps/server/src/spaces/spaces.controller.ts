import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SpacesService } from './spaces.service';
import { CreateSpaceDto, UpdateSpaceDto, AddMemberDto, UpdateMemberDto } from './dto/space.dto';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { SpaceRoleGuard } from './space-role.guard';
import { RequireSpaceRole } from './require-space-role.decorator';

@Controller('spaces')
@UseGuards(SpaceRoleGuard)
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSpaceDto) {
    return this.spaces.create(user.id, dto);
  }

  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.spaces.listMine(user.id);
  }

  @Get(':spaceId')
  get(@CurrentUser() user: AuthUser, @Param('spaceId') spaceId: string) {
    return this.spaces.getVisible(user.id, spaceId);
  }

  @Patch(':spaceId')
  @RequireSpaceRole('ADMIN')
  update(@Param('spaceId') spaceId: string, @Body() dto: UpdateSpaceDto) {
    return this.spaces.update(spaceId, dto);
  }

  @Delete(':spaceId')
  @RequireSpaceRole('OWNER')
  archive(@Param('spaceId') spaceId: string) {
    return this.spaces.archive(spaceId);
  }

  @Get(':spaceId/members')
  @RequireSpaceRole('VIEWER')
  listMembers(@Param('spaceId') spaceId: string) {
    return this.spaces.listMembers(spaceId);
  }

  @Post(':spaceId/members')
  @RequireSpaceRole('ADMIN')
  addMember(@Param('spaceId') spaceId: string, @Body() dto: AddMemberDto) {
    return this.spaces.addMember(spaceId, dto);
  }

  @Patch(':spaceId/members/:userId')
  @RequireSpaceRole('ADMIN')
  updateMember(@Param('spaceId') spaceId: string, @Param('userId') userId: string, @Body() dto: UpdateMemberDto) {
    return this.spaces.updateMember(spaceId, userId, dto);
  }

  @Delete(':spaceId/members/:userId')
  @RequireSpaceRole('ADMIN')
  removeMember(@Param('spaceId') spaceId: string, @Param('userId') userId: string) {
    return this.spaces.removeMember(spaceId, userId);
  }
}
