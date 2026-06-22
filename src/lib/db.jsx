// src/lib/db.jsx
//
// React state layer over store.js. store.js stays the single persistence
// authority (localStorage shape, import/export, share encoding); this file
// just holds the live `db` object in React state, mirrors every change back to
// localStorage, and exposes generic CRUD + a few cross-collection selectors so
// pages don't prop-drill or reach into localStorage directly.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  emptyDB,
  uid
} from './store.js';

const DbContext = createContext(null);

// Collections that hold id-stamped records. Keep in sync with emptyDB().
export const COLLECTIONS = ['apps', 'orgs', 'contacts', 'analyses', 'todos'];

export function DbProvider({ children }) {
  // Hydrate synchronously in the initializer (this is a client-only SPA, no
  // SSR, so reading localStorage during init is safe). Doing this here rather
  // than in a mount effect is essential: it closes the race where the mirror
  // effect below would write the empty initial state over real data before a
  // hydrate effect could load it — a clobber StrictMode's double-invoke made
  // happen on every reload.
  const [db, setDb] = useState(loadFromLocalStorage);

  // Mirror every change back to localStorage. On first run this writes the
  // already-hydrated data back unchanged, so there's no window for data loss.
  useEffect(() => {
    saveToLocalStorage(db);
  }, [db]);

  const api = useMemo(() => {
    const now = () => new Date().toISOString();

    // Insert a new record into `collection`, stamping id + timestamps.
    // Returns the created record so callers can reference its id.
    function add(collection, record) {
      const item = {
        ...record,
        id: uid(),
        createdAt: now(),
        updatedAt: now()
      };
      setDb(prev => ({
        ...prev,
        [collection]: [...prev[collection], item],
        lastSaved: now()
      }));
      return item;
    }

    // Merge `patch` into the record with matching id, bumping updatedAt.
    function update(collection, id, patch) {
      setDb(prev => ({
        ...prev,
        [collection]: prev[collection].map(item =>
          item.id === id ? { ...item, ...patch, updatedAt: now() } : item
        ),
        lastSaved: now()
      }));
    }

    // Convenience: add when there's no id, update otherwise.
    function upsert(collection, record) {
      if (record.id) {
        const { id, ...patch } = record;
        update(collection, id, patch);
        return record;
      }
      return add(collection, record);
    }

    function remove(collection, id) {
      setDb(prev => ({
        ...prev,
        [collection]: prev[collection].filter(item => item.id !== id),
        lastSaved: now()
      }));
    }

    // Wholesale replace (used by import and clear-data in Settings).
    function replaceAll(next) {
      setDb({ ...emptyDB(), ...next, lastSaved: now() });
    }

    // Merge a patch into the top-level `db.profile` (e.g. { homeState }).
    // Lives alongside the collections rather than inside one; store.js's
    // shallow-merge load/save round-trips this extra key untouched.
    function setProfile(patch) {
      setDb(prev => ({
        ...prev,
        profile: { ...prev.profile, ...patch, updatedAt: now() },
        lastSaved: now()
      }));
    }

    return { add, update, upsert, remove, replaceAll, setProfile };
  }, []);

  const value = useMemo(() => ({ db, ...api }), [db, api]);

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useDb() {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used within <DbProvider>');
  return ctx;
}

// Normalize an app's contact links to [{ contactId, relation }]. The typed
// source of truth is `app.contactLinks`; records created before typed links
// existed carry only a flat `app.contactIds`, treated here as untyped
// 'contact' links so the rest of the app sees one consistent shape.
export function normalizeContactLinks(app) {
  if (Array.isArray(app?.contactLinks)) return app.contactLinks;
  return (app?.contactIds || []).map(contactId => ({ contactId, relation: 'contact' }));
}

// --- Cross-collection selectors -------------------------------------------
// Hooks so they re-read live state. Kept tiny and derived; no memo needed at
// this data scale (a personal search, tens-to-hundreds of records).

export function useSelectors() {
  const { db } = useDb();

  const orgById = id => db.orgs.find(o => o.id === id) || null;
  const orgName = id => orgById(id)?.name || '';
  const contactById = id => db.contacts.find(c => c.id === id) || null;
  const appById = id => db.apps.find(a => a.id === id) || null;

  const appsForOrg = orgId => db.apps.filter(a => a.orgId === orgId);
  const contactsForOrg = orgId => db.contacts.filter(c => c.orgId === orgId);
  const contactsForApp = app =>
    normalizeContactLinks(app).map(l => contactById(l.contactId)).filter(Boolean);

  // Typed links from a job to its contacts: [{ contactId, relation, contact }].
  const contactLinksForApp = app =>
    normalizeContactLinks(app)
      .map(l => ({ ...l, contact: contactById(l.contactId) }))
      .filter(l => l.contact);

  // Reverse: every job a contact is linked to, with this contact's relation to
  // it — [{ app, relation }]. Lets the Contacts page read relationships as
  // pipeline ("Maya → Senior PM @ Acme · Interviewing, referred").
  const appsForContact = contactId =>
    db.apps
      .map(app => {
        const link = normalizeContactLinks(app).find(l => l.contactId === contactId);
        return link ? { app, relation: link.relation } : null;
      })
      .filter(Boolean);
  const analysesForApp = appId => db.analyses.filter(a => a.appId === appId);
  const analysesForOrg = orgId => db.analyses.filter(a => a.orgId === orgId);

  const openTodos = () => db.todos.filter(t => !t.done);

  // Resolve a todo's linked entity to a { type, label } chip, or null.
  function linkedEntity(todo) {
    if (!todo.linkedType || !todo.linkedId) return null;
    if (todo.linkedType === 'app') {
      const a = appById(todo.linkedId);
      return a ? { type: 'app', label: a.title || 'Untitled role' } : null;
    }
    if (todo.linkedType === 'org') {
      const o = orgById(todo.linkedId);
      return o ? { type: 'org', label: o.name || 'Untitled org' } : null;
    }
    if (todo.linkedType === 'contact') {
      const c = contactById(todo.linkedId);
      return c ? { type: 'contact', label: c.name || 'Unnamed contact' } : null;
    }
    return null;
  }

  return {
    orgById,
    orgName,
    contactById,
    appById,
    appsForOrg,
    contactsForOrg,
    contactsForApp,
    contactLinksForApp,
    appsForContact,
    analysesForApp,
    analysesForOrg,
    openTodos,
    linkedEntity
  };
}
