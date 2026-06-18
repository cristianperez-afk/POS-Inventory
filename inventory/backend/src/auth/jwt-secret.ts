import { ConfigService } from '@nestjs/config';

const developmentSecret = 'dev-only-secret';

export function getJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET')?.trim();
  if (secret) return secret;

  if (configService.get<string>('NODE_ENV') === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }

  return developmentSecret;
}
