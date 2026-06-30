import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../../shared/database/database.service';
import { AuthenticatedUser } from '../../shared/common/types';
import { EmailService } from '../../shared/email/email.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async login(email: string, password: string, rememberMe = false) {
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

    const accessToken = await this.signAccessToken(sanitizedUser);
    const refreshToken = rememberMe ? this.generateToken() : null;

    if (refreshToken) {
      await this.databaseService.setRefreshToken(
        sanitizedUser.id,
        this.hashToken(refreshToken),
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      );
    } else {
      await this.databaseService.clearRefreshToken(sanitizedUser.id);
    }

    return { user: sanitizedUser, accessToken, refreshToken };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token.');
    }

    const user = await this.databaseService.findUserByRefreshTokenHash(this.hashToken(refreshToken));
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const nextRefreshToken = this.generateToken();
    await this.databaseService.setRefreshToken(
      user.id,
      this.hashToken(nextRefreshToken),
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    );

    return {
      user,
      accessToken: await this.signAccessToken(user),
      refreshToken: nextRefreshToken,
    };
  }

  async logout(user: AuthenticatedUser | undefined) {
    if (user?.id) {
      await this.databaseService.clearRefreshToken(user.id);
    }

    return { message: 'Logged out' };
  }

  async getSession(user: AuthenticatedUser | undefined) {
    if (!user?.id) {
      throw new UnauthorizedException('Invalid session.');
    }

    return { user: await this.databaseService.getActiveAuthUserById(user.id) };
  }

  async forgotPassword(email: string) {
    const user = await this.databaseService.getLoginUserByEmail(email);
    if (user) {
      const token = this.generateToken();
      await this.databaseService.setResetToken(
        user.id,
        this.hashToken(token),
        new Date(Date.now() + 60 * 60 * 1000),
      );
      await this.emailService.sendPasswordResetEmail(user.email, token);
    }

    return { message: 'If the email exists, a password reset link has been sent.' };
  }

  async resetPassword(token: string, password: string) {
    const user = await this.databaseService.findUserByResetTokenHash(this.hashToken(token));
    if (!user) {
      throw new UnauthorizedException('Invalid or expired password reset token.');
    }

    await this.databaseService.updatePasswordAndClearAuthTokens(user.id, password);
    return { message: 'Password has been reset.' };
  }

  private signAccessToken(user: AuthenticatedUser) {
    return this.jwtService.signAsync({
      sub: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      store_id: user.store_id,
      staff_type: user.staff_type,
      store_type: user.store_type,
      store_name: user.store_name,
    });
  }

  private generateToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
