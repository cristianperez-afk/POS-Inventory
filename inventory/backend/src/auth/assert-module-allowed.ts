import { ForbiddenException } from '@nestjs/common';
import { BusinessModule } from '@prisma/client';
import type { AuthenticatedUser } from './current-user.decorator';

export function resolveModule(
  user: AuthenticatedUser,
  requested?: BusinessModule,
): BusinessModule {
  const enabled = user.modules as BusinessModule[];
  if (enabled.length === 0) {
    throw new ForbiddenException('No business modules enabled for this user');
  }
  if (!requested) {
    if (enabled.length === 1) return enabled[0];
    throw new ForbiddenException(
      'module is required for a multi-module business',
    );
  }
  if (!enabled.includes(requested)) {
    throw new ForbiddenException(`Not authorized for module "${requested}"`);
  }
  return requested;
}
