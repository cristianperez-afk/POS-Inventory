import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Info, Mail, MapPin, Phone, Save, Trash2, Upload } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Page, type StoreBrand } from '../App';
import { getApiBaseUrl } from '../../auth/services/auth';
import type { AuthenticatedUser } from '../../auth/types/auth';
import { useStoreSettings } from '../context/StoreSettingsContext';
import { ThermalReceipt } from './ThermalReceipt';
import { ThermalReceipt as RetailThermalReceipt } from '../../retail/pages/RetailThermalReceipt';
import { getDefaultStoreLogo, getStoreLogoForWhiteBackground } from '../utils/defaultStoreLogo';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface StoreInformationData {
  id: number;
  store_id: number;
  business_name: string;
  business_description: string | null;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  logo: string | null;
  receipt_thank_you_message: string | null;
  receipt_footer_message: string | null;
  operating_hours: string | null;
  currency: string | null;
  theme_color: string | null;
}

interface StoreInformationProps {
  currentUser: AuthenticatedUser | null;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
  onUserUpdate: (updates: Partial<AuthenticatedUser>) => void;
  onStoreBrandUpdate: (brand: StoreBrand) => void;
  storeBrand?: StoreBrand;
}

const defaultStoreInfo: StoreInformationData = {
  id: 0,
  store_id: 0,
  business_name: 'Ukay Hub - Main Branch',
  business_description: 'Your one-stop shop for quality ukay-ukay finds! We offer affordable and stylish pre-loved items for the whole family.',
  address: '123 Sampaguita St., Barangay Guadalupe, Cebu City, Cebu, Philippines',
  contact_number: '0917 123 4567',
  email: 'ukayhub.main@gmail.com',
  logo: null,
  receipt_thank_you_message: 'Thank you for shopping with us!',
  receipt_footer_message: 'We appreciate your support. Come again!',
  operating_hours: 'Mon-Sun, 9:00 AM - 8:00 PM',
  currency: 'PHP',
  theme_color: '#008967',
};

