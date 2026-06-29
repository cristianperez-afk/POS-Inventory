import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../../shared/common/types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InventoryApiService } from './inventory-api.service';

@Controller('api')
@UseGuards(JwtAuthGuard)
export class InventoryApiController {
  constructor(private readonly inventoryApiService: InventoryApiService) {}

  @Get()
  health() {
    return { message: 'Unified POS + Inventory API' };
  }


  @Get('inventory')
  listInventory(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listInventory(user, query);
  }

  @Post('inventory')
  createInventoryItem(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.createInventoryItem(user, body);
  }

  @Get('inventory/:id/cost-history')
  getItemCostHistory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.getItemCostHistory(user, id);
  }

  @Patch('inventory/:id')
  updateInventoryItem(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.updateInventoryItem(user, id, body);
  }

  @Delete('inventory/:id')
  deleteInventoryItem(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.deleteInventoryItem(user, id);
  }

  @Get('locations')
  listLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryApiService.listLocations(user);
  }

  @Post('locations')
  createLocation(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.createLocation(user, body);
  }

  @Get('categories')
  listCategories(@CurrentUser() user: AuthenticatedUser, @Query('module') module?: string) {
    return this.inventoryApiService.listCategories(user, module);
  }

  @Post('categories')
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.createCategory(user, body);
  }

  @Get('users')
  listUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryApiService.listUsers(user);
  }

  @Get('recipes')
  listRecipes(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listRecipes(user, query);
  }

  @Post('recipes')
  createRecipe(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.createRecipe(user, body);
  }

  @Patch('recipes/:id')
  updateRecipe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.inventoryApiService.updateRecipe(user, id, body);
  }

  @Post('recipes/:id/restore')
  restoreRecipe(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.restoreRecipe(user, id);
  }

  @Delete('recipes/:id')
  deleteRecipe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('permanent') permanent?: string,
  ) {
    return this.inventoryApiService.deleteRecipe(user, id, permanent === 'true');
  }

  @Get('kitchen-orders')
  listKitchenOrders(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listKitchenOrders(user, query);
  }

  @Patch('kitchen-orders/:id/status')
  updateKitchenOrderStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    return this.inventoryApiService.updateKitchenOrderStatus(user, id, body);
  }

  @Get('suppliers')
  listSuppliers(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listSuppliers(user, query);
  }

  @Post('suppliers')
  createSupplier(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.createSupplier(user, body);
  }

  @Patch('suppliers/:id')
  updateSupplier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.updateSupplier(user, id, body);
  }

  @Delete('suppliers/:id')
  deleteSupplier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.deleteSupplier(user, id);
  }

  @Get('purchase-orders')
  listPurchaseOrders(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listPurchaseOrders(user, query);
  }

  @Get('purchase-orders/goods-receipts')
  listGoodsReceipts(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listGoodsReceipts(user, query);
  }

  @Post('purchase-orders')
  createPurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.createPurchaseOrder(user, body);
  }

  @Get('purchase-orders/:id')
  getPurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.getPurchaseOrder(user, id);
  }

  @Patch('purchase-orders/:id')
  updatePurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.updatePurchaseOrder(user, id, body);
  }

  @Patch('purchase-orders/:id/submit')
  submitPurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.submitPurchaseOrder(user, id);
  }

  @Patch('purchase-orders/:id/approve')
  approvePurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.approvePurchaseOrder(user, id);
  }

  @Patch('purchase-orders/:id/reject')
  rejectPurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.inventoryApiService.rejectPurchaseOrder(user, id, body);
  }

  @Patch('purchase-orders/:id/cancel')
  cancelPurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.cancelPurchaseOrder(user, id);
  }

  @Patch('purchase-orders/:id/receive')
  receivePurchaseOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.receivePurchaseOrder(user, id, body);
  }

  @Patch('purchase-orders/:id/goods-receipt/reject')
  rejectGoodsReceipt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.quickActionGoodsReceipt(user, id, body, 'reject');
  }

  @Patch('purchase-orders/:id/goods-receipt/cancel')
  cancelGoodsReceipt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.quickActionGoodsReceipt(user, id, body, 'cancel');
  }

  @Get('transfers')
  listTransfers(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listTransfers(user, query);
  }

  @Post('transfers')
  createTransfer(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.createTransfer(user, body);
  }

  @Get('transfers/:id')
  getTransfer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.getTransfer(user, id);
  }

  @Patch('transfers/:id/dispatch')
  dispatchTransfer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.dispatchTransfer(user, id);
  }

  @Patch('transfers/:id/complete')
  completeTransfer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.completeTransfer(user, id);
  }

  @Patch('transfers/:id/cancel')
  cancelTransfer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.cancelTransfer(user, id);
  }

  @Get('sales')
  listSales(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listSales(user, query);
  }

  @Get('stock-movements')
  listStockMovements(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listStockMovements(user, query);
  }

  @Get('audit-logs')
  listAuditLogs(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listAuditLogs(user, query);
  }

  @Get('reports/ingredient-consumption')
  ingredientConsumptionReport(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.ingredientConsumptionReport(user, query);
  }

  @Get('reports/items-sold')
  itemsSoldReport(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.itemsSoldReport(user, query);
  }

  @Post('stock-movements')
  createStockMovement(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.createStockMovement(user, body);
  }

  @Get('bundles')
  listBundles(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listBundles(user, query);
  }

  @Post('bundles')
  createBundle(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.createBundle(user, body);
  }

  @Get('bundles/:id')
  getBundle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.getBundle(user, id);
  }

  @Patch('bundles/:id')
  updateBundle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.updateBundle(user, id, body);
  }

  @Patch('bundles/:id/approve')
  approveBundle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.approveBundle(user, id);
  }

  @Patch('bundles/:id/reject')
  rejectBundle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { rejectionReason?: string; reason?: string },
  ) {
    return this.inventoryApiService.rejectBundle(user, id, body);
  }

  @Patch('bundles/:id/activate')
  activateBundle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.activateBundle(user, id);
  }

  @Patch('bundles/:id/deactivate')
  deactivateBundle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.deactivateBundle(user, id);
  }

  @Patch('bundles/:id/archive')
  archiveBundle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.archiveBundle(user, id);
  }

  @Post('bundles/:id/restore')
  restoreBundle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.restoreBundle(user, id);
  }

  @Delete('bundles/:id')
  deleteBundle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.deleteBundle(user, id);
  }

  @Get('adjustments')
  listAdjustments(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listAdjustments(user, query);
  }

  @Post('adjustments')
  createAdjustment(@CurrentUser() user: AuthenticatedUser, @Body() body: Record<string, unknown>) {
    return this.inventoryApiService.createAdjustment(user, body);
  }

  @Get('adjustments/:id')
  getAdjustment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.getAdjustment(user, id);
  }

  @Patch('adjustments/:id/approve')
  approveAdjustment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.approveAdjustment(user, id);
  }

  @Patch('adjustments/:id/reject')
  rejectAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.inventoryApiService.rejectAdjustment(user, id, body);
  }

  @Get('notifications')
  listNotifications(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string | undefined>) {
    return this.inventoryApiService.listNotifications(user, query);
  }

  @Get('notifications/unread-count')
  countUnreadNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryApiService.countUnreadNotifications(user);
  }

  @Patch('notifications/read-all')
  markAllNotificationsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryApiService.markAllNotificationsRead(user);
  }

  @Patch('notifications/:id/read')
  markNotificationRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryApiService.markNotificationRead(user, id);
  }

  @Get('restaurant-settings')
  listRestaurantSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryApiService.listRestaurantSettings(user);
  }

  @Put('restaurant-settings/:key')
  upsertRestaurantSetting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() body: { value?: unknown },
  ) {
    return this.inventoryApiService.upsertRestaurantSetting(user, key, body.value);
  }
}

