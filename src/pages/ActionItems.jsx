import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';

// Placeholder — built out in Batch 4.
export default function ActionItems() {
  return (
    <>
      <PageHeader title="Action Items" />
      <EmptyState icon="◎" title="Action items coming soon" hint="Built out in Batch 4." />
    </>
  );
}
