import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from '../auth/pages/LoginPage';
import { AdminDashboard } from './components/AdminDashboard';
import { SuperadminDashboard } from '../superadmin/pages/SuperadminDashboard';
import { RetailDashboard } from '../retail/pages/RetailDashboard';
import { RetailOrderProvider } from '../retail/context/RetailOrderContext';
import { RetailPOSDashboard } from '../retail/pages/RetailPOSDashboard';
import { RetailCreateOrder } from '../retail/pages/RetailCreateOrder';
import { RetailOrderList } from '../retail/pages/RetailOrderList';
import { RetailReports } from '../retail/pages/RetailReports';
import { POSDashboard } from '../restaurant/pages/POSDashboard';
import { CreateOrder } from '../restaurant/pages/CreateOrder';
import { TableManagement } from '../restaurant/pages/TableManagement';
import { Payment } from '../restaurant/pages/Payment';
import { Receipt } from '../restaurant/pages/Receipt';
import { OrderList } from '../restaurant/pages/OrderList';
import { Reports } from '../restaurant/pages/Reports';
import { StoreInformation } from './components/StoreInformation';
import { StoreSettings } from './components/StoreSettings';
import { ManagerProfile } from './components/ManagerProfile';
import { ActivityLogPage } from './components/ActivityLogPage';
import { InventoryModulePage } from './components/InventoryModulePage';
import { Sidebar } from './components/Sidebar';
import { OrderProvider } from './context/OrderContext';
import { TableProvider } from './context/TableContext';
import { StoreSettingsProvider, useStoreSettings } from './context/StoreSettingsContext';
import { getApiBaseUrl } from '../auth/services/auth';
import type { AuthenticatedUser } from '../auth/types/auth';
import { getDefaultStoreLogo } from './utils/defaultStoreLogo';
import { AppAlertProvider } from './components/AppAlertProvider';
import { appQueryClient } from '../query/appQueryClient';

const SESSION_USER_KEY = 'bukolabs-pos-current-user';
const SESSION_PAGE_KEY = 'bukolabs-pos-current-page';
const INVENTORY_MODULES_ENABLED = import.meta.env.VITE_ENABLE_INVENTORY_MODULES !== 'false';

export type Page =
  | 'login'
  | 'superadmin-dashboard'
  | 'admin-dashboard'
  | 'retail-dashboard'
  | 'retail-pos-dashboard'
  | 'retail-sales'
  | 'retail-transactions'
  | 'retail-reports'
  | 'pos-dashboard'
  | 'create-order'
  | 'table-management'
  | 'payment'
  | 'receipt'
  | 'order-list'
  | 'reports'
  | 'activity-log'
  | 'store-information'
  | 'store-settings'
  | 'manager-profile'
  | 'inventory-dashboard'
  | 'inventory-stock-alerts'
  | 'inventory-items'
  | 'inventory-product-management'
  | 'inventory-purchase-orders'
  | 'inventory-products-received'
  | 'inventory-pos-kitchen'
  | 'inventory-recipe-bom'
  | 'inventory-item-bundling'
  | 'inventory-sales-history'
  | 'inventory-transfers'
  | 'inventory-multilocation'
  | 'inventory-reports'
  | 'inventory-user-management';

export interface StoreBrand {
  name: string | null;
  logo: string | null;
  business_description?: string | null;
  address?: string | null;
  contact_number?: string | null;
  email?: string | null;
  receipt_thank_you_message?: string | null;
  receipt_footer_message?: string | null;
  operating_hours?: string | null;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('login');
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [storeBrand, setStoreBrand] = useState<StoreBrand>({ name: null, logo: null });

