import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { getMobileSupabase } from '@/lib/supabase';

type AuthResult = { ok: true; confirmation?: boolean; recovery?: boolean } | { ok: false; message: string };
type AuthValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (displayName: string, email: string, password: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  exchangeRecoveryCode: (url: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

function authMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (normalized.includes('already registered')) return 'Un compte existe déjà avec cette adresse.';
  return 'La demande n’a pas pu aboutir. Réessayez dans quelques instants.';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const supabase = getMobileSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    }).catch(() => active && setLoading(false));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || Platform.OS === 'web') return;
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => subscription.remove();
  }, [supabase]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase n’est pas configuré sur cet appareil.' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    return error ? { ok: false, message: authMessage(error.message) } : { ok: true };
  }, [supabase]);

  const signUp = useCallback(async (displayName: string, email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase n’est pas configuré sur cet appareil.' };
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(), password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: Linking.createURL('/auth/callback'),
      },
    });
    if (error) return { ok: false, message: authMessage(error.message) };
    return { ok: true, confirmation: !data.session };
  }, [supabase]);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase n’est pas configuré sur cet appareil.' };
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: Linking.createURL('/auth/callback'),
    });
    return { ok: true, confirmation: true };
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, [supabase]);

  const exchangeRecoveryCode = useCallback(async (url: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: 'Supabase n’est pas configuré.' };
    const code = new URL(url).searchParams.get('code');
    if (!code) return { ok: false, message: 'Ce lien est invalide ou incomplet.' };
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, message: 'Ce lien a expiré. Demandez-en un nouveau.' };
    const { data } = await supabase.auth.getClaims();
    const methods = data?.claims.amr;
    const recovery = Array.isArray(methods) && methods.some((entry) =>
      typeof entry === 'object' && entry !== null && 'method' in entry && entry.method === 'recovery'
    );
    return { ok: true, recovery };
  }, [supabase]);

  const value = useMemo<AuthValue>(() => ({
    session, user: session?.user ?? null, loading, configured: Boolean(supabase),
    signIn, signUp, requestPasswordReset, signOut, exchangeRecoveryCode,
  }), [exchangeRecoveryCode, loading, requestPasswordReset, session, signIn, signOut, signUp, supabase]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return value;
}
