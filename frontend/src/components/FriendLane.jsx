import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import shared from '../styles/shared.module.css';
import styles from './FriendLane.module.css';

// A read-only view of a friend's paved lane — no delete or reflection
// editing, since those are only yours to change. The backend
// (GET /api/friends/{friend_id}/lane) 403s unless you're actually friends,
// so this component doesn't need to duplicate that check itself.
export default function FriendLane({ friend, onBack }) {
  const [lanes, setLanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchFriendLane = async () => {
      try {
        const response = await apiFetch(`/api/friends/${friend.id}/lane`);
        if (!response.ok) {
          setError("Couldn't load this friend's lane.");
          return;
        }
        const data = await response.json();
        setLanes(data.lanes || []);
      } catch (err) {
        console.error("Failed to fetch friend's lane:", err);
        setError("Couldn't load this friend's lane.");
      } finally {
        setLoading(false);
      }
    };

    fetchFriendLane();
  }, [friend.id]);

  return (
    <div className={styles.wrapper}>
      <button onClick={onBack} className={styles.backButton}>
        ← Back to Friends
      </button>

      <h2 className={styles.heading}>
        {friend.email}'s Memory Lane <span className={styles.count}>({lanes.length} items)</span>
      </h2>

      {loading && <p className={styles.emptyText}>Loading...</p>}
      {error && <p className={styles.emptyText}>{error}</p>}

      {!loading && !error && lanes.length === 0 && (
        <p className={styles.emptyText}>{friend.email} hasn't paved anything yet.</p>
      )}

      {!loading && !error && lanes.length > 0 && (
        <div className={shared.grid}>
          {lanes.map((item) => (
            <div key={item._id} className={shared.card}>
              <div>
                {item.poster_path ? (
                  <img src={item.poster_path} alt={item.title} className={shared.poster} />
                ) : (
                  <div className={shared.posterPlaceholder}>No Poster</div>
                )}
                <h3 className={shared.cardTitle}>{item.title}</h3>
                <p className={shared.cardMeta}>{item.release_date?.split('-')[0]} • {item.media_type?.toUpperCase()}</p>
              </div>

              {item.reflection && (
                <p className={styles.reflectionText}>{item.reflection}</p>
              )}

              <div className={styles.pavedDate}>
                Paved {new Date(item.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
