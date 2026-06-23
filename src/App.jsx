import { Routes, Route, Navigate } from 'react-router-dom';
import { DbProvider } from './lib/db.jsx';
import Layout from './components/Layout.jsx';
import Applications from './pages/Applications.jsx';
import Orgs from './pages/Orgs.jsx';
import Contacts from './pages/Contacts.jsx';
import Criteria from './pages/Criteria.jsx';
import Settings from './pages/Settings.jsx';

// Root: data provider wraps the whole tree, and the router renders the nav-chrome
// app. Applications is the home screen; everything else is reached from the
// hamburger menu.
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DbProvider>
  );
}
