import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

export { UserRole, UserStatus };

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsEnum(UserStatus)
  status!: UserStatus;
}
