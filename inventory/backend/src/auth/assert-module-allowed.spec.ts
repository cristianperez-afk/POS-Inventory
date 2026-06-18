import { ForbiddenException } from '@nestjs/common';
import { BusinessModule, UserRole } from '@prisma/client';
import { resolveModule } from './assert-module-allowed';
import type { AuthenticatedUser } from './current-user.decorator';

const user = (modules: string[]): AuthenticatedUser => ({
  id: 'user-1',
  email: 'user@example.com',
  role: UserRole.Admin,
  businessId: 'business-1',
  modules,
});

describe('resolveModule', () => {
  it('uses the only enabled module when none is requested', () => {
    expect(resolveModule(user(['RESTAURANT']))).toBe(
      BusinessModule.RESTAURANT,
    );
  });

  it('requires an explicit module for multi-module businesses', () => {
    expect(() => resolveModule(user(['RETAIL', 'RESTAURANT']))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a module that is not enabled', () => {
    expect(() =>
      resolveModule(user(['RETAIL']), BusinessModule.RESTAURANT),
    ).toThrow('Not authorized for module "RESTAURANT"');
  });
});
