import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ActivityLogRepository } from '../../../shared/activity-log.repository';
import { DatabaseService } from '../../../shared/database/database.service';

@Injectable()
export class DiscountRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activityLogRepository: ActivityLogRepository,
  ) {}

  async listForAdmin(adminUserId: number) {
    const admin = await this.databaseService.getUserStoreScope(adminUserId);

    if (!admin.store_id) {
      throw new InternalServerErrorException('Only store-linked accounts can view discount settings.');
    }

    await this.ensureDefaultDiscountSettings(admin.store_id);

    return this.databaseService.query(
      `
        SELECT id, store_id, discount_name, discount_rate, is_enabled, created_at, updated_at
        FROM discount_settings
        WHERE store_id = $1
        ORDER BY id ASC
      `,
      [admin.store_id],
    );
  }

  async create(input: { adminUserId: number; discountName: string; discountRate: number; isEnabled: boolean }) {
    const admin = await this.databaseService.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can create discount settings.');
    }

    const rows = await this.databaseService.query(
      `
        INSERT INTO discount_settings (store_id, discount_name, discount_rate, is_enabled)
        VALUES ($1, $2, $3, $4)
        RETURNING id, store_id, discount_name, discount_rate, is_enabled, created_at, updated_at
      `,
      [admin.store_id, input.discountName, input.discountRate, input.isEnabled],
    );

    await this.activityLogRepository.record({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Store Settings',
      action: 'Discount Settings Updated',
      details: `Created discount setting\n${input.discountName}: ${input.discountRate}%`,
    });

    return rows[0];
  }

  async update(input: { adminUserId: number; discountId: number; discountName: string; discountRate: number; isEnabled: boolean }) {
    const admin = await this.databaseService.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can update discount settings.');
    }

    const rows = await this.databaseService.query(
      `
        UPDATE discount_settings
        SET discount_name = $1,
            discount_rate = $2,
            is_enabled = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
          AND store_id = $5
        RETURNING id, store_id, discount_name, discount_rate, is_enabled, created_at, updated_at
      `,
      [input.discountName, input.discountRate, input.isEnabled, input.discountId, admin.store_id],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Discount setting was not found for this store.');
    }

    await this.activityLogRepository.record({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Store Settings',
      action: 'Discount Settings Updated',
      details: `Updated discount setting\n${input.discountName}: ${input.discountRate}%`,
    });

    return rows[0];
  }

  async delete(input: { adminUserId: number; discountId: number }) {
    const admin = await this.databaseService.getUserStoreScope(input.adminUserId);

    if (!this.isStoreManagerRole(admin.role) || !admin.store_id) {
      throw new InternalServerErrorException('Only store admin accounts can delete discount settings.');
    }

    const rows = await this.databaseService.query(
      `
        DELETE FROM discount_settings
        WHERE id = $1
          AND store_id = $2
        RETURNING id
      `,
      [input.discountId, admin.store_id],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Discount setting was not found for this store.');
    }

    await this.activityLogRepository.record({
      userId: admin.id,
      storeId: admin.store_id,
      userName: admin.full_name,
      userRole: admin.role,
      module: 'Store Settings',
      action: 'Discount Settings Updated',
      details: `Deleted discount setting\nDiscount ID: ${input.discountId}`,
    });

    return { id: input.discountId };
  }

  private async ensureDefaultDiscountSettings(storeId: number) {
    await this.databaseService.query(
      `
        INSERT INTO discount_settings (store_id, discount_name, discount_rate, is_enabled)
        SELECT $1, seed.discount_name, seed.discount_rate, TRUE
        FROM (
          VALUES
            ('PWD', 20),
            ('Senior Citizen', 20),
            ('Promo Discount', 10),
            ('Custom Discount', 0)
        ) AS seed(discount_name, discount_rate)
        WHERE NOT EXISTS (
          SELECT 1
          FROM discount_settings ds
          WHERE ds.store_id = $1
        )
      `,
      [storeId],
    );
  }

  private isStoreManagerRole(role: unknown) {
    return role === 'POS_MANAGER' || role === 'INVENTORY_MANAGER' || role === 'POS_ADMIN' || role === 'INVENTORY_ADMIN' || role === 'ADMIN';
  }
}
