import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BUSINESS_MODULES_KEY } from './business-modules.decorator';

@Injectable()
export class BusinessModulesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModules =
      this.reflector.getAllAndOverride<string[]>(BUSINESS_MODULES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredModules.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userModules = request.user?.modules ?? [];
    return requiredModules.every((module) => userModules.includes(module));
  }
}
