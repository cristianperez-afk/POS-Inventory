import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface AppAlertContextValue {
  showAlert: (message: string, title?: string) => void;
}

const AppAlertContext = createContext<AppAlertContextValue | null>(null);

export function AppAlertProvider({ children }: { children: ReactNode }) {
  const [alertState, setAlertState] = useState<{ message: string; title: string } | null>(null);

  const showAlert = useCallback((message: string, title = 'Notice') => {
    setAlertState({ message, title });
  }, []);

  useEffect(() => {
    const originalAlert = window.alert;

    window.alert = (message?: unknown) => {
      showAlert(String(message ?? ''), 'Notice');
    };

    return () => {
      window.alert = originalAlert;
    };
  }, [showAlert]);

  return (
    <AppAlertContext.Provider value={{ showAlert }}>
      {children}
      <Dialog open={Boolean(alertState)} onOpenChange={(open) => !open && setAlertState(null)}>
        <DialogContent className="border-[#00a7a5]/15 bg-white text-[#003534] shadow-2xl sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#007a5e]">{alertState?.title ?? 'Notice'}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm leading-6 text-slate-600">{alertState?.message}</p>
          </div>
          <DialogFooter className="flex gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() => setAlertState(null)}
              className="inline-flex items-center justify-center rounded-md bg-[#007a5e] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#00624d] focus:outline-none focus:ring-2 focus:ring-[#00a7a5]/30 focus:ring-offset-2"
            >
              OK
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppAlertContext.Provider>
  );
}

export function useAppAlert() {
  const context = useContext(AppAlertContext);
  if (!context) throw new Error('useAppAlert must be used within AppAlertProvider');
  return context;
}
