import { useEffect, useState } from 'react';
import { Boxes, ClipboardCheck, Save } from 'lucide-react';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { normalizeStoreSettings, useStoreSettings } from '../context/StoreSettingsContext';
import { SettingToggle } from './GeneralSettings';

interface InventorySettingsProps {
  currentUser: AuthenticatedUser | null;
}

export function InventorySettings({ currentUser }: InventorySettingsProps) {
  const { settings: loadedSettings, reload } = useStoreSettings();
  const [settings, setSettings] = useState(loadedSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSettings(loadedSettings);
  }, [loadedSettings]);

  useEffect(() => {
    const load = async () => {
      if (!currentUser?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        await reload();
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [currentUser?.id]);

  const saveSettings = async () => {
    if (!currentUser?.id) return;
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/store-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_user_id: currentUser.id,
          auto_deduct_inventory_on_sale: settings.auto_deduct_inventory_on_sale,
          allow_negative_stock: settings.allow_negative_stock,
          default_low_stock_threshold: settings.default_low_stock_threshold,
          default_inventory_unit: settings.default_inventory_unit,
          cycle_count_interval_days: settings.cycle_count_interval_days,
          auto_reorder_threshold_percent: settings.auto_reorder_threshold_percent,
          enable_expiry_tracking: settings.enable_expiry_tracking,
          default_markup_percent: settings.default_markup_percent,
        }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data?.message ?? 'Unable to save inventory settings.');
      setSettings(normalizeStoreSettings(data));
      await reload();
      setMessage('Inventory settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save inventory settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-foreground">Inventory Settings</h1>
          <p className="text-muted-foreground">Rules that keep POS sales and inventory stock behavior aligned for this store.</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 self-start rounded-2xl bg-gradient-to-r from-primary to-secondary px-6 py-3 text-white transition-all duration-200 hover:shadow-lg hover:shadow-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-5 w-5" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {message && <div className="mb-6 rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">{message}</div>}

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Boxes className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Stock Sync & Defaults</h2>
            <p className="text-sm text-muted-foreground">Applied to every sale and stock adjustment for this store.</p>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading settings...</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
              <span>
                <span className="block font-medium text-foreground">Auto-deduct Inventory on Sale</span>
                <span className="mt-1 block text-sm text-muted-foreground">Completed POS orders should create stock-out movement records.</span>
              </span>
              <SettingToggle
                checked={settings.auto_deduct_inventory_on_sale}
                onChange={(checked) => setSettings((current) => ({ ...current, auto_deduct_inventory_on_sale: checked }))}
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
              <span>
                <span className="block font-medium text-foreground">Allow Negative Stock</span>
                <span className="mt-1 block text-sm text-muted-foreground">Permit sales or adjustments to continue when stock would pass zero.</span>
              </span>
              <SettingToggle
                checked={settings.allow_negative_stock}
                onChange={(checked) => setSettings((current) => ({ ...current, allow_negative_stock: checked }))}
              />
            </div>

            <label className="block rounded-xl border border-border p-4">
              <span className="mb-2 block font-medium text-foreground">Default Low-stock Threshold</span>
              <input
                type="number"
                value={settings.default_low_stock_threshold}
                onChange={(event) => setSettings((current) => ({ ...current, default_low_stock_threshold: Number(event.target.value) }))}
                className="w-full rounded-xl border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                min="0"
              />
              <span className="mt-2 block text-sm text-muted-foreground">Fallback alert level for items without a custom minimum or reorder point.</span>
            </label>

            <label className="block rounded-xl border border-border p-4">
              <span className="mb-2 block font-medium text-foreground">Default Unit</span>
              <input
                value={settings.default_inventory_unit}
                onChange={(event) => setSettings((current) => ({ ...current, default_inventory_unit: event.target.value }))}
                className="w-full rounded-xl border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="mt-2 block text-sm text-muted-foreground">Fallback unit used across POS and Inventory when an item has none set.</span>
            </label>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <ClipboardCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Reordering, Counts & Pricing Defaults</h2>
            <p className="text-sm text-muted-foreground">Fallback rules used for stock counts, reorder suggestions, and new product pricing.</p>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading settings...</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block rounded-xl border border-border p-4">
              <span className="mb-2 block font-medium text-foreground">Cycle-count Reminder (days)</span>
              <input
                type="number"
                value={settings.cycle_count_interval_days}
                onChange={(event) => setSettings((current) => ({ ...current, cycle_count_interval_days: Number(event.target.value) }))}
                className="w-full rounded-xl border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                min="1"
              />
              <span className="mt-2 block text-sm text-muted-foreground">How often staff should be reminded to do a physical stock count.</span>
            </label>

            <label className="block rounded-xl border border-border p-4">
              <span className="mb-2 block font-medium text-foreground">Auto-reorder Threshold (%)</span>
              <input
                type="number"
                value={settings.auto_reorder_threshold_percent}
                onChange={(event) => setSettings((current) => ({ ...current, auto_reorder_threshold_percent: Number(event.target.value) }))}
                className="w-full rounded-xl border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                min="0"
                max="100"
              />
              <span className="mt-2 block text-sm text-muted-foreground">% above an item's minimum stock at which a reorder is suggested.</span>
            </label>

            <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
              <span>
                <span className="block font-medium text-foreground">Expiry / Batch Tracking</span>
                <span className="mt-1 block text-sm text-muted-foreground">Show expiry-date fields and alerts for perishable items.</span>
              </span>
              <SettingToggle
                checked={settings.enable_expiry_tracking}
                onChange={(checked) => setSettings((current) => ({ ...current, enable_expiry_tracking: checked }))}
              />
            </div>

            <label className="block rounded-xl border border-border p-4">
              <span className="mb-2 block font-medium text-foreground">Default Markup (%)</span>
              <input
                type="number"
                value={settings.default_markup_percent}
                onChange={(event) => setSettings((current) => ({ ...current, default_markup_percent: Number(event.target.value) }))}
                className="w-full rounded-xl border border-border bg-input-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                min="0"
              />
              <span className="mt-2 block text-sm text-muted-foreground">Applied to cost price when adding a product without an explicit selling price.</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