  useEffect(() => {
    const savedUser = window.sessionStorage.getItem(SESSION_USER_KEY);
    if (!savedUser) return;

    try {
      const parsedUser = JSON.parse(savedUser) as AuthenticatedUser;
      const savedPage = window.sessionStorage.getItem(SESSION_PAGE_KEY) as Page | null;
      const defaultPage = getDefaultPageForUser(parsedUser);
      const normalizedSavedPage = savedPage && savedPage !== 'login' ? normalizePageForUserStore(parsedUser, savedPage) : savedPage;
      const nextPage = normalizedSavedPage && normalizedSavedPage !== 'login' && canAccessPage(parsedUser, normalizedSavedPage) ? normalizedSavedPage : defaultPage;
      setCurrentUser(parsedUser);
      setCurrentPage(nextPage);
      window.sessionStorage.setItem(SESSION_PAGE_KEY, nextPage);
    } catch {
      window.sessionStorage.removeItem(SESSION_USER_KEY);
      window.sessionStorage.removeItem(SESSION_PAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const loadStoreBrand = async () => {
      if (!currentUser?.id || currentUser.role === 'SUPERADMIN') {
        setStoreBrand({ name: null, logo: null });
        return;
      }

      const defaultLogo = getDefaultStoreLogo(currentUser.store_type);
      const shouldUseStrictDefaultLogo = currentUser.store_type === 'RESTAURANT' || currentUser.store_type === 'RETAIL_STORE';

      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/store-information?admin_user_id=${currentUser.id}`);
        const data = await response.json();

        if (response.ok) {
          setStoreBrand({
            name: data.business_name ?? currentUser.store_name ?? null,
            logo: shouldUseStrictDefaultLogo ? defaultLogo : data.logo || defaultLogo,
            business_description: data.business_description ?? null,
            address: data.address ?? null,
            contact_number: data.contact_number ?? null,
            email: data.email ?? null,
            receipt_thank_you_message: data.receipt_thank_you_message ?? null,
            receipt_footer_message: data.receipt_footer_message ?? null,
            operating_hours: data.operating_hours ?? null,
          });
        }
      } catch {
        setStoreBrand({ name: currentUser.store_name ?? null, logo: defaultLogo });
      }
    };

    void loadStoreBrand();
  }, [currentUser?.id, currentUser?.role, currentUser?.store_name, currentUser?.store_type]);

  useEffect(() => {
    if (isInventoryPage(currentPage) && !INVENTORY_MODULES_ENABLED) {
      setCurrentPage(currentUser ? getDefaultPageForUser(currentUser) : 'login');
      window.sessionStorage.removeItem(SESSION_PAGE_KEY);
    }
  }, [currentPage, currentUser]);

  const handleLogin = (user: AuthenticatedUser) => {
    setCurrentUser(user);
    window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));

    if (user.role === 'SUPERADMIN') {
      navigateTo('superadmin-dashboard');
      return;
    }

    if (isPosManagerUser(user) || isInventoryManagerUser(user)) {
      navigateTo(getDefaultPageForUser(user));
      return;
    }

    if (user.role === 'STAFF' && user.store_type === 'RETAIL_STORE') {
      navigateTo(getDefaultPageForUser(user));
      return;
    }

    if (user.role === 'STAFF' && user.store_type === 'RESTAURANT') {
      navigateTo(getDefaultPageForUser(user));
      return;
    }

    navigateTo('login');
  };

  const handleLogout = () => {
    if (currentUser?.id) {
      void fetch(`${getApiBaseUrl()}/admin/activity-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          module: 'Authentication',
          action: 'User Logged Out',
          details: 'User logged out of the POS system.',
        }),
      }).catch(() => undefined);
    }
    window.sessionStorage.removeItem(SESSION_USER_KEY);
    window.sessionStorage.removeItem(SESSION_PAGE_KEY);
    setCurrentUser(null);
    setCurrentPage('login');
    setCurrentOrder(null);
    setStoreBrand({ name: null, logo: null });
  };

  const navigateTo = (page: Page) => {
    if (page === 'inventory-user-management') {
      page = 'admin-dashboard';
    }

    if (currentUser) {
      page = normalizePageForUserStore(currentUser, page);
    }

    if (isInventoryPage(page) && !INVENTORY_MODULES_ENABLED) {
      page = currentUser ? getDefaultPageForUser(currentUser) : 'login';
    }

    if (currentUser && page !== 'login' && !canAccessPage(currentUser, page)) {
      page = getDefaultPageForUser(currentUser);
    }

    if (page === 'login') {
      window.sessionStorage.removeItem(SESSION_PAGE_KEY);
    } else {
      window.sessionStorage.setItem(SESSION_PAGE_KEY, page);
    }
    setCurrentPage(page);
  };

  // Bridge the restaurant inventory's in-page navigation events (e.g. the
  // Dashboard "Go to Purchase Orders" button) to the merged shell's router.
  // The standalone listener lived in the now-unused inventory app shell.
  useEffect(() => {
    const RESTAURANT_NAV_MAP: Record<string, Page> = {
      'restaurant-purchase-orders': 'inventory-purchase-orders',
      'restaurant-food-inventory': 'inventory-items',
      'restaurant-stock-alerts': 'inventory-stock-alerts',
      'restaurant-pos-kitchen': 'inventory-pos-kitchen',
    };
    const handleRestaurantNavigate = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const page = RESTAURANT_NAV_MAP[detail];
      if (page) navigateTo(page);
    };
    window.addEventListener('restaurant-navigate', handleRestaurantNavigate);
    return () => window.removeEventListener('restaurant-navigate', handleRestaurantNavigate);
  }, [currentUser]);

  const updateCurrentUser = (updates: Partial<AuthenticatedUser>) => {
    setCurrentUser((user) => (user ? { ...user, ...updates } : user));
  };
  const isStoreAdminUser = currentUser?.role === 'ADMIN';

  return (
    <QueryClientProvider client={appQueryClient}>
      <div className="size-full bg-background">
        <StoreSettingsProvider currentUser={currentUser}>
          <AppAlertProvider>
            <OrderProvider currentUser={currentUser}>
              <TableProvider currentUser={currentUser}>
          {currentPage === 'login' && (
            <LoginPage onLogin={handleLogin} />
          )}
          {currentPage === 'superadmin-dashboard' && (
            <SuperadminDashboard currentUser={currentUser} onLogout={handleLogout} onNavigate={navigateTo} />
          )}
          {currentPage === 'admin-dashboard' && (
            currentUser?.role === 'ADMIN' ? (
              <AdminDashboard currentUser={currentUser} storeBrand={storeBrand} onLogout={handleLogout} onNavigate={navigateTo} />
            ) : (
              <UnauthorizedPage currentUser={currentUser} storeBrand={storeBrand} onLogout={handleLogout} onNavigate={navigateTo} />
            )
          )}
          {currentPage === 'retail-dashboard' && (
            <RetailDashboard currentUser={currentUser} onLogout={handleLogout} onNavigate={navigateTo} storeBrand={storeBrand} userName={currentUser?.full_name} storeType={currentUser?.store_type} staffType={currentUser?.staff_type} />
          )}
          {(currentPage === 'retail-pos-dashboard' || currentPage === 'retail-sales' || currentPage === 'retail-transactions' || currentPage === 'retail-reports') && (
            <RetailOrderProvider currentUser={currentUser}>
              {currentPage === 'retail-pos-dashboard' && (
                <RetailPOSDashboard
                  onLogout={handleLogout}
                  onNavigate={navigateTo}
                  isAdmin={isStoreAdminUser}
                  storeBrand={storeBrand}
                  userName={currentUser?.full_name}
                  userRole={currentUser?.role}
                  storeType={currentUser?.store_type}
                  staffType={currentUser?.staff_type}
                />
              )}
              {currentPage === 'retail-sales' && (
                <RetailCreateOrder
                  currentUser={currentUser}
                  onNavigate={navigateTo}
                  onOrderCreated={setCurrentOrder}
                  onLogout={handleLogout}
                  storeBrand={storeBrand}
                  userName={currentUser?.full_name}
                  userRole={currentUser?.role}
                  storeType={currentUser?.store_type}
                  staffType={currentUser?.staff_type}
                />
              )}
              {currentPage === 'retail-transactions' && (
                <RetailOrderList
                  onNavigate={navigateTo}
                  onLogout={handleLogout}
                  isAdmin={isStoreAdminUser}
                  storeBrand={storeBrand}
                  userName={currentUser?.full_name}
                  userRole={currentUser?.role}
                  storeType={currentUser?.store_type}
                  staffType={currentUser?.staff_type}
                />
              )}
              {currentPage === 'retail-reports' && (
                <RetailReports
                  onNavigate={navigateTo}
                  onLogout={handleLogout}
                  isAdmin={isStoreAdminUser}
                  storeBrand={storeBrand}
                  userName={currentUser?.full_name}
                  userRole={currentUser?.role}
                  storeType={currentUser?.store_type}
                  staffType={currentUser?.staff_type}
                />
              )}
            </RetailOrderProvider>
          )}
          {currentPage === 'pos-dashboard' && (
            <POSDashboard onLogout={handleLogout} onNavigate={navigateTo} isAdmin={isStoreAdminUser} storeBrand={storeBrand} userName={currentUser?.full_name} userRole={currentUser?.role} storeType={currentUser?.store_type} staffType={currentUser?.staff_type} />
          )}
          {currentPage === 'create-order' && (
            <CreateOrder currentUser={currentUser} onNavigate={navigateTo} onOrderCreated={setCurrentOrder} onLogout={handleLogout} storeBrand={storeBrand} userName={currentUser?.full_name} storeType={currentUser?.store_type} staffType={currentUser?.staff_type} />
          )}
          {currentPage === 'table-management' && (
            <TableManagementRoute
              currentUser={currentUser}
              currentOrder={currentOrder}
              onNavigate={navigateTo}
              onLogout={handleLogout}
              storeBrand={storeBrand}
            />
          )}
          {currentPage === 'payment' && (
            <Payment currentUser={currentUser} onNavigate={navigateTo} currentOrder={currentOrder} onLogout={handleLogout} storeBrand={storeBrand} userName={currentUser?.full_name} storeType={currentUser?.store_type} staffType={currentUser?.staff_type} />
          )}
          {currentPage === 'receipt' && (
            <Receipt onNavigate={navigateTo} currentOrder={currentOrder} onLogout={handleLogout} storeBrand={storeBrand} userName={currentUser?.full_name} storeType={currentUser?.store_type} staffType={currentUser?.staff_type} />
          )}
          {currentPage === 'order-list' && (
            <OrderList onNavigate={navigateTo} onLogout={handleLogout} isAdmin={isStoreAdminUser} storeBrand={storeBrand} userName={currentUser?.full_name} userRole={currentUser?.role} storeType={currentUser?.store_type} staffType={currentUser?.staff_type} />
          )}
          {currentPage === 'reports' && (
            <Reports onNavigate={navigateTo} onLogout={handleLogout} isAdmin={isStoreAdminUser} storeBrand={storeBrand} userName={currentUser?.full_name} userRole={currentUser?.role} storeType={currentUser?.store_type} staffType={currentUser?.staff_type} />
          )}
          {currentPage === 'activity-log' && (
            <ActivityLogPage currentUser={currentUser} storeBrand={storeBrand} onLogout={handleLogout} onNavigate={navigateTo} />
          )}
          {currentPage === 'store-information' && (
            <StoreInformation
              currentUser={currentUser}
              onLogout={handleLogout}
              onNavigate={navigateTo}
              onUserUpdate={updateCurrentUser}
              onStoreBrandUpdate={setStoreBrand}
              storeBrand={storeBrand}
            />
          )}
          {currentPage === 'store-settings' && (
            <StoreSettings currentUser={currentUser} storeBrand={storeBrand} onLogout={handleLogout} onNavigate={navigateTo} />
          )}
          {currentPage === 'manager-profile' && (
            <ManagerProfile currentUser={currentUser} storeBrand={storeBrand} onLogout={handleLogout} onNavigate={navigateTo} onUserUpdate={updateCurrentUser} />
          )}
          {isInventoryPage(currentPage) && INVENTORY_MODULES_ENABLED && (
            <div className="flex h-screen">
              <div className="shrink-0">
                <Sidebar
                  currentPage={currentPage}
                  storeBrand={storeBrand}
                  onLogout={handleLogout}
                  onNavigate={navigateTo}
                  isAdmin={isStoreAdminUser}
                  userName={currentUser?.full_name}
                  userRole={currentUser?.role}
                  storeType={currentUser?.store_type}
                  staffType={currentUser?.staff_type}
                  inventoryEnabled={INVENTORY_MODULES_ENABLED}
                />
              </div>
              <InventoryModulePage currentPage={currentPage} currentUser={currentUser} onNavigate={navigateTo} />
            </div>
          )}
              </TableProvider>
            </OrderProvider>
          </AppAlertProvider>
        </StoreSettingsProvider>
      </div>
    </QueryClientProvider>
  );
}

