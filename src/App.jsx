import { useState, useEffect } from 'react'
import { loadFromLocalStorage, saveToLocalStorage, emptyDB } from './lib/store.js'

// This is a deliberately minimal placeholder shell. It proves the data layer
// (load/save/empty state) wires up correctly end to end. The real dashboard
// UI (Applications kanban, Orgs, Contacts, Analysis, Action items, Settings)
// gets built out next — see VISION.md for full scope.

export default function App() {
  const [db, setDb] = useState(emptyDB());

  useEffect(() => {
    setDb(loadFromLocalStorage());
  }, []);

  useEffect(() => {
    saveToLocalStorage(db);
  }, [db]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720 }}>
      <h1>Searchboard</h1>
      <p style={{ color: '#666' }}>
        Skeleton running. Data layer wired: {db.apps.length} applications,{' '}
        {db.orgs.length} orgs, {db.contacts.length} contacts,{' '}
        {db.analyses.length} analysis entries, {db.todos.length} action items.
      </p>
      <p style={{ color: '#999', fontSize: 14 }}>
        Next: build out the real dashboard UI in Claude Code.
      </p>
    </div>
  );
}
