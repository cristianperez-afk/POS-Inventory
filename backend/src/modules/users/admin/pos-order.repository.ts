import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database/database.service';

@Injectable()
export class PosOrderRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  createPaidOrder(input: any) {
    return this.databaseService.createPaidPosOrder(input);
  }

  updateOrder(input: any) {
    return this.databaseService.updatePosOrder(input);
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
