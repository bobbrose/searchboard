import SearchCriteria from '../forms/SearchCriteria.jsx';

// Standalone home for the fit-criteria editor, reached from the hamburger menu.
// SearchCriteria (non-embedded) renders its own card chrome, title, and lead,
// so this page is just a thin route wrapper.
export default function Criteria() {
  return <SearchCriteria />;
}
