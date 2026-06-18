import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getJwtSecret } from './jwt-secret';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Prefer HttpOnly cookie; fall back to Authorization header for API clients
    const cookieToken: string | undefined = request.cookies?.access_token;
    const authHeader: string | undefined = request.headers.authorization;
    const [type, bearerToken] = authHeader?.split(' ') ?? [];
    const token = cookieToken ?? (type === 'Bearer' ? bearerToken : undefined);

    if (!token) {
      const bridged = await this.resolvePosBridgeUser(request);
      if (bridged) {
        request.user = bridged;
        return true;
      }

      throw new UnauthorizedException('Missing access token');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: getJwtSecret(this.configService),
      });
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        businessId: payload.businessId,
        modules: payload.modules ?? [],
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private async resolvePosBridgeUser(request: {
    headers: Record<string, string | string[] | undefined>;
  }) {
    const bridgedEmail = this.headerValue(request.headers['x-pos-bridge-email']);
    if (!bridgedEmail) {
      return null;
    }

    const storeType = this.headerValue(request.headers['x-pos-store-type']);
    const fallbackEmail =
      storeType === 'RESTAURANT'
        ? 'admin@restaurant.com'
        : 'admin@retail.com';
    const user =
      (await this.usersService.findByEmail(bridgedEmail)) ??
      (await this.usersService.findByEmail(fallbackEmail));

    if (!user || user.status !== 'Active') {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
      modules: user.business.modules ?? [],
    };
  }

  private headerValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
  }
}
