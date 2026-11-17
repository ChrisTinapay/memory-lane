import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import styles from './Friends.module.css';
import FriendLane from './FriendLane';

export default function Friends() {
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState('');

  const [requests, setRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [viewingFriend, setViewingFriend] = useState(null);

  const fetchRequests = async () => {
    const response = await apiFetch('/api/friends/requests');
    const data = await response.json();
    setRequests(data.requests || []);
  };

  const fetchFriends = async () => {
    const response = await apiFetch('/api/friends/');
    const data = await response.json();
    setFriends(data.friends || []);
  };

  useEffect(() => {
    fetchRequests();
    fetchFriends();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSearching(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const response = await apiFetch(`/api/friends/search?email=${encodeURIComponent(email.trim())}`);
      const data = await response.json();
      setSearchResult(data.results?.[0] || 'not_found');
    } catch (error) {
      console.error("Failed to search for user:", error);
      setSearchError('Something went wrong. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (recipientId) => {
    try {
      const response = await apiFetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: recipientId }),
      });

      if (response.ok) {
        setSearchResult(prev => ({ ...prev, status: 'pending_sent' }));
      }
    } catch (error) {
      console.error("Failed to send friend request:", error);
    }
  };

  const handleAccept = async (requestId) => {
    try {
      const response = await apiFetch(`/api/friends/requests/${requestId}/accept`, {
        method: 'POST',
      });

      if (response.ok) {
        await Promise.all([fetchRequests(), fetchFriends()]);
      }
    } catch (error) {
      console.error("Failed to accept friend request:", error);
    }
  };

  const handleDecline = async (requestId) => {
    try {
      const response = await apiFetch(`/api/friends/requests/${requestId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setRequests(prev => prev.filter(r => r.id !== requestId));
      }
    } catch (error) {
      console.error("Failed to decline friend request:", error);
    }
  };

  const handleUnfriend = async (friendshipId) => {
    try {
      const response = await apiFetch(`/api/friends/requests/${friendshipId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setFriends(prev => prev.filter(f => f.friendship_id !== friendshipId));
      }
    } catch (error) {
      console.error("Failed to unfriend:", error);
    }
  };

  if (viewingFriend) {
    return <FriendLane friend={viewingFriend} onBack={() => setViewingFriend(null)} />;
  }

  return (
    <div className={styles.wrapper}>
      <section className={styles.section}>
        <h2 className={styles.heading}>Find Friends</h2>
        <form onSubmit={handleSearch} className={styles.searchForm}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Search by exact email..."
            className={styles.searchInput}
          />
          <button type="submit" className={styles.searchButton}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {searchError && <p className={styles.error}>{searchError}</p>}

        {searchResult === 'not_found' && (
          <p className={styles.emptyText}>No account found with that email.</p>
        )}

        {searchResult && searchResult !== 'not_found' && (
          <div className={styles.resultRow}>
            <span className={styles.email}>{searchResult.email}</span>
            {searchResult.status === 'none' && (
              <button onClick={() => handleSendRequest(searchResult.id)} className={styles.actionButton}>
                Add Friend
              </button>
            )}
            {searchResult.status === 'pending_sent' && (
              <span className={styles.statusText}>Request sent</span>
            )}
            {searchResult.status === 'pending_received' && (
              <span className={styles.statusText}>They've requested you — see below</span>
            )}
            {searchResult.status === 'friends' && (
              <span className={styles.statusText}>Already friends</span>
            )}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>
          Friend Requests <span className={styles.count}>({requests.length})</span>
        </h2>
        {requests.length === 0 ? (
          <p className={styles.emptyText}>No pending requests.</p>
        ) : (
          <ul className={styles.list}>
            {requests.map((r) => (
              <li key={r.id} className={styles.resultRow}>
                <span className={styles.email}>{r.from_email}</span>
                <div className={styles.actions}>
                  <button onClick={() => handleAccept(r.id)} className={styles.actionButton}>
                    Accept
                  </button>
                  <button onClick={() => handleDecline(r.id)} className={styles.declineButton}>
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>
          Your Friends <span className={styles.count}>({friends.length})</span>
        </h2>
        {friends.length === 0 ? (
          <p className={styles.emptyText}>You haven't added any friends yet.</p>
        ) : (
          <ul className={styles.list}>
            {friends.map((f) => (
              <li key={f.friendship_id} className={styles.resultRow}>
                <span className={styles.email}>{f.email}</span>
                <div className={styles.actions}>
                  <button onClick={() => setViewingFriend(f)} className={styles.actionButton}>
                    View Lane
                  </button>
                  <button onClick={() => handleUnfriend(f.friendship_id)} className={styles.declineButton}>
                    Unfriend
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
