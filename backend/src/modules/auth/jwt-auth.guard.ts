import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getJwtSecret } from './jwt-secret';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const cookieToken: string | undefined = request.cookies?.access_token;
    const authHeader: string | undefined = request.headers.authorization;
    const [type, bearerToken] = authHeader?.split(' ') ?? [];
    const token = cookieToken ?? (type === 'Bearer' ? bearerToken : undefined);

    if (!token) {
      throw new UnauthorizedException('Missing access token.');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: getJwtSecret(this.configService),
      });

      request.user = {
        id: Number(payload.sub),
        full_name: payload.full_name,
        email: payload.email,
        role: payload.role,
        store_id: payload.store_id ?? null,
        staff_type: payload.staff_type ?? null,
        store_type: payload.store_type ?? null,
        store_name: payload.store_name ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid access token.');
    }
  }
}
