import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database/database.service';

type StaffType = 'POS_STAFF' | 'INVENTORY_STAFF';
type StaffRole = 'STAFF' | 'POS_MANAGER' | 'INVENTORY_MANAGER';

@Injectable()
export class AdminService {
  constructor(private readonly databaseService: DatabaseService) {}

  listStaff(adminUserId: number) {
    return this.databaseService.listStaffForAdmin(adminUserId);
  }

  createStaff(input: {
    adminUserId: number;
    fullName: string;
    email: string;
    password: string;
    staffType: StaffType;
    role?: StaffRole;
  }) {
    return this.databaseService.createStaffAccount(input);
  }

  updateStaff(input: {
    adminUserId: number;
    staffUserId: number;
    fullName: string;
    email: string;
    password?: string;
    staffType: StaffType;
    role?: StaffRole;
  }) {
    return this.databaseService.updateStaffAccountForAdmin(input);
  }

  deleteStaff(input: { adminUserId: number; staffUserId: number }) {
    return this.databaseService.deleteStaffAccountForAdmin(input);
  }

  permanentlyDeleteStaff(input: { adminUserId: number; staffUserId: number }) {
    return this.databaseService.permanentlyDeleteStaffAccountForAdmin(input);
  }

  activateStaff(input: { adminUserId: number; staffUserId: number }) {
    return this.databaseService.activateStaffAccountForAdmin(input);
  }

  getStoreInformation(adminUserId: number) {
    return this.databaseService.getStoreInformationForAdmin(adminUserId);
  }

  updateStoreInformation(input: {
    adminUserId: number;
    businessName: string;
    businessDescription: string | null;
    address: string | null;
    contactNumber: string | null;
    email: string | null;
    logo: string | null;
    receiptThankYouMessage: string | null;
    receiptFooterMessage: string | null;
    operatingHours: string | null;
    currency: string | null;
    themeColor: string | null;
    taxRate: number | null;
    serviceChargeRate: number | null;
  }) {
    return this.databaseService.updateStoreInformationForAdmin(input);
  }

  getStoreSettings(adminUserId: number) {
    return this.databaseService.getStoreSettingsForAdmin(adminUserId);
  }

  updateStoreSettings(input: {
    adminUserId: number;
    enableCustomerRecommendation?: boolean;
    enableTableManagement?: boolean;
    enableRefund?: boolean;
    enableVoid?: boolean;
    enableDiscount?: boolean;
    enableServiceCharge?: boolean;
    serviceChargeRate?: number;
    enableTax?: boolean;
    taxRate?: number;
    enableDineIn?: boolean;
    enableTakeout?: boolean;
    enableIngredientCustomization?: boolean;
    enableReceiptPrinting?: boolean;
    enabledPaymentMethods?: string[];
  }) {
    return this.databaseService.updateStoreSettingsForAdmin(input);
  }

  listDiscountSettings(adminUserId: number) {
    return this.databaseService.listDiscountSettingsForAdmin(adminUserId);
  }

  createDiscountSetting(input: { adminUserId: number; discountName: string; discountRate: number; isEnabled: boolean }) {
    return this.databaseService.createDiscountSettingForAdmin(input);
  }

  updateDiscountSetting(input: { adminUserId: number; discountId: number; discountName: string; discountRate: number; isEnabled: boolean }) {
    return this.databaseService.updateDiscountSettingForAdmin(input);
  }

  deleteDiscountSetting(input: { adminUserId: number; discountId: number }) {
    return this.databaseService.deleteDiscountSettingForAdmin(input);
  }

  listPosProducts(userId: number) {
    return this.databaseService.listPosProducts(userId);
  }

  createPaidPosOrder(input: any) {
    return this.databaseService.createPaidPosOrder(input);
  }

  updatePosOrder(input: any) {
    return this.databaseService.updatePosOrder(input);
  }

  getNextPosOrderNumber(userId: number) {
    return this.databaseService.getNextPosOrderNumber(userId);
  }

  listPosOrders(userId: number) {
    return this.databaseService.listPosOrders(userId);
  }

  listDiningTables(userId: number) {
    return this.databaseService.listDiningTables(userId);
  }

  createDiningTable(input: { userId: number; tableNumber: string; totalSeats: number; isShared: boolean }) {
    return this.databaseService.createDiningTable(input);
  }

  updateDiningTable(input: { userId: number; tableId: string; tableNumber: string; totalSeats: number; isShared: boolean }) {
    return this.databaseService.updateDiningTable(input);
  }

  deleteDiningTable(input: { userId: number; tableId: string }) {
    return this.databaseService.deleteDiningTable(input);
  }

  setDiningTableOccupancy(input: { userId: number; tableId: string; occupiedSeats: number }) {
    return this.databaseService.setDiningTableOccupancy(input);
  }
}