export function StoreInformation({ currentUser, onLogout, onNavigate, onUserUpdate, onStoreBrandUpdate, storeBrand }: StoreInformationProps) {
  const { settings, discounts } = useStoreSettings();
  const defaultLogo = getDefaultStoreLogo(currentUser?.store_type);
  const [storeInfo, setStoreInfo] = useState<StoreInformationData>(defaultStoreInfo);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showRemoveLogoConfirm, setShowRemoveLogoConfirm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadStoreInformation = async () => {
      if (!currentUser?.id) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/store-information?admin_user_id=${currentUser.id}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message ?? 'Unable to load store information.');
        }

        setStoreInfo(normalizeStoreInfo(data));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load store information.');
      } finally {
        setLoading(false);
      }
    };

    void loadStoreInformation();
  }, [currentUser?.id]);

  const updateField = (field: keyof StoreInformationData, value: string | number | null) => {
    setStoreInfo((current) => ({ ...current, [field]: value }));
    setMessage('');
    setError('');
  };

  const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Logo must be 2MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => updateField('logo', String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentUser?.id) {
      setError('No admin session was found.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/store-information`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_user_id: currentUser.id,
          business_name: storeInfo.business_name,
          business_description: textOrNull(storeInfo.business_description),
          address: textOrNull(storeInfo.address),
          contact_number: textOrNull(storeInfo.contact_number),
          email: textOrNull(storeInfo.email),
          logo: storeInfo.logo,
          receipt_thank_you_message: textOrNull(storeInfo.receipt_thank_you_message),
          receipt_footer_message: textOrNull(storeInfo.receipt_footer_message),
          operating_hours: textOrNull(storeInfo.operating_hours),
          currency: textOrNull(storeInfo.currency),
          theme_color: textOrNull(storeInfo.theme_color),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message ?? 'Unable to save store information.');
      }

      const normalized = normalizeStoreInfo(data);
      setStoreInfo(normalized);
      onUserUpdate({ store_name: normalized.business_name });
      onStoreBrandUpdate({
        name: normalized.business_name,
        logo: shouldUseStrictDefaultLogo(currentUser.store_type) ? defaultLogo : normalized.logo || defaultLogo,
        business_description: normalized.business_description,
        address: normalized.address,
        contact_number: normalized.contact_number,
        email: normalized.email,
        receipt_thank_you_message: normalized.receipt_thank_you_message,
        receipt_footer_message: normalized.receipt_footer_message,
        operating_hours: normalized.operating_hours,
      });
      setMessage('Store information saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save store information.');
    } finally {
      setSaving(false);
    }
  };

  const displayLogo = storeInfo.logo || defaultLogo;
  const enforcedDisplayLogo = shouldUseStrictDefaultLogo(currentUser?.store_type) ? defaultLogo : displayLogo;
  const whiteBackgroundLogo = getStoreLogoForWhiteBackground(enforcedDisplayLogo, currentUser?.store_type);
  const logoPreview = (
    <img src={whiteBackgroundLogo} alt={storeInfo.business_name} className="h-full w-full object-contain" />
  );
  const sampleSubtotal = 370;
  const sampleDiscount = settings.enable_discount ? 20 : 0;
  const sampleServiceCharge = settings.enable_service_charge ? (sampleSubtotal - sampleDiscount) * (settings.service_charge_rate / 100) : 0;
  const sampleTax = 0;
  const sampleTotal = sampleSubtotal - sampleDiscount + sampleServiceCharge;
  const sampleDiscountName = discounts.find((discount) => discount.is_enabled && /senior/i.test(discount.discount_name))?.discount_name
    ?? discounts.find((discount) => discount.is_enabled)?.discount_name
    ?? 'Senior Citizen';
  const previewStoreBrand = {
    name: storeInfo.business_name,
    logo: enforcedDisplayLogo,
    business_description: storeInfo.business_description,
    address: storeInfo.address,
    contact_number: storeInfo.contact_number,
    email: storeInfo.email,
    receipt_thank_you_message: storeInfo.receipt_thank_you_message,
    receipt_footer_message: storeInfo.receipt_footer_message,
    operating_hours: storeInfo.operating_hours,
  };
  const isRetailStore = currentUser?.store_type === 'RETAIL_STORE';

  return (
    <div className="flex h-screen">
      <Sidebar currentPage="store-information" onNavigate={onNavigate} onLogout={onLogout} isAdmin storeBrand={storeBrand} userName={currentUser?.full_name} storeType={currentUser?.store_type} />

      <div className="flex-1 overflow-auto bg-background">
        <main className="p-6">
          {loading ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading store information...</div>
          ) : (
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="space-y-5">
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <div className="mb-6 flex items-center justify-between gap-4">
                    <h2 className="text-lg text-primary">Business Information</h2>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>

                  {(error || message) && (
                    <div className={`mb-5 rounded-lg border p-3 text-sm ${error ? 'border-destructive/20 bg-destructive/10 text-destructive' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                      {error || message}
                    </div>
                  )}

                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-primary">Business Name <span className="text-red-500">*</span></label>
                      <input
                        value={storeInfo.business_name}
                        onChange={(event) => updateField('business_name', event.target.value)}
                        required
                        maxLength={150}
                        className="w-full rounded-lg border border-border bg-input-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-primary">Business Description</label>
                      <textarea
                        value={storeInfo.business_description ?? ''}
                        onChange={(event) => updateField('business_description', event.target.value)}
                        rows={4}
                        className="w-full resize-y rounded-lg border border-border bg-input-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-primary">Logo</label>
                      <div className="flex flex-wrap gap-4">
                        <div className="flex h-36 w-36 items-center justify-center rounded-lg border border-border bg-white p-4">
                          {logoPreview}
                        </div>
                        <label className="flex h-36 min-w-64 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center transition-colors hover:bg-muted/40">
                          <Upload className="mb-2 h-5 w-5 text-primary" />
                          <span className="text-sm font-medium text-primary">Click to upload logo</span>
                          <span className="mt-1 text-xs text-muted-foreground">PNG, JPG or SVG. Max size 2MB</span>
                          <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogoUpload} className="hidden" />
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowRemoveLogoConfirm(true)}
                          className="self-end rounded-lg border border-border px-4 py-2 text-sm text-primary transition-colors hover:bg-muted"
                        >
                          <span className="flex items-center gap-2"><Trash2 className="h-4 w-4 text-destructive" /> Remove Logo</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <TextInput label="Contact Number" value={storeInfo.contact_number ?? ''} onChange={(value) => updateField('contact_number', value)} maxLength={50} />
                      <TextInput label="Email" type="email" value={storeInfo.email ?? ''} onChange={(value) => updateField('email', value)} maxLength={100} />
                    </div>

                    <TextInput label="Address" value={storeInfo.address ?? ''} onChange={(value) => updateField('address', value)} />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <h2 className="mb-5 text-lg text-primary">Receipt Settings</h2>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-primary">Thank You Message</label>
                      <textarea
                        value={storeInfo.receipt_thank_you_message ?? ''}
                        onChange={(event) => updateField('receipt_thank_you_message', event.target.value)}
                        rows={3}
                        className="w-full resize-y rounded-lg border border-border bg-input-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-primary">Footer Message</label>
                      <textarea
                        value={storeInfo.receipt_footer_message ?? ''}
                        onChange={(event) => updateField('receipt_footer_message', event.target.value)}
                        rows={3}
                        className="w-full resize-y rounded-lg border border-border bg-input-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <h2 className="mb-5 text-lg text-primary">Store Settings</h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextInput label="Operating Hours" value={storeInfo.operating_hours ?? ''} onChange={(value) => updateField('operating_hours', value)} maxLength={100} />
                    <TextInput label="Currency" value={storeInfo.currency ?? ''} onChange={(value) => updateField('currency', value.toUpperCase())} maxLength={20} />
                    <div>
                      <label className="mb-2 block text-sm font-medium text-primary">Theme Color</label>
                      <div className="flex gap-3">
                        <input
                          type="color"
                          value={storeInfo.theme_color || '#008967'}
                          onChange={(event) => updateField('theme_color', event.target.value)}
                          className="h-10 w-14 rounded-lg border border-border bg-input-background p-1"
                        />
                        <input
                          value={storeInfo.theme_color ?? ''}
                          onChange={(event) => updateField('theme_color', event.target.value)}
                          className="w-full rounded-lg border border-border bg-input-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="space-y-5">
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <h2 className="text-lg text-primary">Receipt Preview</h2>
                  <p className="mt-2 text-sm text-muted-foreground">This is how your receipt header and footer will look.</p>

                  <div className="mt-5 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-lg">
                    {isRetailStore ? (
                      <RetailThermalReceipt
                        orderNumber="RET-2026060910445036"
                        customerName="Walk-in Customer"
                        items={[
                          { name: 'Casual Black Dress', quantity: 1, price: 829, size: 'L', color: 'Black' },
                        ]}
                        subtotal={829}
                        tax={0}
                        discount={0}
                        total={829}
                        cashReceived={830}
                        changeGiven={1}
                        paymentMethod="Cash"
                        date="2026-06-08"
                        time="04:26 AM"
                        receiptId="REC-PREVIEW"
                        paymentId="PAY-PREVIEW"
                        cashier="Staff Name"
                        storeBrand={previewStoreBrand}
                      />
                    ) : (
                      <ThermalReceipt
                        orderNumber="PREVIEW-001"
                        customerName=""
                        orderType="Dine-In"
                        table={null}
                        items={[
                          { name: '----------', quantity: 1, price: 120, itemType: 'dine-in' },
                          { name: '----------', quantity: 1, price: 250, itemType: 'dine-in' },
                        ]}
                        subtotal={sampleSubtotal}
                        serviceFee={sampleServiceCharge}
                        tax={sampleTax}
                        discount={sampleDiscount}
                        discountType={sampleDiscountName}
                        total={sampleTotal}
                        cashReceived={500}
                        changeGiven={500 - sampleTotal}
                        date="2026-05-31"
                        time="10:30 AM"
                        receiptId="REC-PREVIEW"
                        paymentId="PAY-PREVIEW"
                        staffName="Staff Name"
                        storeBrand={previewStoreBrand}
                      />
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-900">
                  <div className="flex gap-3">
                    <Info className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <h3 className="font-medium">Important</h3>
                      <p className="mt-2 text-sm leading-6">
                        These values are saved in store_information and are used for store identity and printed receipt details.
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
            </form>
          )}
        </main>
      </div>
      <DeleteConfirmDialog
        isOpen={showRemoveLogoConfirm}
        title="Confirm Delete"
        description="Are you sure you want to remove this store logo?"
        onCancel={() => setShowRemoveLogoConfirm(false)}
        onConfirm={() => {
          updateField('logo', null);
          setShowRemoveLogoConfirm(false);
        }}
      />
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-primary">{label}</label>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-input-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}

function normalizeStoreInfo(data: Partial<StoreInformationData>): StoreInformationData {
  return {
    ...defaultStoreInfo,
    ...data,
  };
}

function textOrNull(value: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function shouldUseStrictDefaultLogo(storeType?: string | null) {
  return storeType === 'RESTAURANT' || storeType === 'RETAIL_STORE';
}

