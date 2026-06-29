import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
import { GeneralSettings } from './components/GeneralSettings';
import { ManagerProfile } from './components/ManagerProfile';
import { ActivityLogPage } from './components/ActivityLogPage';
import { InventoryModulePage } from './components/InventoryModulePage';
import { Sidebar } from './components/Sidebar';
import { OrderProvider } from './context/OrderContext';
import { TableProvider } from './context/TableContext';
import { StoreSettingsProvider, useStoreSettings } from './context/StoreSettingsContext';
import { getApiBaseUrl, getCurrentSession, logout as logoutSession } from '../auth/services/auth';
import type { AuthenticatedUser } from '../auth/types/auth';
import { getDefaultStoreLogo } from './utils/defaultStoreLogo';
import { AppAlertProvider } from './components/AppAlertProvider';
import { appQueryClient } from '../query/appQueryClient';
import { applyUserPreferences, fromRemoteThemePreferences, fromRemoteUserPreferences, loadUserPreferences, mergeUserPreferencesWithTheme, saveUserPreferences } from './utils/themePreferences';

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
  | 'general-settings'
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
  | 'inventory-user-management'
  | 'inventory-settings';

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
  const [authRestoring, setAuthRestoring] = useState(true);

  useEffect(() => {
    if (!currentUser?.id) {
      applyUserPreferences(loadUserPreferences(null));
      return;
    }

    const cachedPreferences = loadUserPreferences(currentUser.id);
    applyUserPreferences(cachedPreferences);

    let cancelled = false;
    const loadThemePreferences = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/admin/theme-preferences`);
        if (!response.ok) throw new Error('Unable to load theme preferences.');
        const data = await response.json();
        if (cancelled) return;

        const personalPreferences = fromRemoteUserPreferences(data.user_preferences);
        const effectiveTheme = fromRemoteThemePreferences(data.effective_theme);
        const effectivePreferences = personalPreferences ?? mergeUserPreferencesWithTheme(cachedPreferences, effectiveTheme);
        applyUserPreferences(effectivePreferences);
        saveUserPreferences(currentUser.id, effectivePreferences);
      } catch {
        if (!cancelled) applyUserPreferences(cachedPreferences);
      }
    };

    void loadThemePreferences();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    const savedUser = window.sessionStorage.getItem(SESSION_USER_KEY);
    const restore = async () => {
      try {
        const user = await getCurrentSession();
        const savedPage = window.sessionStorage.getItem(SESSION_PAGE_KEY) as Page | null;
        setCurrentUser(user);
        window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
        setCurrentPage(savedPage && savedPage !== 'login' && canAccessPage(user, savedPage) ? savedPage : getDefaultPageForUser(user));
      } catch {
        window.sessionStorage.removeItem(SESSION_USER_KEY);
        window.sessionStorage.removeItem(SESSION_PAGE_KEY);
        if (savedUser) {
          setCurrentUser(null);
          setCurrentPage('login');
        }
      } finally {
        setAuthRestoring(false);
      }
    };

    void restore();
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      handleLogout();
    };
    window.addEventListener('auth-session-expired', handleExpired);
    return () => window.removeEventListener('auth-session-expired', handleExpired);
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
        const response = await fetch(`${getApiBaseUrl()}/admin/store-information`);
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
    void logoutSession();
    window.sessionStorage.removeItem(SESSION_USER_KEY);
    window.sessionStorage.removeItem(SESSION_PAGE_KEY);
    setCurrentUser(null);
    setCurrentPage('login');
    setCurrentOrder(null);
    setStoreBrand({ name: null, logo: null });
    setAuthRestoring(false);
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
        {authRestoring ? (
          <AuthRestoringScreen />
        ) : (
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
          {currentPage === 'general-settings' && (
            <GeneralSettings currentUser={currentUser} storeBrand={storeBrand} onLogout={handleLogout} onNavigate={navigateTo} />
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
        )}
      </div>
    </QueryClientProvider>
  );
}

function AuthRestoringScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span>Restoring session...</span>
      </div>
    </div>
  );
}

function getDefaultPageForUser(user: AuthenticatedUser): Page {
  if (user.role === 'SUPERADMIN') return 'superadmin-dashboard';
  if (user.role === 'ADMIN') return getAdminDefaultWorkspacePage(user);
  if (isInventoryManagerUser(user)) return INVENTORY_MODULES_ENABLED ? 'inventory-dashboard' : 'login';
  if (isPosManagerUser(user) && user.store_type === 'RETAIL_STORE') return 'retail-pos-dashboard';
  if (isPosManagerUser(user) && user.store_type === 'RESTAURANT') return 'pos-dashboard';
  if (INVENTORY_MODULES_ENABLED && user.role === 'STAFF' && user.staff_type === 'INVENTORY_STAFF') return 'inventory-dashboard';
  if (user.store_type === 'RETAIL_STORE') return 'retail-pos-dashboard';
  if (user.store_type === 'RESTAURANT') return 'pos-dashboard';
  return 'login';
}

function getAdminDefaultWorkspacePage(user: AuthenticatedUser): Page {
  const { defaultWorkspace } = loadUserPreferences(user.id);

  if (defaultWorkspace === 'inventory') {
    return INVENTORY_MODULES_ENABLED ? 'inventory-dashboard' : getAdminPosDefaultPage(user);
  }

  if (defaultWorkspace === 'reports') {
    return user.store_type === 'RETAIL_STORE' ? 'retail-reports' : 'reports';
  }

  return getAdminPosDefaultPage(user);
}

function getAdminPosDefaultPage(user: AuthenticatedUser): Page {
  return user.store_type === 'RETAIL_STORE' ? 'retail-pos-dashboard' : 'pos-dashboard';
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
  if (page === 'general-settings') return true;
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
