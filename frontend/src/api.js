export const API_BASE_URL = 'http://localhost:8000';

// Wraps fetch() so every call to the backend automatically sends the
// httpOnly auth cookie (see backend/app/users.py — CookieTransport).
// Every component that talks to the API should go through this instead of
// calling fetch() directly, or the browser won't attach the session cookie
// and every request will look logged-out.
export function apiFetch(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
  });
}

function readableAuthError(detail) {
  if (typeof detail === 'string') {
    const known = {
      REGISTER_USER_ALREADY_EXISTS: 'An account with that email already exists.',
      LOGIN_BAD_CREDENTIALS: 'Incorrect email or password.',
      LOGIN_USER_NOT_ACTIVE: 'This account has been disabled.',
    };
    return known[detail] || detail;
  }
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
  }
  if (detail && typeof detail === 'object' && detail.reason) {
    return detail.reason; // e.g. REGISTER_INVALID_PASSWORD validation messages
  }
  return 'Something went wrong. Please try again.';
}

export async function registerAccount(email, password) {
  const response = await apiFetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(readableAuthError(data.detail));
  }

  return response.json();
}

export async function login(email, password) {
  // fastapi-users' JWT login route expects an OAuth2 password form, not
  // JSON — "username" is the field name it looks for, even though we're
  // sending the email into it.
  const body = new URLSearchParams();
  body.set('username', email);
  body.set('password', password);

  const response = await apiFetch('/auth/jwt/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(readableAuthError(data.detail));
  }

  return true;
}

export async function logout() {
  await apiFetch('/auth/jwt/logout', { method: 'POST' });
}

// Returns the logged-in user's profile, or null if no one is logged in.
// Used on app load to restore the session from the auth cookie.
export async function fetchCurrentUser() {
  const response = await apiFetch('/users/me');
  if (!response.ok) return null;
  return response.json();
}
