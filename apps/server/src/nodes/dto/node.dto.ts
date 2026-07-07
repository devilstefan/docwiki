import { IsIn, IsInt, IsOptional, IsString, Length, Min, ValidateIf } from 'class-validator';
import { NODE_TYPES, type NodeType } from '@docwiki/shared';

export class CreateNodeDto {
  @IsIn(NODE_TYPES)
  type: NodeType;

  @IsString()
  @Length(1, 200)
  title: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class RenameNodeDto {
  @IsString()
  @Length(1, 200)
  title: string;
}

export class MoveNodeDto {
  /** null = 移到根层级 */
  @ValidateIf((o) => o.parentId !== null)
  @IsString()
  parentId: string | null;

  /** 放到该兄弟节点之后;null = 放到最前;缺省 = 放到最后 */
  @IsOptional()
  @ValidateIf((o) => o.afterId !== null)
  @IsString()
  afterId?: string | null;
}
