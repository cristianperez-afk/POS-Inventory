import { IsDefined } from 'class-validator';

export class UpsertRestaurantSettingDto {
  @IsDefined()
  value: unknown;
}
