import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';

// Placeholder — built out in Batch 5.
export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" />
      <EmptyState icon="⚙" title="Settings coming soon" hint="Import/export, clear data, and parse usage land in Batch 5." />
    </>
  );
}
