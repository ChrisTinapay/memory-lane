import { createContext, useContext } from 'react';

// The context itself plus the hook that reads it live in their own
// plain-JS file (no components here) so the actual <AuthProvider>
// component can live alone in its own .jsx file — Vite's fast refresh
// only works reliably on files that exclusively export components.
export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return ctx;
}
