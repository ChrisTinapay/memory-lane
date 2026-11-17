import { useState } from 'react';
import styles from './App.module.css';
import Search from './components/Search';
import MyLane from './components/MyLane';
import Friends from './components/Friends';
import Auth from './components/Auth';
import { useAuth } from './contexts/AuthContext.js';

function App() {
  const [activeTab, setActiveTab] = useState('search');
  const { user, loading, logout } = useAuth();

  // Session check (GET /users/me via the auth cookie) is still in flight —
  // avoid flashing the login screen for a split second on every reload.
  if (loading) {
    return <div className={styles.page} />;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Memory Lane</h1>
        <p className={styles.subtitle}>Log your favorite movies and TV shows</p>

        {user && (
          <>
            {/* Simple Tab Navigation */}
            <div className={styles.tabNav}>
              <button
                onClick={() => setActiveTab('search')}
                className={`${styles.tabButton} ${
                  activeTab === 'search' ? styles.tabButtonActive : styles.tabButtonInactive
                }`}
              >
                Search & Pave
              </button>
              <button
                onClick={() => setActiveTab('my-lane')}
                className={`${styles.tabButton} ${
                  activeTab === 'my-lane' ? styles.tabButtonActive : styles.tabButtonInactive
                }`}
              >
                My Memory Lane
              </button>
              <button
                onClick={() => setActiveTab('friends')}
                className={`${styles.tabButton} ${
                  activeTab === 'friends' ? styles.tabButtonActive : styles.tabButtonInactive
                }`}
              >
                Friends
              </button>
            </div>

            <div className={styles.accountRow}>
              <span className={styles.accountEmail}>{user.email}</span>
              <button onClick={logout} className={styles.logoutButton}>
                Log out
              </button>
            </div>
          </>
        )}
      </header>

      <main className={styles.main}>
        {user ? (
          activeTab === 'search' ? <Search /> :
          activeTab === 'my-lane' ? <MyLane /> :
          <Friends />
        ) : <Auth />}
      </main>
    </div>
  );
}

export default App;
