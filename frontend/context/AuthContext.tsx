'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/types';
import { supabase } from '@/lib/supabase';
import type { User as AuthUser } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; phone: string; password: string }) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function loadAppUser(authUser: AuthUser): Promise<User> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, phone, role')
    .eq('id', authUser.id)
    .maybeSingle();

  return {
    id: authUser.id,
    email: authUser.email || '',
    name: profile?.name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || '',
    phone: profile?.phone || undefined,
    role: profile?.role === 'admin' ? 'admin' : 'customer',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        setUser(await loadAppUser(session.user));
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
        return;
      }
      // Defer so we do not deadlock with other Supabase calls inside the callback.
      setTimeout(() => {
        loadAppUser(session.user).then((appUser) => {
          if (!cancelled) setUser(appUser);
        });
      }, 0);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Login failed');
    setUser(await loadAppUser(data.user));
  };

  const register = async (payload: { name: string; email: string; phone: string; password: string }) => {
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: { data: { name: payload.name, phone: payload.phone } },
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Registration failed');
    setUser(await loadAppUser(data.user));
  };

  const logout = () => {
    supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
