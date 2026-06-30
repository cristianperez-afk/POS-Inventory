import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../shared/common/types';
import { DatabaseService } from '../../shared/database/database.service';

type ActivityLogInput = {
  userId?: number | null;
  storeId?: number | null;
  userName?: string | null;
  userRole?: string | null;
  module: string;
  action: string;
  details: string;
};

@Injectable()
export class AuthRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  getLoginUserByEmail(email: string) {
    return this.databaseService.getLoginUserByEmail(email);
  }

  comparePassword(plainPassword: string, hashedPassword: string) {
    return this.databaseService.comparePassword(plainPassword, hashedPassword);
  }

  getActiveAuthUserById(userId: number): Promise<AuthenticatedUser> {
    return this.databaseService.getActiveAuthUserById(userId);
  }

  setRefreshToken(userId: number, tokenHash: string, expiresAt: Date) {
    return this.databaseService.setRefreshToken(userId, tokenHash, expiresAt);
  }

  clearRefreshToken(userId: number) {
    return this.databaseService.clearRefreshToken(userId);
  }

  findUserByRefreshTokenHash(tokenHash: string) {
    return this.databaseService.findUserByRefreshTokenHash(tokenHash);
  }

  setResetToken(userId: number, tokenHash: string, expiresAt: Date) {
    return this.databaseService.setResetToken(userId, tokenHash, expiresAt);
  }

  findUserByResetTokenHash(tokenHash: string) {
    return this.databaseService.findUserByResetTokenHash(tokenHash);
  }

  updatePasswordAndClearAuthTokens(userId: number, password: string) {
    return this.databaseService.updatePasswordAndClearAuthTokens(userId, password);
  }

  recordActivity(input: ActivityLogInput) {
    return this.databaseService.recordActivity(input);
  }
}
