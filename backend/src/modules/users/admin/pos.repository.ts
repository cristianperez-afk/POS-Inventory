import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ActivityLogRepository } from '../../../shared/activity-log.repository';
import { DatabaseService } from '../../../shared/database/database.service';

@Injectable()
export class PosRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activityLogRepository: ActivityLogRepository,
  ) {}

  listProducts(userId: number) {
    return this.databaseService.listPosProducts(userId);
  }

  setDiningTableOccupancy(input: { userId: number; tableId: string; occupiedSeats: number }) {
    return this.databaseService.setDiningTableOccupancy(input);
  }

  async listDiningTables(userId: number) {
    await this.databaseService.ensureDiningTableSchema();
    const user = await this.databaseService.getUserStoreScope(userId);
    const scope = await this.databaseService.getDiningScope(user);
    const rows = await this.databaseService.query<any>(
      `
        SELECT *
        FROM "DiningTable"
        WHERE "businessId" = $1 AND "locationId" = $2
        ORDER BY "tableNumber" ASC
      `,
      [scope.businessId, scope.locationId],
    );
    return rows.map((row) => this.mapDiningTable(row));
  }

  async createDiningTable(input: { userId: number; tableNumber: string; totalSeats: number; isShared: boolean }) {
    await this.databaseService.ensureDiningTableSchema();
    const user = await this.databaseService.getUserStoreScope(input.userId);
    const scope = await this.databaseService.getDiningScope(user);
    const totalSeats = Math.max(1, Math.floor(Number(input.totalSeats) || 1));
    const rows = await this.databaseService.query<any>(
      `
        INSERT INTO "DiningTable" (
          id, "tableNumber", capacity, "occupiedSeats", "isShared", status, "locationId", "businessId", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, 0, $4, 'AVAILABLE', $5, $6, NOW(), NOW())
        RETURNING *
      `,
      [randomUUID(), input.tableNumber.trim(), totalSeats, input.isShared, scope.locationId, scope.businessId],
    );
    const table = this.mapDiningTable(rows[0]);
    await this.activityLogRepository.record({
      userId: user.id,
      storeId: user.store_id,
      userName: user.full_name,
      userRole: user.role,
      module: 'Restaurant Table Management',
      action: 'Table Created',
      details: `Created Table ${table.table_number}\nSeats: ${table.total_seats}`,
    });
    return table;
  }

  async updateDiningTable(input: { userId: number; tableId: string; tableNumber: string; totalSeats: number; isShared: boolean }) {
    await this.databaseService.ensureDiningTableSchema();
    const user = await this.databaseService.getUserStoreScope(input.userId);
    const scope = await this.databaseService.getDiningScope(user);
    const totalSeats = Math.max(1, Math.floor(Number(input.totalSeats) || 1));
    const currentRows = await this.databaseService.query<any>(
      `SELECT * FROM "DiningTable" WHERE id = $1 AND "businessId" = $2 AND "locationId" = $3 LIMIT 1`,
      [input.tableId, scope.businessId, scope.locationId],
    );
    if (!currentRows[0]) throw new NotFoundException('Table not found.');

    const occupiedSeats = Math.min(Number(currentRows[0].occupiedSeats ?? 0), totalSeats);
    const status = this.tableStatus(input.isShared, totalSeats, occupiedSeats);
    const rows = await this.databaseService.query<any>(
      `
        UPDATE "DiningTable"
        SET "tableNumber" = $1, capacity = $2, "occupiedSeats" = $3, "isShared" = $4, status = $5::"DiningTableStatus", "updatedAt" = NOW()
        WHERE id = $6 AND "businessId" = $7 AND "locationId" = $8
        RETURNING *
      `,
      [input.tableNumber.trim(), totalSeats, occupiedSeats, input.isShared, status, input.tableId, scope.businessId, scope.locationId],
    );
    const table = this.mapDiningTable(rows[0]);
    await this.activityLogRepository.record({
      userId: user.id,
      storeId: user.store_id,
      userName: user.full_name,
      userRole: user.role,
      module: 'Restaurant Table Management',
      action: 'Table Settings Updated',
      details: `Updated Table ${table.table_number}\nSeats: ${table.total_seats}`,
    });
    return table;
  }

  async deleteDiningTable(input: { userId: number; tableId: string }) {
    await this.databaseService.ensureDiningTableSchema();
    const user = await this.databaseService.getUserStoreScope(input.userId);
    const scope = await this.databaseService.getDiningScope(user);
    return this.databaseService.withTransaction(async (client) => {
      const tableRows = await this.databaseService.queryWithClient<any>(
        client,
        `SELECT id FROM "DiningTable" WHERE id = $1 AND "businessId" = $2 AND "locationId" = $3 LIMIT 1`,
        [input.tableId, scope.businessId, scope.locationId],
      );
      if (!tableRows[0]) throw new NotFoundException('Table not found.');

      await this.databaseService.queryWithClient(client, `UPDATE "KitchenOrder" SET "tableId" = NULL WHERE "tableId" = $1`, [input.tableId]);
      await this.databaseService.queryWithClient(client, `DELETE FROM "DiningTable" WHERE id = $1`, [input.tableId]);
      await this.activityLogRepository.record({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Restaurant Table Management',
        action: 'Table Deleted',
        details: `Deleted table\nTable ID: ${input.tableId}`,
      });
      return { ok: true };
    });
  }

  private mapDiningTable(row: any) {
    const totalSeats = Number(row.capacity ?? 0);
    const occupiedSeats = Math.max(0, Math.min(totalSeats, Number(row.occupiedSeats ?? 0)));
    const isShared = Boolean(row.isShared);
    return {
      id: row.id,
      store_id: row.businessId,
      table_name: row.tableNumber,
      table_number: row.tableNumber,
      total_seats: totalSeats,
      occupied_seats: occupiedSeats,
      available_seats: Math.max(0, totalSeats - occupiedSeats),
      is_shared: isShared,
      status: this.tableStatus(isShared, totalSeats, occupiedSeats),
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  private tableStatus(isShared: boolean, totalSeats: number, occupiedSeats: number) {
    if (occupiedSeats <= 0) return 'AVAILABLE';
    if (isShared && occupiedSeats < totalSeats) return 'PARTIALLY_OCCUPIED';
    return 'OCCUPIED';
  }
}
