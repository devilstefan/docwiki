import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class SaveContentDto {
  @IsString()
  content: string;

  /** 乐观锁:客户端读到的当前版本号,不一致则 409 */
  @IsInt()
  @Min(0)
  baseVersion: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;
}
