import {
  createContext,
  createElement,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getCurrentSession,
  loginUser,
  logoutUser,
  type AuthUser,
} from '../api/client';

declare global {
  interface Window {
    __POS_INVENTORY_USER__?: AuthUser | null;
  }
}

type SessionContextValue = {
  currentUser: AuthUser | null;
  isLoggedIn: boolean;
  isRestoringSession: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const bridgedUser = typeof window === 'undefined' ? null : window.__POS_INVENTORY_USER__ ?? null;
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(bridgedUser);
  const [isRestoringSession, setIsRestoringSession] = useState(!bridgedUser);

  const applyUser = (user: AuthUser) => {
    setCurrentUser(user);
    window.localStorage.setItem('userRole', user.role.toLowerCase());
    window.localStorage.setItem('userEmail', user.email);
  };

  const clearUser = () => {
    setCurrentUser(null);
    window.localStorage.removeItem('userRole');
    window.localStorage.removeItem('userEmail');
  };

  useEffect(() => {
    const bridgedUser = window.__POS_INVENTORY_USER__ ?? null;
    if (bridgedUser) {
      applyUser(bridgedUser);
      setIsRestoringSession(false);
      return;
    }

    let active = true;
    getCurrentSession()
      .then(({ user }) => {
        if (!active) return;
        applyUser(user);
      })
      .catch(() => {
        if (!active) return;
        clearUser();
      })
      .finally(() => {
        if (active) setIsRestoringSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await loginUser(email, password);
      applyUser(response.user);
      toast.success('Signed in successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid credentials');
    }
  };

  const logout = async () => {
    try {
      await logoutUser();
    } finally {
      queryClient.clear();
      clearUser();
    }
  };

  const value = {
    currentUser,
    isLoggedIn: Boolean(currentUser),
    isRestoringSession,
    login,
    logout,
  };

  return createElement(SessionContext.Provider, { value }, children);
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return session;
}
