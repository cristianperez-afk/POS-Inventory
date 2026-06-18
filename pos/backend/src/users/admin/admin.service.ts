import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../shared/database/database.service';

type StaffType = 'POS_STAFF' | 'INVENTORY_STAFF' | 'MANAGER';

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

  listCategories(adminUserId: number) {
    return this.databaseService.listCategoriesForAdmin(adminUserId);
  }

  createCategory(input: { adminUserId: number; name: string; description: string | null }) {
    return this.databaseService.createCategoryForAdmin(input);
  }

  updateCategory(input: { adminUserId: number; categoryId: number; name: string; description: string | null }) {
    return this.databaseService.updateCategoryForAdmin(input);
  }

  deleteCategory(input: { adminUserId: number; categoryId: number }) {
    return this.databaseService.deleteCategoryForAdmin(input);
  }

  listProducts(adminUserId: number) {
    return this.databaseService.listProductsForAdmin(adminUserId);
  }

  createProduct(input: any) {
    return this.databaseService.createProductForAdmin(input);
  }

  updateProduct(input: any) {
    return this.databaseService.updateProductForAdmin(input);
  }

  deleteProduct(input: { adminUserId: number; productId: number }) {
    return this.databaseService.deleteProductForAdmin(input);
  }

  listIngredients(adminUserId: number) {
    return this.databaseService.listIngredientsForAdmin(adminUserId);
  }

  createIngredient(input: any) {
    return this.databaseService.createIngredientForAdmin(input);
  }

  updateIngredient(input: any) {
    return this.databaseService.updateIngredientForAdmin(input);
  }

  deleteIngredient(input: { adminUserId: number; ingredientId: number }) {
    return this.databaseService.deleteIngredientForAdmin(input);
  }

  listIngredientAlternatives(adminUserId: number) {
    return this.databaseService.listIngredientAlternativesForAdmin(adminUserId);
  }

  createIngredientAlternative(input: any) {
    return this.databaseService.createIngredientAlternativeForAdmin(input);
  }

  updateIngredientAlternative(input: any) {
    return this.databaseService.updateIngredientAlternativeForAdmin(input);
  }

  deleteIngredientAlternative(input: { adminUserId: number; alternativeId: number }) {
    return this.databaseService.deleteIngredientAlternativeForAdmin(input);
  }

  listInventoryDeductions(adminUserId: number) {
    return this.databaseService.listInventoryDeductionsForAdmin(adminUserId);
  }

  listProductIngredients(input: { adminUserId: number; productId: number }) {
    return this.databaseService.listProductIngredientsForAdmin(input);
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
}
