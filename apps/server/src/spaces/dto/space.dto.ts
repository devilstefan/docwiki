import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { SPACE_ROLES, type SpaceRole } from '@docwiki/shared';

/** 可通过成员管理赋予的角色(OWNER 仅在建库时产生,转让另行实现) */
const ASSIGNABLE_ROLES = SPACE_ROLES.filter((r) => r !== 'OWNER');

export class CreateSpaceDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, { message: 'slug must be lowercase alphanumeric with hyphens, 3-50 chars' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateSpaceDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  icon?: string;
}

export class AddMemberDto {
  @IsEmail()
  email: string;

  @IsIn(ASSIGNABLE_ROLES)
  role: Exclude<SpaceRole, 'OWNER'>;
}

export class UpdateMemberDto {
  @IsIn(ASSIGNABLE_ROLES)
  role: Exclude<SpaceRole, 'OWNER'>;
}
