import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import styles from './About.module.css';

const REPO_URL = 'https://github.com/bobbrose/searchboard';
const CREATOR_URL = 'https://bobbrose.com';

export default function About() {
  return (
    <>
      <PageHeader title="About" subtitle="What Searchboard is and how it works." />

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Vision</h2>
        <p className={styles.lead}>
          Help you find, track, and choose the right job opportunities — judged
          against your own explicit criteria, not a vibe.
        </p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>How it works</h2>
        <p className={styles.lead}>
          Searchboard is a local-first tracker for a criteria-targeted job
          search. You add roles, move them through a kanban pipeline, and score
          each one against the criteria that matter to you — so “is this worth my
          time?” has a written, repeatable answer.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Track jobs</strong> on a kanban board (or list view) — drag
            cards between stages as things progress.
          </li>
          <li>
            <strong>AI-assisted fit</strong> — paste a job description or a
            posting URL and it extracts the key fields, then scores how well the
            role matches your{' '}
            <Link className={styles.link} to="/criteria">
              Fit Criteria
            </Link>
            .
          </li>
          <li>
            <strong>Your data stays yours</strong> — everything lives in your
            browser's local storage and in the JSON file you export/import. No
            accounts, no server-side storage of your tracking data.
          </li>
        </ul>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Open source</h2>
        <p className={styles.lead}>
          Searchboard is open source under the MIT license. Browse the code,
          file an issue, or fork it:
        </p>
        <p className={styles.credit}>
          <a className={styles.link} href={REPO_URL} target="_blank" rel="noreferrer">
            github.com/bobbrose/searchboard ↗
          </a>
        </p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Creator</h2>
        <p className={styles.credit}>
          Made by{' '}
          <a className={styles.link} href={CREATOR_URL} target="_blank" rel="noreferrer">
            Bob Rose ↗
          </a>
          .
        </p>
      </section>
    </>
  );
}
