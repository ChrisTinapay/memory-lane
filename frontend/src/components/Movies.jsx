import { useState } from 'react';
import { apiFetch } from '../api';
import shared from '../styles/shared.module.css';
import styles from './Movies.module.css';

export default function Movies({ results, setResults }) {
  const [expandedPoster, setExpandedPoster] = useState(null);
  const [expandedOverviews, setExpandedOverviews] = useState(new Set());
  const [trailers, setTrailers] = useState({});
  const [loadingTrailerId, setLoadingTrailerId] = useState(null);
  const [expandedFriendPaves, setExpandedFriendPaves] = useState(new Set());

  const toggleFriendPaves = (tmdbId) => {
    setExpandedFriendPaves(prev => {
      const next = new Set(prev);
      if (next.has(tmdbId)) {
        next.delete(tmdbId);
      } else {
        next.add(tmdbId);
      }
      return next;
    });
  };

  const handleTrailerClick = async (item) => {
    // Open the tab synchronously (on the click itself) so browsers don't
    // treat it as an unrequested popup once the fetch below resolves later.
    const newTab = window.open('', '_blank');

    const cachedUrl = trailers[item.tmdb_id];
    if (cachedUrl) {
      if (newTab) newTab.location.href = cachedUrl;
      return;
    }

    setLoadingTrailerId(item.tmdb_id);
    try {
      const response = await apiFetch(
        `/api/search/trailer?tmdb_id=${item.tmdb_id}&media_type=${item.media_type}`
      );
      const data = await response.json();

      if (data.url) {
        setTrailers(prev => ({ ...prev, [item.tmdb_id]: data.url }));
        if (newTab) newTab.location.href = data.url;
      } else if (newTab) {
        newTab.close();
      }
    } catch (error) {
      console.error("Failed to fetch trailer:", error);
      if (newTab) newTab.close();
    } finally {
      setLoadingTrailerId(null);
    }
  };

  const toggleOverview = (tmdbId) => {
    setExpandedOverviews(prev => {
      const next = new Set(prev);
      if (next.has(tmdbId)) {
        next.delete(tmdbId);
      } else {
        next.add(tmdbId);
      }
      return next;
    });
  };

  const handlePave = async (item) => {
    try {
      // No user_id here — the backend identifies the pave-r from the auth
      // cookie (see backend/app/routes/lanes.py), not from the request body.
      const response = await apiFetch('/api/lanes/pave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdb_id: item.tmdb_id,
          title: item.title,
          media_type: item.media_type,
          poster_path: item.poster_path,
          release_date: item.release_date,
        }),
      });

      if (response.ok) {
        // Optimistically update the UI to show it's now paved!
        setResults(prev => prev.map(m => {
          if (m.tmdb_id === item.tmdb_id) {
            const hasFriendPave = m.network_paves?.some(p => !p.is_me);
            const newStatus = hasFriendPave ? "co_paved" : "paved_by_me";
            return { ...m, social_status: newStatus };
          }
          return m;
        }));
      }
    } catch (error) {
      console.error("Failed to pave lane:", error);
    }
  };

  return (
    <>
    <div className={shared.grid}>
      {results.map((item) => {
        const friendPaves = item.network_paves?.filter(p => !p.is_me) || [];
        const isFriendActivityExpanded = expandedFriendPaves.has(item.tmdb_id);

        return (
        <div key={item.tmdb_id} className={shared.card}>
          <div>
            {item.poster_path ? (
              <img
                src={item.poster_path}
                alt={item.title}
                className={`${shared.poster} ${styles.posterClickable}`}
                onClick={() => setExpandedPoster(item)}
              />
            ) : (
              <div className={shared.posterPlaceholder}>No Poster</div>
            )}
            <button
              type="button"
              onClick={() => handleTrailerClick(item)}
              className={styles.trailerButton}
            >
              {loadingTrailerId === item.tmdb_id ? 'Loading trailer...' : '🎬 Trailer'}
            </button>
            <h3 className={shared.cardTitle}>{item.title}</h3>
            <p className={shared.cardMeta}>{item.release_date?.split('-')[0]} • {item.media_type.toUpperCase()}</p>

            {item.overview && (
              <>
                <button
                  type="button"
                  onClick={() => toggleOverview(item.tmdb_id)}
                  className={styles.seeMoreButton}
                >
                  {expandedOverviews.has(item.tmdb_id) ? 'see less' : 'see more...'}
                </button>
                {expandedOverviews.has(item.tmdb_id) && (
                  <p className={styles.overviewText}>{item.overview}</p>
                )}
              </>
            )}
          </div>

          {/* Social Status Badge & Action Button */}
          <div className={styles.statusSection}>
            {item.social_status === 'co_paved' && (
              <div className={styles.badgeCoPaved}>
                🤝 Co-Paved with Friend
              </div>
            )}

            {item.social_status === 'paved_by_me' && (
              <div className={styles.badgePavedByMe}>
                🛣️ In Your Lane
              </div>
            )}

            {item.social_status === 'paved_by_friend' && (
              <div className={styles.friendActions}>
                <div className={styles.badgePavedByFriend}>
                  👀 Paved by Friend
                </div>
                <button onClick={() => handlePave(item)} className={styles.paveButton}>
                  Pave Your Lane Too
                </button>
              </div>
            )}

            {item.social_status === 'unpaved' && (
              <button onClick={() => handlePave(item)} className={styles.paveButton}>
                + Pave Lane
              </button>
            )}

            {friendPaves.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => toggleFriendPaves(item.tmdb_id)}
                  className={styles.seeMoreButton}
                >
                  {isFriendActivityExpanded
                    ? 'hide friend activity'
                    : `see ${friendPaves.length} friend${friendPaves.length > 1 ? 's' : ''} who paved this`}
                </button>
                {isFriendActivityExpanded && (
                  <ul className={styles.friendPavesList}>
                    {friendPaves.map((p) => (
                      <li key={p.user_id} className={styles.friendPaveItem}>
                        <div className={styles.friendPaveHeader}>
                          <span className={styles.friendPaveEmail}>{p.email}</span>
                          <span className={styles.friendPaveDate}>
                            {new Date(p.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {p.reflection && (
                          <p className={styles.friendPaveReflection}>{p.reflection}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
        );
      })}
    </div>

    {expandedPoster && (
      <div className={styles.posterOverlay} onClick={() => setExpandedPoster(null)}>
        <img
          src={expandedPoster.poster_path}
          alt={expandedPoster.title}
          className={styles.posterExpanded}
        />
      </div>
    )}
    </>
  );
}
