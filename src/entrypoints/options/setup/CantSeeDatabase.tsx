/** "Can't see your database?" troubleshooting, specific to the token kind. */
import type { TokenKind } from '@/lib/storage/items';

interface Cause {
  title: string;
  fix: string;
}

const PAT_CAUSES: Cause[] = [
  {
    title: 'Wrong workspace',
    fix: 'A personal access token belongs to one workspace. Check the workspace shown above. If your database is elsewhere, create a token in that workspace (pick it in the workspace picker) and paste it here.',
  },
  {
    title: 'You don’t have access to it',
    fix: 'The token sees exactly what you can open in Notion. If you can’t open the database yourself, ask its owner to share it with you.',
  },
  {
    title: 'It’s a linked view',
    fix: 'A linked view (↗ next to its name) points to another database. Open the original database and pick that one.',
  },
  {
    title: 'Token expired or revoked',
    fix: 'Personal access tokens expire. If Sitecatch says Notion rejected the token, create a new one and paste it in step “Paste your token”.',
  },
  {
    title: 'Just created',
    fix: 'Notion’s search can take a few seconds to see new databases. Wait a moment, then click Refresh or type part of its name.',
  },
];

const CONNECTION_CAUSES: Cause[] = [
  {
    title: 'Not shared with the connection yet',
    fix: 'Most common. Open the database as a full page → ••• → Connections → + Add connection → search “Sitecatch” → Confirm. Then click Refresh.',
  },
  {
    title: 'Inline database or shared parent page',
    fix: 'An inline database inherits access from the page it lives on. Share that parent page, or open the database as a full page and share it directly.',
  },
  {
    title: 'It’s a linked view',
    fix: 'A linked view (↗ next to its name) isn’t the database itself. Share the original database, or the page that contains it.',
  },
  {
    title: 'Wrong workspace',
    fix: 'A connection belongs to the workspace it was created in. Create the connection in the workspace that holds your database and paste its token.',
  },
  {
    title: 'Token revoked or refreshed',
    fix: 'If the token was refreshed or the connection deleted, copy the current API token from the connection’s Configuration tab and paste it again.',
  },
  {
    title: 'Just shared',
    fix: 'Search can lag a few seconds after sharing. Wait a moment, then click Refresh.',
  },
];

export function CantSeeDatabase({ tokenKind }: { tokenKind: TokenKind }) {
  const causes = tokenKind === 'personal' ? PAT_CAUSES : CONNECTION_CAUSES;
  return (
    <div class="sco-causes">
      <p class="sco-causes__intro">
        <strong>Can’t see your database?</strong> Check these, most common first:
      </p>
      <ul class="sco-causes__list">
        {causes.map((c) => (
          <li key={c.title}>
            <strong>{c.title}.</strong> {c.fix}
          </li>
        ))}
      </ul>
    </div>
  );
}
