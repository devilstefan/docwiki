import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpaceDto, UpdateSpaceDto, AddMemberDto, UpdateMemberDto } from './dto/space.dto';

const MEMBER_USER_SELECT = { id: true, email: true, name: true, avatarUrl: true } as const;

@Injectable()
export class SpacesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateSpaceDto) {
    const slug = dto.slug ?? this.generateSlug(dto.name);
    const exists = await this.prisma.space.findUnique({ where: { slug } });
    if (exists) throw new ConflictException(`slug "${slug}" already taken`);

    return this.prisma.space.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        members: { create: { userId: ownerId, role: 'OWNER' } },
      },
    });
  }

  /** 我参与的全部未归档知识库 */
  async listMine(userId: string) {
    const memberships = await this.prisma.spaceMember.findMany({
      where: { userId, space: { archivedAt: null } },
      include: { space: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({ ...m.space, myRole: m.role }));
  }

  /** 成员或公开库可见 */
  async getVisible(userId: string, spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      include: { members: { where: { userId } } },
    });
    if (!space || space.archivedAt) throw new NotFoundException('space not found');
    const membership = space.members[0];
    if (!membership && !space.isPublic) throw new NotFoundException('space not found');
    const { members: _, ...rest } = space;
    return { ...rest, myRole: membership?.role ?? null };
  }

  async update(spaceId: string, dto: UpdateSpaceDto) {
    await this.mustExist(spaceId);
    return this.prisma.space.update({ where: { id: spaceId }, data: dto });
  }

  async archive(spaceId: string) {
    await this.mustExist(spaceId);
    return this.prisma.space.update({ where: { id: spaceId }, data: { archivedAt: new Date() } });
  }

  async listMembers(spaceId: string) {
    return this.prisma.spaceMember.findMany({
      where: { spaceId },
      include: { user: { select: MEMBER_USER_SELECT } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMember(spaceId: string, dto: AddMemberDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new NotFoundException(`no user with email ${dto.email}`);
    const existing = await this.prisma.spaceMember.findUnique({
      where: { userId_spaceId: { userId: user.id, spaceId } },
    });
    if (existing) throw new ConflictException('already a member');
    return this.prisma.spaceMember.create({
      data: { spaceId, userId: user.id, role: dto.role },
      include: { user: { select: MEMBER_USER_SELECT } },
    });
  }

  async updateMember(spaceId: string, userId: string, dto: UpdateMemberDto) {
    const member = await this.mustBeMember(spaceId, userId);
    if (member.role === 'OWNER') throw new ForbiddenException('cannot change owner role');
    return this.prisma.spaceMember.update({
      where: { userId_spaceId: { userId, spaceId } },
      data: { role: dto.role },
      include: { user: { select: MEMBER_USER_SELECT } },
    });
  }

  async removeMember(spaceId: string, userId: string) {
    const member = await this.mustBeMember(spaceId, userId);
    if (member.role === 'OWNER') throw new ForbiddenException('cannot remove owner');
    await this.prisma.spaceMember.delete({ where: { userId_spaceId: { userId, spaceId } } });
    return { removed: true };
  }

  private async mustExist(spaceId: string) {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId } });
    if (!space || space.archivedAt) throw new NotFoundException('space not found');
    return space;
  }

  private async mustBeMember(spaceId: string, userId: string) {
    const member = await this.prisma.spaceMember.findUnique({
      where: { userId_spaceId: { userId, spaceId } },
    });
    if (!member) throw new NotFoundException('member not found');
    return member;
  }

  private generateSlug(name: string) {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const suffix = randomBytes(3).toString('hex');
    // 中文等非 ASCII 名称 base 可能为空,直接用随机后缀
    return base.length >= 3 ? `${base}-${suffix}` : `space-${suffix}`;
  }
}
