import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../../shared/database/database.service';
import { AuthenticatedUser } from '../../shared/common/types';

@Injectable()
export class AuthService {
  constructor(private readonly databaseService: DatabaseService) {}

  async login(email: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.databaseService.getLoginUserByEmail(email);

    if (!user) {
      await this.databaseService.recordActivity({
        module: 'Authentication',
        action: 'Failed Login Attempt',
        details: `Failed login attempt for ${email}.`,
        userName: email,
        userRole: 'Unknown',
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatches = await this.databaseService.comparePassword(password, user.password_hash);

    if (!passwordMatches) {
      await this.databaseService.recordActivity({
        storeId: user.store_id,
        userId: user.id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Authentication',
        action: 'Failed Login Attempt',
        details: `Failed login attempt for ${email}.`,
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    const { password_hash: _passwordHash, ...sanitizedUser } = user;
    await this.databaseService.recordActivity({
      storeId: sanitizedUser.store_id,
      userId: sanitizedUser.id,
      userName: sanitizedUser.full_name,
      userRole: sanitizedUser.role,
      module: 'Authentication',
      action: 'User Logged In',
      details: 'User logged into the POS system.',
    });

    return sanitizedUser;
  }
}