function getDefaultPageForUser(user: AuthenticatedUser): Page {
  if (user.role === 'SUPERADMIN') return 'superadmin-dashboard';
  if (isInventoryManagerUser(user)) return INVENTORY_MODULES_ENABLED ? 'inventory-dashboard' : 'login';
  if (isPosManagerUser(user) && user.store_type === 'RETAIL_STORE') return 'retail-pos-dashboard';
  if (isPosManagerUser(user) && user.store_type === 'RESTAURANT') return 'pos-dashboard';
  if (INVENTORY_MODULES_ENABLED && user.role === 'STAFF' && user.staff_type === 'INVENTORY_STAFF') return 'inventory-dashboard';
  if (user.store_type === 'RETAIL_STORE') return 'retail-pos-dashboard';
  if (user.store_type === 'RESTAURANT') return 'pos-dashboard';
  return 'login';
}

function isPosManagerUser(user: AuthenticatedUser | null | undefined) {
  if (!user) return false;
  if (user.role === 'POS_MANAGER' || user.role === 'POS_ADMIN') return true;
  return user.role === 'ADMIN' && user.staff_type !== 'INVENTORY_STAFF';
}

function isActualPosManagerUser(user: AuthenticatedUser | null | undefined) {
  return user?.role === 'POS_MANAGER' || user?.role === 'POS_ADMIN';
}

