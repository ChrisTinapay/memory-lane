import { useState } from 'react';
import { apiFetch } from '../api';
import styles from './Reflection.module.css';

export default function Reflection({ lane, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(lane.reflection || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await apiFetch(`/api/lanes/${lane._id}/reflection`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reflection: draft }),
      });

      if (response.ok) {
        onSave(lane._id, draft);
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Failed to save reflection:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(lane.reflection || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={styles.editor}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write your thoughts on this movie..."
          className={styles.textarea}
        />
        <div className={styles.editorActions}>
          <button onClick={handleSave} disabled={saving} className={styles.saveButton}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={handleCancel} className={styles.cancelButton}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {lane.reflection && <p className={styles.reflectionText}>{lane.reflection}</p>}
      <button onClick={() => setIsEditing(true)} className={styles.engraveButton}>
        Engrave Memory
      </button>
    </div>
  );
}
