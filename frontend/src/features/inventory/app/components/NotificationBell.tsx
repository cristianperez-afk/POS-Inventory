import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, PackageX, ShoppingCart, ArrowLeftRight, SlidersHorizontal, CalendarClock, Boxes } from 'lucide-react';
import {
  useNotificationsQuery,
  useUnreadNotificationCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} from '../../modules/lib/domainQueries';
import type { ApiNotification } from '../api/domainTypes';

const typeIcon = (type: string) => {
  if (type === 'LOW_STOCK') return <PackageX className="size-4 text-amber-600" />;
  if (type === 'PURCHASE_ORDER_APPROVED') return <ShoppingCart className="size-4 text-emerald-600" />;
  if (type === 'TRANSFER_REQUESTED') return <ArrowLeftRight className="size-4 text-amber-600" />;
  if (type === 'TRANSFER_APPROVED') return <ArrowLeftRight className="size-4 text-emerald-600" />;
  if (type === 'TRANSFER_REJECTED') return <ArrowLeftRight className="size-4 text-red-600" />;
  if (type === 'ADJUSTMENT_SUBMITTED') return <SlidersHorizontal className="size-4 text-amber-600" />;
  if (type === 'ADJUSTMENT_APPROVED') return <SlidersHorizontal className="size-4 text-emerald-600" />;
  if (type === 'ADJUSTMENT_REJECTED') return <SlidersHorizontal className="size-4 text-red-600" />;
  if (type === 'EXPIRY_WARNING') return <CalendarClock className="size-4 text-amber-600" />;
  if (type === 'EXPIRY_REACHED') return <CalendarClock className="size-4 text-red-600" />;
  if (type === 'BUNDLE_APPROVED') return <Boxes className="size-4 text-emerald-600" />;
  if (type === 'BUNDLE_REJECTED') return <Boxes className="size-4 text-red-600" />;
  return <Bell className="size-4 text-muted-foreground" />;
};

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

export function NotificationBell({
  enabled = true,
  buttonClassName = 'text-muted-foreground hover:text-foreground',
  onSelectNotification,
}: {
  enabled?: boolean;
  buttonClassName?: string;
  onSelectNotification?: (notification: ApiNotification) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: unreadCount = 0 } = useUnreadNotificationCountQuery(enabled);
  const { data: notifications = [] } = useNotificationsQuery({ enabled: enabled && open });
  const markRead = useMarkNotificationReadMutation();
  const markAll = useMarkAllNotificationsReadMutation();

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const onItemClick = (n: ApiNotification) => {
    if (!n.isRead) markRead.mutate(n.id);
    if (onSelectNotification && (n.entityType || n.entityId)) {
      // Leave a breadcrumb so the destination page can focus the right tab/entity,
      // then hand off navigation to the host layout.
      window.__INVENTORY_DEEPLINK__ = { entityType: n.entityType ?? null, entityId: n.entityId ?? null, type: n.type ?? null };
      window.dispatchEvent(new CustomEvent('inventory:deeplink'));
      onSelectNotification(n);
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className={`relative flex items-center justify-center size-9 rounded-full transition-colors ${buttonClassName}`}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] bg-card rounded-xl shadow-xl border border-border z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onItemClick(n)}
                  className={`w-full text-left flex gap-3 px-4 py-3 border-b border-border transition-colors hover:bg-muted ${
                    n.isRead ? '' : 'bg-blue-50/40'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">{typeIcon(n.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-foreground truncate">{n.title}</p>
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{n.message}</p>
                  </div>
                  {!n.isRead && <span className="mt-1.5 size-2 rounded-full bg-blue-500 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