function isInventoryManagerUser(user: AuthenticatedUser | null | undefined) {
  if (!user) return false;
  if (user.role === 'INVENTORY_MANAGER' || user.role === 'INVENTORY_ADMIN') return true;
  return user.role === 'ADMIN' && user.staff_type === 'INVENTORY_STAFF';
}

function normalizePageForUserStore(user: AuthenticatedUser, page: Page): Page {
  if (user.store_type === 'RETAIL_STORE' && page === 'reports') return 'retail-reports';
  if (user.store_type === 'RESTAURANT' && page === 'retail-reports') return 'reports';
  return page;
}

function isInventoryPage(page: Page) {
  return page.startsWith('inventory-');
}

function canAccessPage(user: AuthenticatedUser, page: Page) {
  if (page === 'inventory-user-management') {
    return false;
  }

  if (isInventoryPage(page) && !INVENTORY_MODULES_ENABLED) {
    return false;
  }

  if (page === 'login') return true;
  if (user.role === 'SUPERADMIN') return page === 'superadmin-dashboard' || page === 'activity-log';
  if (page === 'manager-profile') {
    return user.store_type === 'RETAIL_STORE' && isActualPosManagerUser(user);
  }
  if (page === 'activity-log') {
    return (user.store_type === 'RESTAURANT' || user.store_type === 'RETAIL_STORE') && (user.role === 'ADMIN' || isActualPosManagerUser(user));
  }
  if (user.role === 'ADMIN') {
    return [
      'admin-dashboard',
      'activity-log',
      'store-information',
      'store-settings',
    ].includes(page) || isManagerPosPageForStore(user, page) || isInventoryPage(page);
  }

  if (isPosManagerUser(user)) {
    return isManagerPosPageForStore(user, page) || [
      'activity-log',
      'store-information',
      'store-settings',
    ].includes(page);
  }

  if (isInventoryManagerUser(user)) {
    return isInventoryPage(page);
  }

  if (user.staff_type === 'INVENTORY_STAFF') {
    return isInventoryPage(page);
  }

  return isPosPageForStore(user, page);
}

