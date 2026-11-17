import { useState } from 'react';
import { apiFetch } from '../api';
import styles from './Search.module.css';
import Movies from './Movies';

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await apiFetch(`/api/search/?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error("Failed to fetch search results:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movies or TV shows..."
          className={styles.searchInput}
        />
        <button type="submit" className={styles.searchButton}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <Movies results={results} setResults={setResults} />
    </div>
  );
}
