import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../shared/common/types';
import { getPermissionsForUser } from './permission-policy';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (roles.length > 0 && !roles.includes(user?.role ?? '')) {
      throw new ForbiddenException('You do not have permission to access this resource.');
    }

    const permissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (permissions.length === 0) return true;

    const granted = getPermissionsForUser(user);
    if (granted.has('*') || permissions.every((permission) => granted.has(permission))) return true;

    throw new ForbiddenException('You do not have permission to perform this action.');
  }
}
