import { Routes, Route, Navigate } from 'react-router-dom';
import { DbProvider } from './lib/db.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Applications from './pages/Applications.jsx';
import Orgs from './pages/Orgs.jsx';
import Contacts from './pages/Contacts.jsx';
import Analysis from './pages/Analysis.jsx';
import ActionItems from './pages/ActionItems.jsx';
import Settings from './pages/Settings.jsx';
import SharedRole from './pages/SharedRole.jsx';

// Root: data provider wraps the whole tree (so even the share route could read
// it if needed), and the router splits the nav-chrome app from the standalone
// read-only share view.
export default function App() {
  return (
    <DbProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="applications" element={<Applications />} />
          <Route path="orgs" element={<Orgs />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="analysis" element={<Analysis />} />
          <Route path="todos" element={<ActionItems />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        {/* Standalone, no nav chrome — opened from a "Share this role" link. */}
        <Route path="share" element={<SharedRole />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DbProvider>
  );
}
