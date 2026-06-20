import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';

// Placeholder — built out in Batch 3.
export default function Contacts() {
  return (
    <>
      <PageHeader title="Contacts" />
      <EmptyState icon="☺" title="Contacts coming soon" hint="Built out in Batch 3." />
    </>
  );
}
