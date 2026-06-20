import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';

// Placeholder — built out in Batch 3.
export default function Orgs() {
  return (
    <>
      <PageHeader title="Orgs" />
      <EmptyState icon="◳" title="Orgs coming soon" hint="Built out in Batch 3." />
    </>
  );
}
