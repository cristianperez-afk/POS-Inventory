import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, PackageX, ShoppingCart } from 'lucide-react';
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
  return <Bell className="size-4 text-gray-500" />;
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
  buttonClassName = 'text-gray-500 hover:text-gray-800',
}: {
  enabled?: boolean;
  buttonClassName?: string;
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
        <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
              >
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onItemClick(n)}
                  className={`w-full text-left flex gap-3 px-4 py-3 border-b border-gray-50 transition-colors hover:bg-gray-50 ${
                    n.isRead ? '' : 'bg-blue-50/40'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">{typeIcon(n.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-gray-800 truncate">{n.title}</p>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="text-[12px] text-gray-600 mt-0.5">{n.message}</p>
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
