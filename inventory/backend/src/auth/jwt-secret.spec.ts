import { ConfigService } from '@nestjs/config';
import { getJwtSecret } from './jwt-secret';

describe('getJwtSecret', () => {
  it('rejects a missing production secret', () => {
    const config = new ConfigService({ NODE_ENV: 'production' });
    expect(() => getJwtSecret(config)).toThrow(
      'JWT_SECRET is required in production',
    );
  });

  it('allows the development fallback outside production', () => {
    const config = new ConfigService({ NODE_ENV: 'development' });
    expect(getJwtSecret(config)).toBe('dev-only-secret');
  });
});
