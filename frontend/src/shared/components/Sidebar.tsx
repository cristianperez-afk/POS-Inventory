import { useEffect, useState } from 'react';
import { ChevronDown, Home, ShoppingCart, List, BarChart3, LogOut, Users, UtensilsCrossed, Store, ShoppingBag, Info, SlidersHorizontal, Package, PanelLeftClose, PanelLeftOpen, AlertTriangle, Apple, ArrowRightLeft, ChefHat, ClipboardCheck, FileText, Layers, LayoutDashboard, MapPin, PackageCheck, PackageSearch, Receipt, ReceiptText, Settings, Settings2, UserCircle, History } from 'lucide-react';
import { Page, type StoreBrand } from '../App';
import type { StaffType } from '../../auth/types/auth';
import { useStoreSettings } from '../context/StoreSettingsContext';
import { getDefaultStoreLogo } from '../utils/defaultStoreLogo';
import { LogoutConfirmDialog } from './LogoutConfirmDialog';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  isAdmin?: boolean;
  storeBrand?: StoreBrand;
  userName?: string | null;
  userRole?: string | null;
  storeType?: 'RESTAURANT' | 'RETAIL_STORE' | string | null;
  staffType?: StaffType;
  inventoryEnabled?: boolean;
}

type MenuItem = {
  icon: typeof Home;
  label: string;
  page?: Page;
  children?: Array<{
    icon: typeof Home;
    label: string;
    page: Page;
  }>;
};

