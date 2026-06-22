import { Routes, Route, Navigate } from 'react-router-dom';
import { DbProvider } from './lib/db.jsx';
import Layout from './components/Layout.jsx';
import Applications from './pages/Applications.jsx';
import Orgs from './pages/Orgs.jsx';
import Contacts from './pages/Contacts.jsx';
import Criteria from './pages/Criteria.jsx';
import Settings from './pages/Settings.jsx';
import SharedRole from './pages/SharedRole.jsx';

// Root: data provider wraps the whole tree (so even the share route could read
// it if needed), and the router splits the nav-chrome app from the standalone
// read-only share view. Applications is the home screen; everything else is
// reached from the hamburger menu.
export default function App() {
  return (
    <DbProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Applications />} />
          <Route path="orgs" element={<Orgs />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="criteria" element={<Criteria />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        {/* Standalone, no nav chrome — opened from a "Share this role" link. */}
        <Route path="share" element={<SharedRole />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DbProvider>
  );
}
