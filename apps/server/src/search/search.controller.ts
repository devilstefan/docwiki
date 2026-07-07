import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { SpaceRoleGuard } from '../spaces/space-role.guard';
import { RequireSpaceRole } from '../spaces/require-space-role.decorator';

@Controller('spaces/:spaceId/search')
@UseGuards(SpaceRoleGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @RequireSpaceRole('VIEWER')
  run(@Param('spaceId') spaceId: string, @Query('q') q = '') {
    return this.search.search(spaceId, q);
  }
}
