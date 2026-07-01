import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../shared/database/database.service';

@Injectable()
export class PosOrderRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createPaidOrder(input: any) {
    await this.databaseService.ensurePosOrderSchema();
    if (input.tableName && !String(input.tableName).toLowerCase().startsWith('queue')) {
      await this.databaseService.ensureDiningTableSchema();
    }
    const user = await this.databaseService.getUserStoreScope(input.userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }
    if (this.databaseService.isInventoryManagerRole(user.role) || this.databaseService.isKitchenRole(user.role)) {
      throw new ForbiddenException('This account cannot create POS orders or process payments.');
    }

    try {
      const savedOrder = await this.databaseService.withTransaction(async (client) => {
        const isPaid = Boolean(input.payment);
        const orderType = input.orderType ?? (user.store_type === 'RETAIL_STORE' ? 'RETAIL' : 'TAKEOUT');
        const hasDiningTable = Boolean(input.tableName && !String(input.tableName).toLowerCase().startsWith('queue'));
        const isDineInOrder = ['DINE_IN', 'MIXED'].includes(orderType);
        const isRestaurantOrder = user.store_type === 'RESTAURANT' && orderType !== 'RETAIL';
        const isPaidDineIn = isPaid && ['DINE_IN', 'MIXED'].includes(orderType) && hasDiningTable;
        const orderStatus = input.orderStatus ?? (isRestaurantOrder ? 'PENDING' : (isPaid && !isPaidDineIn ? 'COMPLETED' : 'PENDING'));
        const paymentStatus = input.paymentStatus ?? (isPaid ? 'PAID' : 'NOT_PAID');
        const confirmedAt = new Date();
        const estimatedPrepMinutes = Number(input.estimatedPrepMinutes ?? input.estimated_prep_minutes);
        const estimatedReadyAt = Number.isFinite(estimatedPrepMinutes) && estimatedPrepMinutes > 0
          ? new Date(confirmedAt.getTime() + estimatedPrepMinutes * 60000)
          : null;
        const shouldStartPreparationAtConfirmation = isRestaurantOrder;
        const shouldStartStayAtConfirmation = isRestaurantOrder && isDineInOrder;
        const runningTimeStart = isRestaurantOrder ? confirmedAt : null;
        const stopsOnConfirmation =
          (orderType === 'TAKEOUT' && ['SERVED', 'COMPLETED'].includes(orderStatus)) ||
          (['DINE_IN', 'MIXED'].includes(orderType) && orderStatus === 'COMPLETED');
        const runningTimeEnd = isRestaurantOrder && stopsOnConfirmation ? runningTimeStart : null;
        const orderNumber = await this.databaseService.createUniqueOrderNumber(client, input.orderNumber);
        const partySize = Number(input.partySize ?? input.party_size ?? input.requiredSeats ?? 0);
        const orderRows = await this.databaseService.queryWithClient<{ id: number }>(
          client,
          `
            INSERT INTO orders (
              store_id, cashier_id, order_number, customer_name, order_type, table_name,
              party_size, subtotal, discount_amount, discount_type, tax_amount, service_charge,
              total_amount, order_status, payment_status, ordered_at, payment_at, completed_at,
              table_started_at, preparing_started_at, ready_at, service_started_at, served_at, service_duration,
              running_time_start, running_time_end, running_duration, is_running, estimated_prep_minutes, estimated_ready_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
            RETURNING id
          `,
          [
            user.store_id,
            user.id,
            orderNumber,
            input.customerName ?? null,
            orderType,
            input.tableName ?? null,
            Number.isFinite(partySize) && partySize > 0 ? partySize : null,
            input.subtotal ?? 0,
            input.discount ?? 0,
            input.discountType ?? null,
            input.tax ?? 0,
            input.serviceFee ?? 0,
            input.total ?? 0,
            orderStatus,
            paymentStatus,
            isRestaurantOrder ? confirmedAt : null,
            isPaid ? confirmedAt : null,
            orderStatus === 'COMPLETED' ? confirmedAt : null,
            shouldStartStayAtConfirmation ? confirmedAt : null,
            shouldStartPreparationAtConfirmation ? confirmedAt : null,
            ['READY', 'SERVED', 'COMPLETED'].includes(orderStatus) ? confirmedAt : null,
            shouldStartPreparationAtConfirmation ? confirmedAt : null,
            orderStatus === 'SERVED' ? confirmedAt : null,
            stopsOnConfirmation ? 0 : null,
            runningTimeStart,
            runningTimeEnd,
            runningTimeEnd ? 0 : null,
            Boolean(isRestaurantOrder && !stopsOnConfirmation),
            Number.isFinite(estimatedPrepMinutes) ? estimatedPrepMinutes : null,
            estimatedReadyAt,
          ],
        );
        const orderId = orderRows[0].id;
        const inventorySaleMovements: any[] = [];
        const inventorySyncSettings = await this.databaseService.getInventorySyncSettingsForStore(client, user.store_id!);

        for (const item of input.items ?? []) {
          if (isRestaurantOrder) {
            await this.databaseService.validateRestaurantModifiers(client, user.store_id!, item);
          }
          const itemRows = await this.databaseService.queryWithClient<{ id: number }>(
            client,
            `
              INSERT INTO order_items (
                order_id, product_id, variant_id, product_name, category_name, size, color,
                quantity, unit_price, line_total, item_type, notes, prep_time_minutes, customization_prep_minutes
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
              RETURNING id
            `,
            [
              orderId,
              item.productId ?? item.id ?? null,
              item.variantId ?? item.variant_id ?? null,
              item.name,
              item.categoryName ?? item.category ?? null,
              item.size ?? null,
              item.color ?? null,
              item.quantity ?? 1,
              item.price ?? 0,
              item.lineTotal ?? ((item.price ?? 0) * (item.quantity ?? 1)),
              item.orderType ?? null,
              item.notes ?? null,
              Number.isFinite(Number(item.prepTimeMinutes ?? item.prep_time_minutes)) ? Number(item.prepTimeMinutes ?? item.prep_time_minutes) : null,
              Number.isFinite(Number(item.customizationPrepMinutes ?? item.customization_prep_minutes)) ? Number(item.customizationPrepMinutes ?? item.customization_prep_minutes) : 0,
            ],
          );
          const orderItemId = itemRows[0].id;

          if (inventorySyncSettings.autoDeductInventoryOnSale) {
            if (user.store_type === 'RETAIL_STORE') {
              await this.databaseService.deductRetailProduct(client, user.store_id!, orderId, orderItemId, item, item.productId ?? item.id, item.variantId ?? item.variant_id, item.quantity ?? 1, inventorySaleMovements, inventorySyncSettings);
            } else {
              await this.databaseService.deductRestaurantIngredients(client, user.store_id!, orderId, orderItemId, item, inventorySaleMovements, inventorySyncSettings);
            }
          } else if (user.store_type === 'RESTAURANT') {
            await this.databaseService.recordRestaurantIngredientCustomizations(client, user.store_id!, orderItemId, item);
          }
        }

        if (inventorySyncSettings.autoDeductInventoryOnSale) {
          await this.databaseService.writeInventorySaleRecords(client, { user, orderNumber, input, movements: inventorySaleMovements });
        }

        if (input.payment) {
          const paymentNumber = await this.databaseService.createUniquePaymentNumber(client, `PAY-${orderNumber}`);

          await this.databaseService.queryWithClient(
            client,
            `
              INSERT INTO payments (
                store_id, order_id, processed_by, payment_number, payment_method,
                amount_due, amount_paid, change_amount, payment_status
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PAID')
            `,
            [
              user.store_id,
              orderId,
              user.id,
              paymentNumber,
              input.payment.method ?? 'Cash',
              input.total ?? 0,
              input.payment.amountPaid ?? input.total ?? 0,
              input.payment.changeAmount ?? 0,
            ],
          );
        }

        if (input.tableName && !String(input.tableName).toLowerCase().startsWith('queue') && orderStatus !== 'COMPLETED') {
          await this.databaseService.occupyDiningTable(client, user, input.tableName, Number.isFinite(partySize) ? partySize : 0);
        }

        return { id: orderId, order_number: orderNumber };
      });
      await this.databaseService.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Transactions',
        action: 'Order Created',
        details: `Created Order #${savedOrder.order_number}`,
      });
      if (input.payment) {
        await this.databaseService.recordActivity({
          userId: user.id,
          storeId: user.store_id,
          userName: user.full_name,
          userRole: user.role,
          module: 'Payments',
          action: 'Payment Processed',
          details: `${input.payment.method ?? 'Cash'} Payment\nAmount: ${Number(input.total ?? 0).toFixed(2)}`,
        });
      }
      return savedOrder;
    } catch (error) {
      this.databaseService.handleDatabaseWriteError(error, 'Unable to save order.');
    }
  }

  async updateOrder(input: any) {
    await this.databaseService.ensurePosOrderSchema();
    if (input.tableName !== undefined || input.orderStatus === 'COMPLETED' || Boolean(input.payment)) {
      await this.databaseService.ensureDiningTableSchema();
    }
    const user = await this.databaseService.getUserStoreScope(input.userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }
    const isRestrictedTransactionUpdate =
      Boolean(input.payment) ||
      input.paymentStatus === 'PAID' ||
      input.paymentStatus === 'VOIDED' ||
      input.paymentStatus === 'REFUNDED';
    if (this.databaseService.isInventoryManagerRole(user.role) && isRestrictedTransactionUpdate) {
      throw new ForbiddenException('Inventory Manager accounts can only view inventory workflows. Payment, refund, and void processing is restricted to POS Manager or POS Staff accounts.');
    }
    if (this.databaseService.isKitchenRole(user.role)) {
      throw new ForbiddenException('Kitchen accounts can only update orders through the Kitchen Orders module.');
    }

    const updates: string[] = [];
    const values: any[] = [user.store_id, input.orderNumber];

    const addUpdate = (column: string, value: any) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (input.tableName !== undefined) addUpdate('table_name', input.tableName);
    const isPaymentUpdate = Boolean(input.payment);
    if (input.orderStatus !== undefined) addUpdate('order_status', input.orderStatus);
    if (input.paymentStatus !== undefined) addUpdate('payment_status', input.paymentStatus);
    if (isPaymentUpdate && input.paymentStatus === undefined) addUpdate('payment_status', 'PAID');
    if (isPaymentUpdate || input.paymentStatus === 'PAID') addUpdate('payment_at', new Date());
    if (input.orderStatus === 'PREPARING') addUpdate('preparing_started_at', new Date());
    if (input.orderStatus === 'READY') addUpdate('ready_at', new Date());
    if (input.orderStatus === 'SERVED') addUpdate('served_at', new Date());
    if (input.orderStatus === 'COMPLETED') addUpdate('completed_at', new Date());
    if (input.orderStatus === 'COMPLETED') addUpdate('table_ended_at', new Date());

    if (updates.length === 0 && !isPaymentUpdate) {
      throw new BadRequestException('No order updates were provided.');
    }

    const newPaymentStatus = String(input.paymentStatus ?? '');
    const isVoidOrRefund = ['VOIDED', 'VOID', 'REFUNDED'].includes(newPaymentStatus);

    const rows = await this.databaseService.withTransaction(async (client) => {
      type UpdatedOrderRow = {
        id: number;
        order_number: string;
        total_amount: string | number;
        subtotal: string | number;
        discount_amount: string | number;
        tax_amount: string | number;
        customer_name: string | null;
      };

      const priorRows = await this.databaseService.queryWithClient<{ payment_status: string | null; table_name: string | null; party_size: string | number | null; order_type: string | null }>(
        client,
        `SELECT payment_status, table_name, party_size, order_type FROM orders WHERE store_id = $1 AND order_number = $2 LIMIT 1`,
        [user.store_id, input.orderNumber],
      );
      const priorPaymentStatus = priorRows[0]?.payment_status ?? null;

      const updatedRows = updates.length > 0
        ? await this.databaseService.queryWithClient<UpdatedOrderRow>(
            client,
            `
              UPDATE orders
              SET ${updates.join(', ')}
              WHERE store_id = $1
                AND order_number = $2
                AND (
                  ($${values.length + 1} = 'RETAIL_STORE' AND order_type = 'RETAIL')
                  OR ($${values.length + 1} = 'RESTAURANT' AND order_type <> 'RETAIL')
                )
              RETURNING id, order_number, total_amount, subtotal, discount_amount, tax_amount, customer_name
            `,
            [...values, user.store_type],
          )
        : await this.databaseService.queryWithClient<UpdatedOrderRow>(
            client,
            `
              SELECT id, order_number, total_amount, subtotal, discount_amount, tax_amount, customer_name
              FROM orders
              WHERE store_id = $1
                AND order_number = $2
                AND (
                  ($3 = 'RETAIL_STORE' AND order_type = 'RETAIL')
                  OR ($3 = 'RESTAURANT' AND order_type <> 'RETAIL')
                )
              LIMIT 1
            `,
            [user.store_id, input.orderNumber, user.store_type],
          );

      if (updatedRows.length === 0) {
        return updatedRows;
      }

      const orderType = String(priorRows[0]?.order_type ?? '').toUpperCase();
      const nextStatus = String(input.orderStatus ?? '').toUpperCase();

      if (nextStatus === 'PREPARING') {
        await this.databaseService.queryWithClient(
          client,
          `UPDATE orders
           SET preparing_started_at = COALESCE(preparing_started_at, NOW()),
               ordered_at = COALESCE(ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
               service_started_at = COALESCE(service_started_at, ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
               running_time_start = COALESCE(running_time_start, ordered_at, preparing_started_at, created_at, NOW()),
               table_started_at = CASE WHEN order_type IN ('DINE_IN', 'MIXED') THEN COALESCE(table_started_at, ordered_at, running_time_start, preparing_started_at, created_at, NOW()) ELSE table_started_at END,
               is_running = CASE WHEN running_time_end IS NULL THEN TRUE ELSE is_running END
           WHERE id = $1`,
          [updatedRows[0].id],
        );
      }
      if (nextStatus === 'READY') {
        await this.databaseService.queryWithClient(
          client,
          `UPDATE orders
           SET ready_at = COALESCE(ready_at, NOW())
           WHERE id = $1`,
          [updatedRows[0].id],
        );
      }
      if (nextStatus === 'SERVED') {
        await this.databaseService.queryWithClient(
          client,
          `UPDATE orders
           SET served_at = COALESCE(served_at, NOW()),
               ordered_at = COALESCE(ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
               order_status = CASE WHEN order_type = 'TAKEOUT' THEN 'COMPLETED' ELSE order_status END,
               completed_at = CASE WHEN order_type = 'TAKEOUT' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
               service_duration = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                 COALESCE(served_at, NOW())
                 - COALESCE(
                   CASE WHEN ordered_at <= COALESCE(served_at, NOW()) THEN ordered_at END,
                   CASE WHEN running_time_start <= COALESCE(served_at, NOW()) THEN running_time_start END,
                   CASE WHEN preparing_started_at <= COALESCE(served_at, NOW()) THEN preparing_started_at END,
                   created_at,
                   COALESCE(served_at, NOW())
                 )
               )))::BIGINT)
           WHERE id = $1`,
          [updatedRows[0].id],
        );
      }

      const priorTableName = String(priorRows[0]?.table_name ?? '');
      const isActualTable = (tableName: string) => Boolean(tableName) && !tableName.toLowerCase().startsWith('queue');
      if (
        ['DINE_IN', 'MIXED'].includes(orderType) &&
        input.tableName !== undefined &&
        isActualTable(String(input.tableName)) &&
        !isActualTable(priorTableName) &&
        !['COMPLETED', 'CANCELLED'].includes(nextStatus)
      ) {
        await this.databaseService.queryWithClient(
          client,
          `
            UPDATE orders
            SET ordered_at = COALESCE(ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
                running_time_start = COALESCE(running_time_start, ordered_at, preparing_started_at, created_at, NOW()),
                table_started_at = COALESCE(table_started_at, ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
                preparing_started_at = COALESCE(preparing_started_at, ordered_at, running_time_start, created_at, NOW()),
                service_started_at = COALESCE(service_started_at, ordered_at, running_time_start, preparing_started_at, created_at, NOW()),
                is_running = CASE WHEN running_time_start IS NULL THEN TRUE ELSE is_running END
            WHERE id = $1
              AND running_time_start IS NULL
              AND running_time_end IS NULL
          `,
          [updatedRows[0].id],
        );
      }
      const paymentCompletedNow =
        (isPaymentUpdate || String(input.paymentStatus ?? '').toUpperCase() === 'PAID') &&
        String(priorPaymentStatus ?? '').toUpperCase() !== 'PAID';
      const shouldStopRunningTimer =
        (orderType === 'TAKEOUT' && ['SERVED', 'COMPLETED'].includes(nextStatus)) ||
        (['DINE_IN', 'MIXED'].includes(orderType) && paymentCompletedNow) ||
        (['DINE_IN', 'MIXED'].includes(orderType) && String(priorPaymentStatus ?? '').toUpperCase() === 'PAID' && nextStatus === 'COMPLETED') ||
        nextStatus === 'CANCELLED';
      if (shouldStopRunningTimer) {
        await this.databaseService.stopOrderRunningTimer(client, updatedRows[0].id);
        await this.databaseService.queryWithClient(
          client,
          `
            UPDATE orders
            SET table_ended_at = CASE WHEN order_type IN ('DINE_IN', 'MIXED') THEN COALESCE(table_ended_at, NOW()) ELSE table_ended_at END,
                order_status = CASE
                  WHEN order_type IN ('DINE_IN', 'MIXED') AND $2::boolean THEN 'COMPLETED'
                  ELSE order_status
                END,
                completed_at = CASE
                  WHEN order_type IN ('DINE_IN', 'MIXED') AND $2::boolean THEN COALESCE(completed_at, NOW())
                  ELSE completed_at
                END,
                service_duration = CASE
                  WHEN order_type = 'TAKEOUT'
                    THEN COALESCE(service_duration, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                      NOW() - COALESCE(
                        CASE WHEN ordered_at <= NOW() THEN ordered_at END,
                        CASE WHEN running_time_start <= NOW() THEN running_time_start END,
                        CASE WHEN preparing_started_at <= NOW() THEN preparing_started_at END,
                        created_at,
                        NOW()
                      )
                    )))::BIGINT))
                  ELSE service_duration
                END
            WHERE id = $1
          `,
          [updatedRows[0].id, paymentCompletedNow],
        );
      }

      if (isPaymentUpdate) {
        const order = updatedRows[0];
        const paymentNumber = await this.databaseService.createUniquePaymentNumber(client, input.payment.paymentNumber ?? `PAY-${order.order_number}`);
        await this.databaseService.queryWithClient(
          client,
          `
            INSERT INTO payments (
              store_id, order_id, processed_by, payment_number, payment_method,
              amount_due, amount_paid, change_amount, payment_status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PAID')
          `,
          [
            user.store_id,
            order.id,
            user.id,
            paymentNumber,
            input.payment.method ?? 'Cash',
            Number(order.total_amount ?? 0),
            input.payment.amountPaid ?? Number(order.total_amount ?? 0),
            input.payment.changeAmount ?? 0,
          ],
        );
      }

      const nextTableName = input.tableName ?? priorRows[0]?.table_name ?? null;
      const nextPartySize = Number(input.partySize ?? priorRows[0]?.party_size ?? 0);
      if (input.tableName && !String(input.tableName).toLowerCase().startsWith('queue') && input.orderStatus !== 'COMPLETED') {
        await this.databaseService.occupyDiningTable(client, user, input.tableName, Number.isFinite(nextPartySize) ? nextPartySize : 0);
      }
      const hasDiningTable = Boolean(nextTableName && !String(nextTableName).toLowerCase().startsWith('queue'));
      if (hasDiningTable && input.orderStatus === 'COMPLETED' && !isPaymentUpdate && priorPaymentStatus !== 'PAID') {
        throw new BadRequestException('Cannot release a Pay Later table before payment is completed.');
      }
      if (input.orderStatus === 'COMPLETED') {
        await this.databaseService.releaseDiningTable(client, user, nextTableName, Number.isFinite(nextPartySize) ? nextPartySize : 0);
      }

      const restockItemIds = Array.isArray(input.restockOrderItemIds)
        ? input.restockOrderItemIds.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n))
        : null;
      const isPartialRefund = newPaymentStatus === 'PARTIALLY_REFUNDED';

      if (restockItemIds && restockItemIds.length > 0) {
        const reason =
          input.reason ?? input.refundReason ?? input.voidReason ??
          (isPartialRefund ? 'Partially refunded in POS' : newPaymentStatus === 'VOIDED' ? 'Voided in POS' : 'Refunded in POS');
        const saleStatus = isPartialRefund ? 'PARTIAL_REFUND' : 'REFUNDED';
        await this.databaseService.restockPosOrderItems(client, user, updatedRows[0], restockItemIds, saleStatus, reason);
      } else if (isVoidOrRefund && priorPaymentStatus === 'PAID') {
        const reason =
          input.reason ?? input.voidReason ?? input.refundReason ??
          (newPaymentStatus === 'REFUNDED' ? 'Refunded in POS' : 'Voided in POS');
        const restock =
          typeof input.restock === 'boolean'
            ? input.restock
            : user.store_type === 'RETAIL_STORE';
        await this.databaseService.restockVoidedPosOrder(client, user, updatedRows[0], newPaymentStatus, reason, restock);
      }

      return updatedRows;
    });

    if (rows.length === 0) {
      throw new NotFoundException('Order not found.');
    }

    if (input.payment) {
      await this.databaseService.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Payments',
        action: 'Payment Processed',
        details: `${input.payment.method ?? 'Cash'} Payment\nAmount: ${Number(input.payment.amountPaid ?? rows[0].total_amount ?? 0).toFixed(2)}\nOrder #${rows[0].order_number}`,
      });
    } else if (String(input.paymentStatus ?? '').toUpperCase() === 'REFUNDED' || String(input.paymentStatus ?? '').toUpperCase() === 'PARTIALLY_REFUNDED') {
      await this.databaseService.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Void & Refund',
        action: 'Refund Processed',
        details: `Refund processed\nOrder #${rows[0].order_number}\nReason: ${input.refundReason ?? input.reason ?? 'Customer request'}`,
      });
    } else if (String(input.paymentStatus ?? '').toUpperCase() === 'VOIDED') {
      await this.databaseService.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Void & Refund',
        action: 'Void Approved',
        details: `Voided Order #${rows[0].order_number}\nReason: ${input.voidReason ?? input.reason ?? 'No reason provided'}`,
      });
    } else if (input.orderStatus) {
      await this.databaseService.recordActivity({
        userId: user.id,
        storeId: user.store_id,
        userName: user.full_name,
        userRole: user.role,
        module: 'Transactions',
        action: `Order ${String(input.orderStatus).charAt(0).toUpperCase()}${String(input.orderStatus).slice(1).toLowerCase()}`,
        details: `Order #${rows[0].order_number} status changed to ${input.orderStatus}`,
      });
    }

    return rows[0];
  }

  async getNextOrderNumber(userId: number) {
    const user = await this.databaseService.getUserStoreScope(userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }

    const rows = await this.databaseService.query<{ next_order_number: string | number }>(
      `
        SELECT COALESCE(MAX(order_number), 100000) + 1 AS next_order_number
        FROM (
          SELECT NULLIF(regexp_replace(order_number, '\\D', '', 'g'), '')::BIGINT AS order_number
          FROM orders
          WHERE store_id = $1

          UNION ALL

          SELECT NULLIF(regexp_replace("transactionNumber", '\\D', '', 'g'), '')::BIGINT AS order_number
          FROM "Sale"
          WHERE "transactionNumber" LIKE 'POS-%'
        ) used_numbers
      `,
      [user.store_id],
    );

    return { order_number: String(rows[0]?.next_order_number ?? 100001).padStart(6, '0') };
  }

  async listOrders(userId: number) {
    await this.databaseService.ensurePosOrderSchema();
    const user = await this.databaseService.getUserStoreScope(userId);

    if (!user.store_id || !user.store_type) {
      throw new InternalServerErrorException('User account is not linked to a store.');
    }
    if (this.databaseService.isKitchenRole(user.role)) {
      throw new ForbiddenException('Kitchen accounts can only view orders through the Kitchen Orders module.');
    }

    await this.databaseService.reconcileRestaurantRunningTimers(user);

    return this.databaseService.query<any>(
      `
        SELECT
          o.id,
          o.order_number,
          o.customer_name,
          o.order_type,
          o.table_name,
          o.party_size,
          o.subtotal,
          o.discount_amount,
          o.discount_type,
          o.tax_amount,
          o.service_charge,
          o.total_amount,
          o.order_status,
          o.payment_status,
          COALESCE(o.ordered_at, o.running_time_start, o.preparing_started_at, o.created_at) AS ordered_at,
          o.created_at,
          o.completed_at,
          o.payment_at,
          o.preparing_started_at,
          o.ready_at,
          o.service_started_at,
          o.served_at,
          o.service_duration,
          COALESCE(o.table_started_at, CASE WHEN o.order_type IN ('DINE_IN', 'MIXED') THEN COALESCE(o.ordered_at, o.running_time_start, o.preparing_started_at, o.created_at) END) AS table_started_at,
          COALESCE(
            o.table_ended_at,
            CASE
              WHEN o.order_type IN ('DINE_IN', 'MIXED')
                AND (o.running_time_end IS NOT NULL OR o.order_status IN ('COMPLETED', 'CANCELLED'))
              THEN COALESCE(o.running_time_end, o.completed_at, o.payment_at, o.updated_at)
            END
          ) AS table_ended_at,
          o.running_time_start,
          o.running_time_end,
          o.running_duration,
          o.is_running,
          o.estimated_prep_minutes,
          o.estimated_ready_at,
          p.payment_number,
          p.payment_method,
          p.amount_paid,
          p.change_amount,
          COALESCE(payment_user.full_name, cashier_user.full_name) AS cashier_name,
          COALESCE(
            json_agg(
              json_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'variant_id', oi.variant_id,
                'product_name', oi.product_name,
                'category_name', oi.category_name,
                'size', oi.size,
                'color', oi.color,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'line_total', oi.line_total,
                'image_url', COALESCE(pv.image_url, prod.image_url),
                'item_type', oi.item_type,
                'notes', oi.notes,
                'prep_time_minutes', oi.prep_time_minutes,
                'customization_prep_minutes', oi.customization_prep_minutes,
                'added_ingredients', COALESCE(customizations.added, '[]'::json),
                'removed_ingredients', COALESCE(customizations.removed, '[]'::json),
                'changed_ingredients', COALESCE(customizations.changed, '[]'::json),
                'replaced_ingredients', COALESCE(customizations.replaced, '[]'::json),
                'modifiers', COALESCE(customizations.modifiers, '[]'::json)
              )
              ORDER BY oi.id ASC
            ) FILTER (WHERE oi.id IS NOT NULL),
            '[]'::json
          ) AS items
        FROM orders o
        LEFT JOIN payments p ON p.order_id = o.id
        LEFT JOIN users cashier_user ON cashier_user.id = o.cashier_id
        LEFT JOIN users payment_user ON payment_user.id = p.processed_by
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(json_agg(DISTINCT CONCAT(
              COALESCE(oic.notes, oic.replacement_ingredient_name, oic.original_ingredient_name, 'Add-on'),
              CASE WHEN oic.new_quantity IS NOT NULL THEN CONCAT(' ', oic.new_quantity::text, COALESCE(CONCAT(' ', oic.unit), '')) ELSE '' END
            )) FILTER (WHERE oic.customization_type IN ('ADD', 'EXTRA')), '[]'::json) AS added,
            COALESCE(json_agg(DISTINCT COALESCE(oic.original_ingredient_name, oic.notes)) FILTER (WHERE oic.customization_type = 'REMOVE'), '[]'::json) AS removed,
            COALESCE(json_agg(DISTINCT COALESCE(oic.notes, CONCAT(
              COALESCE(oic.original_ingredient_name, 'Ingredient'), ': ',
              COALESCE(oic.original_quantity::text, '0'), COALESCE(CONCAT(' ', oic.unit), ''), ' -> ',
              COALESCE(oic.new_quantity::text, '0'), COALESCE(CONCAT(' ', oic.unit), '')
            ))) FILTER (WHERE oic.customization_type IN ('CHANGE_QUANTITY', 'QUANTITY_CHANGE')), '[]'::json) AS changed,
            COALESCE(json_agg(DISTINCT CONCAT(
              COALESCE(oic.original_ingredient_name, 'Ingredient'), ' -> ',
              COALESCE(oic.replacement_ingredient_name, 'Replacement')
            )) FILTER (WHERE oic.customization_type = 'REPLACE'), '[]'::json) AS replaced,
            COALESCE(json_agg(DISTINCT oic.notes) FILTER (
              WHERE oic.customization_type = 'NOTE' AND oic.notes IS NOT NULL
            ), '[]'::json) AS modifiers
          FROM order_item_customizations oic
          WHERE oic.order_item_id = oi.id
        ) customizations ON TRUE
        LEFT JOIN products prod ON prod.id = oi.product_id
        LEFT JOIN product_variants pv ON pv.id = oi.variant_id
        WHERE o.store_id = $1
          AND (
            ($2 = 'RETAIL_STORE' AND o.order_type = 'RETAIL')
            OR ($2 = 'RESTAURANT' AND o.order_type <> 'RETAIL')
          )
        GROUP BY o.id, p.payment_number, p.payment_method, p.amount_paid, p.change_amount, cashier_user.full_name, payment_user.full_name
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 500
      `,
      [user.store_id, user.store_type],
    );
  }
}
