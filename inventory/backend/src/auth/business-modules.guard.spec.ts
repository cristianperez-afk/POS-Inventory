import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessModulesGuard } from './business-modules.guard';
import { BUSINESS_MODULES_KEY } from './business-modules.decorator';

describe('BusinessModulesGuard', () => {
  const createContext = (modules: string[] = []) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { modules } }),
      }),
    }) as unknown as ExecutionContext;

  it('allows requests when the business has every required module', () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['RESTAURANT']);
    const guard = new BusinessModulesGuard(reflector);

    expect(guard.canActivate(createContext(['RETAIL', 'RESTAURANT']))).toBe(true);
  });

  it('blocks requests when a required module is missing', () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['RESTAURANT']);
    const guard = new BusinessModulesGuard(reflector);

    expect(guard.canActivate(createContext(['RETAIL']))).toBe(false);
  });

  it('allows requests with no module metadata', () => {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key) =>
        key === BUSINESS_MODULES_KEY ? [] : undefined,
      );
    const guard = new BusinessModulesGuard(reflector);

    expect(guard.canActivate(createContext())).toBe(true);
  });
});
