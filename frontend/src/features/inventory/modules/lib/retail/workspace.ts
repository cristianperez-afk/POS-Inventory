import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useRetailAdjustmentsQuery,
  useRetailInventoryQuery,
  useSaveRetailInventoryMutation,
} from './inventoryQueries';
import type { RetailStockAlert } from './shared';
import {
  useRetailGoodsReceiptsQuery,
  useRetailPurchaseOrdersQuery,
} from './purchaseOrderQueries';
import {
  useRetailLocationsQuery,
  useRetailUsersQuery,
} from './locationQueries';
import { useRetailTransfersQuery } from './transferQueries';

const emptyForm = {
  name: '',
  category: '',
  targetCustomer: 'Unisex' as 'Male' | 'Female' | 'Unisex',
  subcategory: '',
  size: '',
  condition: 'Good' as 'Excellent' | 'Good' | 'Fair' | 'Damaged',
  quantity: 1,
  price: 0,
  location: 'Main Store',
};

export function useRetailWorkspace({
  enabled,
  loadSharedData,
  loadUsers,
}: {
  enabled: boolean;
  loadSharedData: boolean;
  loadUsers: boolean;
}) {
  const inventoryQuery = useRetailInventoryQuery(enabled);
  const locationsQuery = useRetailLocationsQuery(loadSharedData);
  const usersQuery = useRetailUsersQuery(loadUsers);
  const purchaseOrdersQuery = useRetailPurchaseOrdersQuery(undefined, enabled);
  const goodsReceiptsQuery = useRetailGoodsReceiptsQuery(undefined, enabled);
  const transfersQuery = useRetailTransfersQuery(enabled);
  const adjustmentsQuery = useRetailAdjustmentsQuery(enabled);
  const saveInventoryMutation = useSaveRetailInventoryMutation();

  const inventory = inventoryQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const purchaseOrders = purchaseOrdersQuery.data ?? [];
  const productsReceived = goodsReceiptsQuery.data ?? [];
  const transfers = transfersQuery.data ?? [];
  const adjustments = adjustmentsQuery.data ?? [];

  const [formData, setFormData] = useState(emptyForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [expandedSubcategories, setExpandedSubcategories] = useState<
    Set<string>
  >(new Set());

  const stats = useMemo(() => {
    const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
    const availableStock = inventory
      .filter((item) => item.condition !== 'Damaged')
      .reduce((sum, item) => sum + item.quantity, 0);
    const damagedItems = inventory
      .filter((item) => item.condition === 'Damaged')
      .reduce((sum, item) => sum + item.quantity, 0);
    const lastMonthItems = 15;
    const lastMonthAvailable = 12;

    return {
      totalItems,
      availableStock,
      damagedItems,
      stockMovements: inventory.length,
      itemsChange: Number(
        (((totalItems - lastMonthItems) / lastMonthItems) * 100).toFixed(1),
      ),
      availableChange: Number(
        (
          ((availableStock - lastMonthAvailable) / lastMonthAvailable) *
          100
        ).toFixed(1),
      ),
    };
  }, [inventory]);

  const stockAlerts = useMemo<RetailStockAlert[]>(
    () =>
      inventory
        .filter(
          (item) => item.quantity <= 3 && item.condition !== 'Damaged',
        )
        .map((item) => ({
          id: item.id,
          itemName: item.name,
          currentStock: item.quantity,
          threshold: 5,
          severity: item.quantity <= 1 ? 'critical' : 'low',
        })),
    [inventory],
  );

  const toInventoryPayload = () => {
    const locationId = locations.find(
      (location) => location.name === formData.location,
    )?.id;
    if (!locationId) throw new Error('Please select a valid location');

    // Note: quantity is intentionally omitted here. Editing an item must not write
    // stock — stock changes go through Stock Adjustments (audited). The create flow
    // re-adds quantity explicitly for the item's opening balance.
    return {
      name: formData.name,
      itemType: 'RETAIL_ITEM',
      category: formData.category,
      targetCustomer: formData.targetCustomer,
      subcategory: formData.subcategory,
      size: formData.size,
      condition: formData.condition,
      price: Number(formData.price),
      locationId,
    };
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.category || !formData.size) {
      toast.error('Please fill in all required fields');
      return false;
    }

    try {
      // Opening balance is allowed only on creation of a new item.
      await saveInventoryMutation.mutateAsync({
        data: { ...toInventoryPayload(), quantity: Number(formData.quantity) },
      });
      setFormData(emptyForm);
      toast.success('Inventory item added');
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to add inventory item',
      );
      return false;
    }
  };

  // Soft delete: archiving flips isActive to false instead of removing the row, so any
  // PO / sales / transfer / bundle references to the item stay intact. Reactivating
  // flips it back. Both reuse the generic inventory update mutation.
  const handleArchive = async (id: string) => {
    try {
      await saveInventoryMutation.mutateAsync({ id, data: { isActive: false } });
      toast.success('Item archived');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to archive inventory item',
      );
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await saveInventoryMutation.mutateAsync({ id, data: { isActive: true } });
      toast.success('Item reactivated');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to reactivate inventory item',
      );
    }
  };

  const toggleSetValue = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  return {
    inventory,
    locations,
    users,
    purchaseOrders,
    productsReceived,
    transfers,
    adjustments,
    stats,
    stockAlerts,
    filteredInventory: inventory.filter(
      (item) =>
        (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.subcategory.toLowerCase().includes(searchTerm.toLowerCase())) &&
        // Archived (deactivated) items are hidden unless the user opts to see them.
        (showArchived || item.isActive !== false),
    ),
    formData,
    setFormData,
    searchTerm,
    setSearchTerm,
    showArchived,
    setShowArchived,
    expandedCategories,
    expandedSubcategories,
    handleAdd,
    handleArchive,
    handleReactivate,
    toggleCategory: (category: string) =>
      toggleSetValue(category, setExpandedCategories),
    toggleSubcategory: (subcategory: string) =>
      toggleSetValue(subcategory, setExpandedSubcategories),
  };
}
