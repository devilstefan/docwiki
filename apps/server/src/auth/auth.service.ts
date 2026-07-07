import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

const SAFE_USER_SELECT = { id: true, email: true, name: true, avatarUrl: true, role: true, createdAt: true } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('email already registered');

    // 首个注册用户自动成为平台管理员
    const isFirstUser = (await this.prisma.user.count()) === 0;
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: isFirstUser ? 'ADMIN' : 'USER',
      },
      select: SAFE_USER_SELECT,
    });
    return { user, accessToken: await this.signToken(user.id, user.email, user.role) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('invalid credentials');
    }
    const { passwordHash: _, ...safe } = user;
    return { user: safe, accessToken: await this.signToken(user.id, user.email, user.role) };
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT });
  }

  private signToken(sub: string, email: string, role: string) {
    return this.jwt.signAsync({ sub, email, role });
  }
}
