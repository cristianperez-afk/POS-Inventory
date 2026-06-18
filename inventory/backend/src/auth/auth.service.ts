import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import type { AuthenticatedUser } from './current-user.decorator';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user || user.status !== 'Active') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.touchLastLogin(user.id);

    const safeUser = this.toAuthUser(user);
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
      modules: user.business.modules,
    });

    return {
      accessToken,
      user: safeUser,
    };
  }

  async getSession(authenticatedUser: AuthenticatedUser) {
    const user = await this.usersService.findAuthUserById(authenticatedUser.id);
    if (
      !user ||
      user.status !== 'Active' ||
      user.businessId !== authenticatedUser.businessId
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    return { user: this.toAuthUser(user) };
  }

  private toAuthUser<
    T extends {
      passwordHash?: string;
      business: { modules: unknown[] };
    },
  >(user: T) {
    const currentUser = this.usersService.sanitizeUser(user);
    const { business, ...safeUser } = currentUser;
    return {
      ...safeUser,
      modules: business.modules,
    };
  }
}
