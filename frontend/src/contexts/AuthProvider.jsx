import { useEffect, useState, useCallback } from 'react';
import { AuthContext } from './AuthContext';
import {
  fetchCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  registerAccount,
} from '../api';

// Wraps the whole app (see main.jsx) so any component can ask "who's
// logged in?" via useAuth() instead of each one re-fetching /users/me.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // True only while the very first session check (on page load) is
  // in flight — lets App.jsx show a blank/loading state instead of
  // flashing the login screen before we know a cookie is already valid.
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const me = await fetchCurrentUser();
    setUser(me);
    return me;
  }, []);

  useEffect(() => {
    // Restoring a session from the existing auth cookie on first load —
    // there's no external event to subscribe to here, just a one-time
    // check, so the async fetch-then-setState is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = async (email, password) => {
    await apiLogin(email, password);
    await refreshUser();
  };

  const register = async (email, password) => {
    await registerAccount(email, password);
    // Registering doesn't log you in by itself — do that right after so
    // the person lands straight in the app instead of at a second form.
    await apiLogin(email, password);
    await refreshUser();
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