export function Sidebar({ currentPage, onNavigate, onLogout, isAdmin = false, storeBrand, userName, userRole, storeType = 'RESTAURANT', staffType = 'POS_STAFF', inventoryEnabled = true }: SidebarProps) {
  const SIDEBAR_COLLAPSED_STORAGE_KEY = 'bukolabs-pos-sidebar-collapsed';
  const isRetail = storeType === 'RETAIL_STORE';
  const isPosManagerRole = userRole === 'POS_MANAGER' || userRole === 'POS_ADMIN' || (userRole === 'ADMIN' && staffType !== 'INVENTORY_STAFF');
  const isActualPosManagerRole = userRole === 'POS_MANAGER' || userRole === 'POS_ADMIN';
  const isInventoryManagerRole = userRole === 'INVENTORY_MANAGER' || userRole === 'INVENTORY_ADMIN' || (userRole === 'ADMIN' && staffType === 'INVENTORY_STAFF');
  const canManageStaffAccounts = userRole === 'ADMIN';
  const { settings } = useStoreSettings();

  const storeItems = [
    { icon: Info, label: 'Store Information', page: 'store-information' as Page },
    { icon: SlidersHorizontal, label: 'Store Settings', page: 'store-settings' as Page },
  ];

  const storePages = storeItems.map((item) => item.page);
  const canUsePos = isAdmin || isPosManagerRole || staffType === 'POS_STAFF';
  const canUseInventory = inventoryEnabled && (isAdmin || (!isPosManagerRole && (isInventoryManagerRole || staffType === 'INVENTORY_STAFF')));
  const canViewManagerProfile = isRetail && isActualPosManagerRole;
  const canViewGeneralSettings = Boolean(isAdmin || userRole || userName);
  const inventoryItems = getInventoryItems(isRetail, isAdmin);
  const inventoryPages = inventoryItems.map((item) => item.page);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Store: storePages.includes(currentPage),
    Inventory: inventoryPages.includes(currentPage),
  });
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isCollapsed));
  }, [isCollapsed]);

  const restaurantAdminMenuItems: MenuItem[] = [
    { icon: Home, label: 'Dashboard', page: 'pos-dashboard' as Page },
    { icon: Users, label: 'Staff Accounts', page: 'admin-dashboard' as Page },
    { icon: List, label: 'Transaction', page: 'order-list' as Page },
    { icon: BarChart3, label: 'Reports', page: 'reports' as Page },
    { icon: History, label: 'Activity Log', page: 'activity-log' as Page },
  ];

  const retailAdminMenuItems: MenuItem[] = [
    { icon: Home, label: 'Dashboard', page: 'retail-pos-dashboard' as Page },
    { icon: Users, label: 'Staff Accounts', page: 'admin-dashboard' as Page },
    { icon: List, label: 'Transaction', page: 'retail-transactions' as Page },
    { icon: BarChart3, label: 'Reports', page: 'retail-reports' as Page },
    { icon: History, label: 'Activity Log', page: 'activity-log' as Page },
  ];

  const restaurantStaffMenuItems: MenuItem[] = [
    { icon: Home, label: 'Dashboard', page: 'pos-dashboard' as Page },
    { icon: ShoppingCart, label: 'Create Order', page: 'create-order' as Page },
    { icon: List, label: 'Transaction', page: 'order-list' as Page },
    { icon: UtensilsCrossed, label: 'Tables', page: 'table-management' as Page },
    { icon: BarChart3, label: 'Reports', page: 'reports' as Page },
  ];

  const retailStaffMenuItems: MenuItem[] = [
    { icon: Home, label: 'Dashboard', page: 'retail-pos-dashboard' as Page },
    { icon: ShoppingBag, label: 'Create Order', page: 'retail-sales' as Page },
    { icon: List, label: 'Transactions', page: 'retail-transactions' as Page },
    { icon: BarChart3, label: 'Reports', page: 'retail-reports' as Page },
  ];

  const usesManagerMenu = isAdmin || isActualPosManagerRole;
  const menuItems = usesManagerMenu
    ? (isRetail ? retailAdminMenuItems : restaurantAdminMenuItems)
    : (isRetail ? retailStaffMenuItems : restaurantStaffMenuItems);
  const managementItems: MenuItem[] = usesManagerMenu
    ? [
        { icon: Store, label: 'Store', children: storeItems },
      ]
    : [];
  const visibleMenuItems = canUsePos
    ? menuItems.filter((item) => {
        if (item.page === 'admin-dashboard') return canManageStaffAccounts;
        return item.page !== 'table-management' || settings.enable_table_management;
      })
    : [];
  const flattenedInventoryItems = canUseInventory ? inventoryItems : [];
  const defaultTitle = isRetail ? 'Retail Store' : 'The Restaurant';
  const headerTitle = storeBrand?.name || defaultTitle;
  const defaultLogo = getDefaultStoreLogo(storeType);
  const userRoleLabel = getUserRoleLabel(userRole, isAdmin, staffType, storeType);
  const userSubtitle = userRoleLabel || userName?.trim();
  const closeManagementGroups = () => {
    setOpenGroups({
      Store: false,
      Inventory: false,
    });
  };
  const getMenuButtonClasses = (active: boolean, isOpen: boolean) =>
    active
      ? 'border-primary/25 text-white'
      : isOpen
        ? 'border-white/15 bg-white/10 text-white'
        : 'border-transparent text-white hover:bg-primary/15 hover:text-slate-100';
  const getMenuButtonStyle = (active: boolean, isOpen: boolean) =>
    active
      ? { background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary-accent) 100%)', boxShadow: '0 0 18px color-mix(in srgb, var(--primary) 35%, transparent)' }
      : isOpen
        ? { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }
        : undefined;

  return (
    <div
      className={`sticky top-0 flex h-screen shrink-0 flex-col text-white transition-[width] duration-300 ease-in-out ${isCollapsed ? 'w-20 overflow-visible' : 'w-80 overflow-hidden'}`}
      style={{ background: 'linear-gradient(180deg, var(--sidebar) 0%, var(--primary) 100%)' }}
    >
      <div className={`relative shrink-0 border-b border-white/10 transition-all duration-300 ease-in-out ${isCollapsed ? 'px-3 py-4' : 'px-6 pb-4 pt-5'}`}>
        <button
          type="button"
          onClick={() => setIsCollapsed((value) => !value)}
          className={`z-10 inline-flex items-center justify-center text-slate-300 transition hover:text-slate-100 ${
            isCollapsed ? 'group relative left-1/2 h-10 w-10 -translate-x-1/2' : 'absolute right-3 top-3 h-9 w-9'
          }`}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <>
              <img src={storeBrand?.logo || defaultLogo} alt={headerTitle} className="h-full w-full object-contain transition-opacity duration-150 group-hover:opacity-0" />
              <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <PanelLeftOpen className="h-5 w-5" strokeWidth={1.8} />
              </span>
            </>
          ) : (
            <PanelLeftClose className="h-5 w-5" strokeWidth={1.8} />
          )}
        </button>
        <div className="text-center">
          {!isCollapsed && (
            <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center overflow-hidden bg-transparent transition-all duration-300 ease-in-out">
              <img src={storeBrand?.logo || defaultLogo} alt={headerTitle} className="h-full w-full object-contain" />
            </div>
          )}
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-14 opacity-100'}`}>
            <h2 className="truncate text-lg font-semibold tracking-tight text-white">{headerTitle}</h2>
            <p className="mt-0.5 truncate text-sm leading-tight text-slate-200">{userSubtitle}</p>
          </div>
        </div>
      </div>

      <nav className={`no-scrollbar min-h-0 flex-1 overflow-y-auto py-3 transition-all duration-300 ease-in-out ${isCollapsed ? 'px-3' : 'px-5'}`}>
        <ul className="space-y-0.5">
          {visibleMenuItems.map((item) => {
            const childActive = item.children?.some((child) => child.page === currentPage) ?? false;
            const active = currentPage === item.page || childActive;
            const isOpen = item.children ? openGroups[item.label] : false;
            return (
              <li key={item.page ?? item.label}>
                <button
                  onClick={() => {
                    if (item.children) {
                      setOpenGroups((current) => ({
                        Store: item.label === 'Store' ? !current.Store : false,
                        Inventory: item.label === 'Inventory' ? !current.Inventory : false,
                      }));
                      return;
                    }

                    closeManagementGroups();
                    item.page && onNavigate(item.page);
                  }}
                  className={`flex h-[52px] w-full items-center rounded-lg border transition ${
                    isCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
                  } ${getMenuButtonClasses(active, isOpen)}`}
                  style={getMenuButtonStyle(active, isOpen)}
                >
                  <span className="shrink-0">
                    <item.icon className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                  <span className={`overflow-hidden whitespace-nowrap text-base transition-all duration-300 ease-in-out ${isCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'} ${active ? 'font-semibold' : 'font-medium'}`}>
                    {!isCollapsed && item.label}
                  </span>
                  {item.children && !isCollapsed && (
                    <ChevronDown className={`h-4 w-4 transition ${openGroups[item.label] ? 'rotate-180' : ''}`} strokeWidth={1.8} />
                  )}
                </button>
                {item.children && openGroups[item.label] && (
                  <ul className={`space-y-0.5 py-1 transition-all duration-300 ease-in-out ${isCollapsed ? 'pl-0' : 'pl-8'}`}>
                    {item.children.map((child) => {
                      const childIsActive = currentPage === child.page;
                      return (
                        <li key={child.page}>
                          <button
                            onClick={() => {
                              onNavigate(child.page);
                            }}
                            className={`flex h-10 w-full items-center rounded-md transition ${
                              isCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
                            } ${
                              childIsActive ? 'text-white' : 'text-slate-200 hover:text-white'
                            }`}
                          >
                            <child.icon className={`h-4 w-4 shrink-0 ${childIsActive ? 'text-white' : 'text-slate-300/70'}`} strokeWidth={1.8} />
                            <span className={`truncate text-sm font-medium transition-all duration-300 ease-in-out ${isCollapsed ? 'w-0 opacity-0' : 'opacity-100'}`}>{!isCollapsed && child.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        {managementItems.length > 0 && (
          <div className="mt-2">
            <ul className="space-y-0.5">
              {managementItems.map((item) => {
                const childActive = item.children?.some((child) => child.page === currentPage) ?? false;
                const active = currentPage === item.page || childActive;
                const isOpen = item.children ? openGroups[item.label] : false;
                return (
                  <li key={item.page ?? item.label}>
                    <button
                      onClick={() => {
                        if (item.children) {
                          setOpenGroups((current) => ({
                            Store: item.label === 'Store' ? !current.Store : false,
                            Inventory: false,
                          }));
                          return;
                        }

                        closeManagementGroups();
                        item.page && onNavigate(item.page);
                      }}
                      className={`flex h-[52px] w-full items-center rounded-lg border transition ${
                        isCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
                      } ${getMenuButtonClasses(active, isOpen)}`}
                      style={getMenuButtonStyle(active, isOpen)}
                    >
                      <span className="shrink-0">
                        <item.icon className="h-5 w-5" strokeWidth={1.8} />
                      </span>
                      <span className={`overflow-hidden whitespace-nowrap text-base transition-all duration-300 ease-in-out ${isCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'} ${active ? 'font-semibold' : 'font-medium'}`}>
                        {!isCollapsed && item.label}
                      </span>
                      {item.children && !isCollapsed && (
                        <ChevronDown className={`h-4 w-4 transition ${openGroups[item.label] ? 'rotate-180' : ''}`} strokeWidth={1.8} />
                      )}
                    </button>
                    {item.children && openGroups[item.label] && (
                      <ul className={`space-y-0.5 py-1 transition-all duration-300 ease-in-out ${isCollapsed ? 'pl-0' : 'pl-8'}`}>
                        {item.children.map((child) => {
                          const childIsActive = currentPage === child.page;
                          return (
                            <li key={child.page}>
                              <button
                                onClick={() => {
                                  onNavigate(child.page);
                                }}
                                className={`flex h-10 w-full items-center rounded-md transition ${
                                  isCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
                                } ${
                                  childIsActive ? 'text-white' : 'text-slate-200 hover:text-white'
                                }`}
                              >
                                <child.icon className={`h-4 w-4 shrink-0 ${childIsActive ? 'text-white' : 'text-slate-300/70'}`} strokeWidth={1.8} />
                                <span className={`truncate text-sm font-medium transition-all duration-300 ease-in-out ${isCollapsed ? 'w-0 opacity-0' : 'opacity-100'}`}>{!isCollapsed && child.label}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {flattenedInventoryItems.length > 0 && (
          <div className={`${visibleMenuItems.length > 0 ? 'mt-4 border-t border-white/10 pt-3' : ''}`}>
            {!isCollapsed && (
              <div className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80">
                Inventory
              </div>
            )}
            <ul className="space-y-0.5">
              {flattenedInventoryItems.map((item) => {
                const active = currentPage === item.page;
                return (
                  <li key={item.page ?? item.label}>
                    <button
                      onClick={() => {
                        closeManagementGroups();
                        item.page && onNavigate(item.page);
                      }}
                      className={`flex h-[52px] w-full items-center rounded-lg border transition ${
                        isCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
                      } ${getMenuButtonClasses(active, false)}`}
                      style={getMenuButtonStyle(active, false)}
                    >
                      <span className="shrink-0">
                        <item.icon className="h-5 w-5" strokeWidth={1.8} />
                      </span>
                      <span className={`overflow-hidden whitespace-nowrap text-base transition-all duration-300 ease-in-out ${isCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'} ${active ? 'font-semibold' : 'font-medium'}`}>
                        {!isCollapsed && item.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

      </nav>

      <div className={`shrink-0 border-t border-white/10 py-2 text-white transition-all duration-300 ease-in-out ${isCollapsed ? 'px-3' : 'px-5'}`}>
        {canViewGeneralSettings && (
          <button
            onClick={() => {
              closeManagementGroups();
              onNavigate('general-settings');
            }}
            className={`flex h-[52px] w-full items-center rounded-lg border transition ${
              isCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
            } ${getMenuButtonClasses(currentPage === 'general-settings', false)}`}
            style={getMenuButtonStyle(currentPage === 'general-settings', false)}
          >
            <span className="shrink-0">
              <Settings className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <span className={`overflow-hidden whitespace-nowrap text-base transition-all duration-300 ease-in-out ${isCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'} ${currentPage === 'general-settings' ? 'font-semibold' : 'font-medium'}`}>
              {!isCollapsed && 'Settings'}
            </span>
          </button>
        )}
        {canViewManagerProfile && (
          <button
            onClick={() => onNavigate('manager-profile')}
            className={`mb-2 flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-slate-200/80 transition hover:bg-white/5 hover:text-white ${
              isCollapsed ? 'mx-auto' : ''
            } ${currentPage === 'manager-profile' ? 'bg-white/10 text-white' : ''}`}
            title="Profile"
            aria-label="Profile"
          >
            <UserCircle className="h-4 w-4" strokeWidth={1.8} />
          </button>
        )}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className={`mt-1 flex h-[52px] w-full items-center rounded-lg border border-transparent text-white transition hover:bg-primary/15 hover:text-slate-100 ${
            isCollapsed ? 'justify-center gap-0 px-0' : 'gap-4 px-4 text-left'
          }`}
        >
          <span className="shrink-0">
            <LogOut className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <span className={`overflow-hidden whitespace-nowrap text-base font-medium transition-all duration-300 ease-in-out ${isCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'}`}>
            {!isCollapsed && 'Logout'}
          </span>
        </button>
      </div>

      <LogoutConfirmDialog
        isOpen={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          onLogout();
        }}
      />
    </div>
  );
}

function getStaffTypeLabel(staffType: StaffType, storeType?: string | null) {
  const prefix = storeType === 'RETAIL_STORE' ? 'Retail ' : storeType === 'RESTAURANT' ? 'Restaurant ' : '';
  if (staffType === 'INVENTORY_STAFF') return `${prefix}Inventory Staff`;
  return `${prefix}POS Staff`;
}

function getUserRoleLabel(role: string | null | undefined, isAdmin: boolean, staffType: StaffType, storeType?: string | null) {
  const prefix = storeType === 'RETAIL_STORE' ? 'Retail ' : storeType === 'RESTAURANT' ? 'Restaurant ' : '';
  if (role === 'POS_ADMIN') return `${prefix}POS Manager`;
  if (role === 'INVENTORY_ADMIN') return `${prefix}Inventory Manager`;
  if (role === 'POS_MANAGER') return `${prefix}POS Manager`;
  if (role === 'INVENTORY_MANAGER') return `${prefix}Inventory Manager`;
  if (role === 'ADMIN') return staffType === 'INVENTORY_STAFF' ? `${prefix}Inventory Manager` : `${prefix}Admin`;
  if (role === 'STAFF') return getStaffTypeLabel(staffType, storeType);
  if (isAdmin) return `${prefix}Admin`;
  return getStaffTypeLabel(staffType, storeType);
}

function getInventoryItems(isRetail: boolean, canManageUsers: boolean): MenuItem['children'] {
  const retailItems = [
    { icon: LayoutDashboard, label: 'Dashboard', page: 'inventory-dashboard' as Page },
    { icon: AlertTriangle, label: 'Stock Alerts', page: 'inventory-stock-alerts' as Page },
    { icon: Package, label: 'Inventory', page: 'inventory-items' as Page },
    { icon: Settings2, label: 'Product Management', page: 'inventory-product-management' as Page },
    { icon: ShoppingCart, label: 'Purchase Orders', page: 'inventory-purchase-orders' as Page },
    { icon: PackageCheck, label: 'Products Received', page: 'inventory-products-received' as Page },
    { icon: Layers, label: 'Item Bundling', page: 'inventory-item-bundling' as Page },
    { icon: Receipt, label: 'Sales History', page: 'inventory-sales-history' as Page },
    { icon: ArrowRightLeft, label: 'Transfers', page: 'inventory-transfers' as Page },
    { icon: MapPin, label: 'Multilocation', page: 'inventory-multilocation' as Page },
    { icon: FileText, label: 'Reports', page: 'inventory-reports' as Page },
    { icon: Settings, label: 'Inventory Settings', page: 'inventory-settings' as Page },
  ];

  const restaurantItems = [
    { icon: LayoutDashboard, label: 'Dashboard', page: 'inventory-dashboard' as Page },
    { icon: Package, label: 'Stock Control & Alerts', page: 'inventory-stock-alerts' as Page },
    { icon: Apple, label: 'Food Inventory', page: 'inventory-items' as Page },
    { icon: ShoppingCart, label: 'Purchase Orders', page: 'inventory-purchase-orders' as Page },
    { icon: ClipboardCheck, label: 'Goods Received', page: 'inventory-products-received' as Page },
    { icon: ReceiptText, label: 'POS / Kitchen Orders', page: 'inventory-pos-kitchen' as Page },
    { icon: ChefHat, label: 'Recipe & BOM', page: 'inventory-recipe-bom' as Page },
    { icon: ArrowRightLeft, label: 'Transfers & Adjustments', page: 'inventory-transfers' as Page },
    { icon: MapPin, label: 'Multi-Location', page: 'inventory-multilocation' as Page },
    { icon: FileText, label: 'Reports', page: 'inventory-reports' as Page },
    { icon: Settings, label: 'Inventory Settings', page: 'inventory-settings' as Page },
  ];

  if (isRetail) {
    return retailItems;
  }

  return canManageUsers
    ? [...restaurantItems, { icon: PackageSearch, label: 'Product Management', page: 'inventory-product-management' as Page }]
    : restaurantItems;
}
