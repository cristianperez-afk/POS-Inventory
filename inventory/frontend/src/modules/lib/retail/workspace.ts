import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { InventoryItem } from '../../../models/retail';
import {
  useDeleteRetailInventoryMutation,
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
  const deleteInventoryMutation = useDeleteRetailInventoryMutation();

  const inventory = inventoryQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const purchaseOrders = purchaseOrdersQuery.data ?? [];
  const productsReceived = goodsReceiptsQuery.data ?? [];
  const transfers = transfersQuery.data ?? [];
  const adjustments = adjustmentsQuery.data ?? [];

  const [formData, setFormData] = useState(emptyForm);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
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

    return {
      name: formData.name,
      itemType: 'RETAIL_ITEM',
      category: formData.category,
      targetCustomer: formData.targetCustomer,
      subcategory: formData.subcategory,
      size: formData.size,
      condition: formData.condition,
      quantity: Number(formData.quantity),
      price: Number(formData.price),
      locationId,
    };
  };

  const handleEdit = (item: InventoryItem) => {
    setFormData({
      name: item.name,
      category: item.category,
      targetCustomer: item.targetCustomer,
      subcategory: item.subcategory,
      size: item.size,
      condition: item.condition,
      quantity: item.quantity,
      price: item.price,
      location: item.location,
    });
    setEditingId(item.id);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    if (!formData.name || !formData.category || !formData.size) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await saveInventoryMutation.mutateAsync({
        id: editingId,
        data: toInventoryPayload(),
      });
      setEditingId(null);
      setShowEditModal(false);
      setFormData(emptyForm);
      toast.success('Inventory item updated');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update inventory item',
      );
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setShowEditModal(false);
    setFormData(emptyForm);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await deleteInventoryMutation.mutateAsync(id);
      toast.success('Inventory item deleted');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete inventory item',
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
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.subcategory.toLowerCase().includes(searchTerm.toLowerCase()),
    ),
    formData,
    setFormData,
    searchTerm,
    setSearchTerm,
    editingId,
    showEditModal,
    expandedCategories,
    expandedSubcategories,
    handleEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleDelete,
    toggleCategory: (category: string) =>
      toggleSetValue(category, setExpandedCategories),
    toggleSubcategory: (subcategory: string) =>
      toggleSetValue(subcategory, setExpandedSubcategories),
  };
}
