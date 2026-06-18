import { SetMetadata } from '@nestjs/common';

export const BUSINESS_MODULES_KEY = 'business_modules';
export const RequiredBusinessModules = (...modules: string[]) =>
  SetMetadata(BUSINESS_MODULES_KEY, modules);
