import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../shared/database/database.service';

@Injectable()
export class SuperadminService {
  constructor(private readonly databaseService: DatabaseService) {}

  listAdminUsers() {
    return this.databaseService.listAdminUsers();
  }

  createAdminAccount(input: { fullName: string; email: string; storeType: 'RESTAURANT' | 'RETAIL_STORE'; password?: string }) {
    return this.databaseService.createAdminAccount(input);
  }

  updateAdminAccount(input: { adminUserId: number; fullName: string; email: string; storeType: 'RESTAURANT' | 'RETAIL_STORE'; password?: string }) {
    return this.databaseService.updateAdminAccount(input);
  }

  deleteAdminAccount(adminUserId: number) {
    return this.databaseService.deleteAdminAccount(adminUserId);
  }

  permanentlyDeleteAdminAccount(adminUserId: number) {
    return this.databaseService.permanentlyDeleteAdminAccount(adminUserId);
  }

  activateAdminAccount(adminUserId: number) {
    return this.databaseService.activateAdminAccount(adminUserId);
  }
}
