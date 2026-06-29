import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../shared/common/types';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { ROLES_KEY } from './roles.decorator';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPERADMIN: ['*'],
  ADMIN: [
    'activity:read_store',
    'discounts:manage',
    'inventory:manage',
    'inventory:read',
    'pos:manage',
    'retail:void_authorize',
    'settings:manage',
    'staff:manage',
    'theme:manage_personal',
    'theme:manage_store',
  ],
  POS_MANAGER: [
    'activity:read_store',
    'pos:manage',
    'retail:void_authorize',
    'theme:manage_personal',
  ],
  INVENTORY_MANAGER: [
    'activity:read_store',
    'inventory:manage',
    'inventory:read',
    'theme:manage_personal',
  ],
  STAFF: ['pos:read', 'pos:create_order', 'theme:manage_personal'],
};

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

    const granted = this.permissionsFor(user);
    if (granted.has('*') || permissions.every((permission) => granted.has(permission))) return true;

    throw new ForbiddenException('You do not have permission to perform this action.');
  }

  private permissionsFor(user: AuthenticatedUser | undefined) {
    const permissions = new Set(ROLE_PERMISSIONS[String(user?.role ?? '').toUpperCase()] ?? []);
    if (user?.role === 'STAFF' && user.staff_type === 'INVENTORY_STAFF') {
      permissions.delete('pos:read');
      permissions.delete('pos:create_order');
      permissions.add('inventory:read');
      permissions.add('inventory:manage');
    }
    return permissions;
  }
}
