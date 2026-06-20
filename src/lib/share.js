// src/lib/share.js
//
// Share-a-role link helpers. Defines the *role-card* payload shape that gets
// base64-encoded into the URL (via store.js's encodeShareableApp) and read back
// out by the read-only /share route. Deliberately denormalized and minimal:
// only public-facing role fields travel in the link — never orgId/contactIds
// (the recipient has none of that) and never private notes/analysis.

import { encodeShareableApp } from './store.js';

// Build the self-contained payload from an app record + its resolved org name.
export function roleSharePayload(app, orgName) {
  return {
    title: app.title || '',
    orgName: orgName || '',
    location: app.location || '',
    link: app.link || '',
    fitNotes: app.fitNotes || '',
    fitScore: app.fitScore ?? null
  };
}

// Full absolute URL to the read-only share view for this role.
export function buildShareUrl(app, orgName) {
  const encoded = encodeShareableApp(roleSharePayload(app, orgName));
  return `${window.location.origin}/share?role=${encoded}`;
}
