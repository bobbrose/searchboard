import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';

// Placeholder — built out in Batch 5.
export default function Dashboard() {
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your pipeline at a glance" />
      <EmptyState
        icon="◧"
        title="Dashboard coming together"
        hint="Pipeline funnel, surfaced action items, and recent activity land here in the final batch."
      />
    </>
  );
}
