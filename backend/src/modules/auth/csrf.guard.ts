import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    if (SAFE_METHODS.has(String(request.method ?? '').toUpperCase())) return true;

    const cookieToken = request.cookies?.csrf_token;
    const headerToken = request.headers['x-csrf-token'];
    const submittedToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;

    if (!cookieToken || !submittedToken || cookieToken !== submittedToken) {
      throw new ForbiddenException('Invalid CSRF token.');
    }

    return true;
  }
}
