import { Injectable } from '@nestjs/common';
import { ActivityLogRepository } from '../../../shared/activity-log.repository';
import { PosOrderRepository } from '../../pos/pos-order.repository';
import { DiscountRepository } from './discount.repository';
import { PosRepository } from './pos.repository';
import { StaffRepository } from './staff.repository';
import { StoreSettingsRepository } from './store-settings.repository';
import { ThemeRepository } from './theme.repository';

type StaffType = 'POS_STAFF' | 'INVENTORY_STAFF' | 'KITCHEN_STAFF';
type StaffRole = 'STAFF' | 'POS_MANAGER' | 'INVENTORY_MANAGER' | 'KITCHEN';

@Injectable()
export class AdminService {
  constructor(
    private readonly activityLogRepository: ActivityLogRepository,
    private readonly staffRepository: StaffRepository,
    private readonly discountRepository: DiscountRepository,
    private readonly themeRepository: ThemeRepository,
    private readonly storeSettingsRepository: StoreSettingsRepository,
    private readonly posRepository: PosRepository,
    private readonly posOrderRepository: PosOrderRepository,
  ) {}

  listStaff(adminUserId: number) {
    return this.staffRepository.listForAdmin(adminUserId);
  }

  createStaff(input: {
    adminUserId: number;
    fullName: string;
    email: string;
    password: string;
    staffType: StaffType;
    role?: StaffRole;
    voidPin?: string | null;
  }) {
    return this.staffRepository.create(input);
  }

  updateStaff(input: {
    adminUserId: number;
    staffUserId: number;
    fullName: string;
    email: string;
    password?: string;
    staffType: StaffType;
    role?: StaffRole;
    voidPin?: string | null;
  }) {
    return this.staffRepository.update(input);
  }

  verifyRetailVoidPin(input: { userId: number; voidPin: string }) {
    return this.staffRepository.verifyRetailVoidPin(input);
  }

  getRetailManagerProfile(userId: number) {
    return this.staffRepository.getRetailManagerProfile(userId);
  }

  generateRetailManagerUniquePin(userId: number) {
    return this.staffRepository.generateRetailManagerUniquePin(userId);
  }

  deleteStaff(input: { adminUserId: number; staffUserId: number }) {
    return this.staffRepository.delete(input);
  }

  permanentlyDeleteStaff(input: { adminUserId: number; staffUserId: number }) {
    return this.staffRepository.permanentlyDelete(input);
  }

  activateStaff(input: { adminUserId: number; staffUserId: number }) {
    return this.staffRepository.activate(input);
  }

  getStoreInformation(adminUserId: number) {
    return this.storeSettingsRepository.getInformation(adminUserId);
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
    return this.storeSettingsRepository.updateInformation(input);
  }

  getStoreSettings(adminUserId: number) {
    return this.storeSettingsRepository.getSettings(adminUserId);
  }

  updateStoreSettings(input: {
    adminUserId: number;
    enableCustomerRecommendation?: boolean;
    enableTableManagement?: boolean;
    enableRefund?: boolean;
    enableVoid?: boolean;
    enableDiscount?: boolean;
    enableEstimatedPrepTime?: boolean;
    prepTimeStrategy?: string;
    customizationPrepTimeMinutes?: number;
    enableServiceCharge?: boolean;
    serviceChargeRate?: number;
    enableTax?: boolean;
    taxRate?: number;
    enableDineIn?: boolean;
    enableTakeout?: boolean;
    enableIngredientCustomization?: boolean;
    enableReceiptPrinting?: boolean;
    enabledPaymentMethods?: string[];
    paymentMethodAccounts?: Record<string, unknown>;
    autoDeductInventoryOnSale?: boolean;
    allowNegativeStock?: boolean;
    defaultLowStockThreshold?: number;
    defaultInventoryUnit?: string;
    cycleCountIntervalDays?: number;
    autoReorderThresholdPercent?: number;
    enableExpiryTracking?: boolean;
    defaultMarkupPercent?: number;
  }) {
    return this.storeSettingsRepository.updateSettings(input);
  }

  getThemePreferences(userId: number) {
    return this.themeRepository.getForUser(userId);
  }

  updatePersonalThemePreferences(input: { userId: number; preferences: Record<string, unknown> }) {
    return this.themeRepository.updatePersonal(input);
  }

  clearPersonalThemePreferences(userId: number) {
    return this.themeRepository.clearPersonal(userId);
  }

  updateStoreThemePreferences(input: { userId: number; preferences: Record<string, unknown> }) {
    return this.themeRepository.updateStore(input);
  }

  clearStoreThemePreferences(userId: number) {
    return this.themeRepository.clearStore(userId);
  }

  listDiscountSettings(adminUserId: number) {
    return this.discountRepository.listForAdmin(adminUserId);
  }

  createDiscountSetting(input: { adminUserId: number; discountName: string; discountRate: number; isEnabled: boolean }) {
    return this.discountRepository.create(input);
  }

  updateDiscountSetting(input: { adminUserId: number; discountId: number; discountName: string; discountRate: number; isEnabled: boolean }) {
    return this.discountRepository.update(input);
  }

  deleteDiscountSetting(input: { adminUserId: number; discountId: number }) {
    return this.discountRepository.delete(input);
  }

  listActivityLogs(input: {
    userId: number;
    dateFrom?: string;
    dateTo?: string;
    actorUserId?: number;
    module?: string;
    action?: string;
    search?: string;
  }) {
    return this.activityLogRepository.listForUser(input);
  }

  async recordActivityLog(input: { userId: number; module: string; action: string; details: string }) {
    await this.activityLogRepository.recordForUser(input.userId, input.module, input.action, input.details);
    return { ok: true };
  }

  listPosProducts(userId: number) {
    return this.posRepository.listProducts(userId);
  }

  createPaidPosOrder(input: any) {
    return this.posOrderRepository.createPaidOrder(input);
  }

  updatePosOrder(input: any) {
    return this.posOrderRepository.updateOrder(input);
  }

  getNextPosOrderNumber(userId: number) {
    return this.posOrderRepository.getNextOrderNumber(userId);
  }

  listPosOrders(userId: number) {
    return this.posOrderRepository.listOrders(userId);
  }

  listDiningTables(userId: number) {
    return this.posRepository.listDiningTables(userId);
  }

  createDiningTable(input: { userId: number; tableNumber: string; totalSeats: number; isShared: boolean }) {
    return this.posRepository.createDiningTable(input);
  }

  updateDiningTable(input: { userId: number; tableId: string; tableNumber: string; totalSeats: number; isShared: boolean }) {
    return this.posRepository.updateDiningTable(input);
  }

  deleteDiningTable(input: { userId: number; tableId: string }) {
    return this.posRepository.deleteDiningTable(input);
  }

  setDiningTableOccupancy(input: { userId: number; tableId: string; occupiedSeats: number }) {
    return this.posRepository.setDiningTableOccupancy(input);
  }
}
