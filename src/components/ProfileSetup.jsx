import Modal from './Modal.jsx';
import SearchCriteria from '../forms/SearchCriteria.jsx';

// First-run criteria setup — fully skippable (VISION principle #4, no friction).
// Reuses the exact Settings fields via SearchCriteria's embedded mode, which
// saves live, so "Done" just closes. Surfaced from a dismissable Dashboard
// banner and re-openable from Settings.
export default function ProfileSetup({ onClose }) {
  return (
    <Modal
      title="Set up your fit criteria"
      onClose={onClose}
      wide
      footer={
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 14 }}>
        Tell Searchboard what you're after, and every role you add gets scored on
        how closely it fits — instantly rejecting deal-breakers and giving an AI
        read on the rest. Everything's optional and editable later in Settings.
        Skip if you'd rather not bother.
      </p>
      <SearchCriteria embedded />
    </Modal>
  );
}
