import { IsString, MinLength } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(3)
  address!: string;

  @IsString()
  @MinLength(2)
  manager!: string;

  @IsString()
  @MinLength(5)
  phone!: string;
}