function isManagerPosPageForStore(user: AuthenticatedUser, page: Page) {
  if (user.store_type === 'RETAIL_STORE') {
    return [
      'retail-pos-dashboard',
      'retail-transactions',
      'retail-reports',
    ].includes(page);
  }

  if (user.store_type === 'RESTAURANT') {
    return [
      'pos-dashboard',
      'order-list',
      'reports',
    ].includes(page);
  }

  return [
    'retail-pos-dashboard',
    'retail-transactions',
    'retail-reports',
    'pos-dashboard',
    'order-list',
    'reports',
  ].includes(page);
}

function isPosPageForStore(user: AuthenticatedUser, page: Page) {
  if (user.store_type === 'RETAIL_STORE') {
    return [
      'retail-dashboard',
      'retail-pos-dashboard',
      'retail-sales',
      'retail-transactions',
      'retail-reports',
    ].includes(page);
  }

  if (user.store_type === 'RESTAURANT') {
    return [
      'pos-dashboard',
      'create-order',
      'table-management',
      'payment',
      'receipt',
      'order-list',
      'reports',
    ].includes(page);
  }

  return isPosPage(page);
}

function isPosPage(page: Page) {
  return [
    'retail-dashboard',
    'retail-pos-dashboard',
    'retail-sales',
    'retail-transactions',
    'retail-reports',
    'pos-dashboard',
    'create-order',
    'table-management',
    'payment',
    'receipt',
    'order-list',
    'reports',
  ].includes(page);
}

