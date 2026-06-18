import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateBundleDto } from './create-bundle.dto';

export class UpdateBundleDto extends PartialType(OmitType(CreateBundleDto, ['items'] as const)) {}
