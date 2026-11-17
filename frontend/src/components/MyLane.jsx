import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import shared from '../styles/shared.module.css';
import styles from './MyLane.module.css';
import Reflection from './Reflection';

export default function MyLane() {
  const [lanes, setLanes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMyLanes = async () => {
    try {
      const response = await apiFetch('/api/lanes/my-lane');
      const data = await response.json();
      setLanes(data.lanes || []);
    } catch (error) {
      console.error("Failed to fetch paved lanes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyLanes();
  }, []);

  const handleDelete = async (laneId) => {
    try {
      const response = await apiFetch(`/api/lanes/${laneId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setLanes(prev => prev.filter(lane => lane._id !== laneId));
      }
    } catch (error) {
      console.error("Failed to delete lane:", error);
    }
  };

  const handleReflectionSave = (laneId, reflection) => {
    setLanes(prev => prev.map(lane =>
      lane._id === laneId ? { ...lane, reflection } : lane
    ));
  };

  if (loading) {
    return <div className={styles.loadingText}>Loading your Memory Lane...</div>;
  }

  if (lanes.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h3 className={styles.emptyTitle}>Your Lane is Empty</h3>
        <p className={styles.emptyText}>Use the search bar above to find movies and TV shows to pave into your memory lane!</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.heading}>
        <span></span> My Memory Lane <span className={styles.count}>({lanes.length} items)</span>
      </h2>

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

            <Reflection lane={item} onSave={handleReflectionSave} />

            <button onClick={() => handleDelete(item._id)}>Delete</button>

            <div className={styles.pavedDate}>
              Paved {new Date(item.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
