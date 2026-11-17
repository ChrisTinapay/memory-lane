import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import styles from './Auth.module.css';

// A single login/register screen (toggled by `mode`, the same pattern
// App.jsx already uses for its Search / My Memory Lane tabs) rather than
// two separate routes — there's no router in this app, and the two forms
// share almost everything.
export default function Auth() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
    setError('');
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h2 className={styles.heading}>
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p className={styles.subtext}>
          {mode === 'login'
            ? 'Log in to see your Memory Lane.'
            : 'Pave your own lane of movies and shows.'}
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={styles.input}
            />
          </label>

          <label className={styles.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={3}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={styles.input}
            />
          </label>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" disabled={submitting} className={styles.submitButton}>
            {submitting
              ? mode === 'login'
                ? 'Logging in...'
                : 'Creating account...'
              : mode === 'login'
              ? 'Log in'
              : 'Create account'}
          </button>
        </form>

        <button type="button" onClick={switchMode} className={styles.switchButton}>
          {mode === 'login'
            ? "Don't have an account? Register"
            : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
}