function TableManagementRoute({
  currentUser,
  currentOrder,
  onNavigate,
  onLogout,
  storeBrand,
}: {
  currentUser: AuthenticatedUser | null;
  currentOrder: any;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  storeBrand: StoreBrand;
}) {
  const { settings } = useStoreSettings();

  useEffect(() => {
    if (!settings.enable_table_management) {
      onNavigate('pos-dashboard');
    }
  }, [settings.enable_table_management, onNavigate]);

  if (!settings.enable_table_management) {
    return (
      <POSDashboard
        onLogout={onLogout}
        onNavigate={onNavigate}
        isAdmin={currentUser?.role === 'ADMIN'}
        storeBrand={storeBrand}
        userName={currentUser?.full_name}
        storeType={currentUser?.store_type}
        staffType={currentUser?.staff_type}
      />
    );
  }

  return (
    <TableManagement
      onNavigate={onNavigate}
      currentOrder={currentOrder}
      onLogout={onLogout}
      storeBrand={storeBrand}
      userName={currentUser?.full_name}
      storeType={currentUser?.store_type}
      staffType={currentUser?.staff_type}
    />
  );
}

function UnauthorizedPage({
  currentUser,
  storeBrand,
  onLogout,
  onNavigate,
}: {
  currentUser: AuthenticatedUser | null;
  storeBrand: StoreBrand;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
}) {
  useEffect(() => {
    if (currentUser) {
      onNavigate(getDefaultPageForUser(currentUser));
    }
  }, [currentUser, onNavigate]);

  return (
    <div className="flex h-screen">
      <Sidebar
        currentPage="pos-dashboard"
        onNavigate={onNavigate}
        onLogout={onLogout}
        isAdmin={currentUser?.role === 'ADMIN'}
        storeBrand={storeBrand}
        userName={currentUser?.full_name}
        userRole={currentUser?.role}
        storeType={currentUser?.store_type}
        staffType={currentUser?.staff_type}
        inventoryEnabled={INVENTORY_MODULES_ENABLED}
      />
      <div className="flex-1 bg-background" />
    </div>
  );
}
