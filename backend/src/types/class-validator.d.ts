declare module 'class-validator' {
  type ValidatorDecorator = (...args: any[]) => PropertyDecorator;

  export const IsArray: ValidatorDecorator;
  export const IsBoolean: ValidatorDecorator;
  export const IsEmail: ValidatorDecorator;
  export const IsIn: ValidatorDecorator;
  export const IsNumber: ValidatorDecorator;
  export const IsObject: ValidatorDecorator;
  export const IsOptional: ValidatorDecorator;
  export const IsString: ValidatorDecorator;
  export const MinLength: ValidatorDecorator;
}
