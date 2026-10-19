/** Help (#/help): short FAQ linking to the docs. */
import type { ComponentChildren } from 'preact';
import { ExternalLink } from '@/ui/components';
import { docsUrl } from '../lib/constants';

interface Faq {
  q: string;
  a: ComponentChildren;
}

const FAQ: Faq[] = [
  {
    q: 'Personal access token or internal connection?',
    a: (
      <>
        A personal access token acts as you: Sitecatch can save into any database you can open. An internal connection
        only sees databases you share with it, and needs a Workspace Owner to create. Both work the same once set up.{' '}
        <ExternalLink href={docsUrl('setup-guide.md')}>Setup guide</ExternalLink>
      </>
    ),
  },
  {
    q: 'My database doesn’t show up.',
    a: (
      <>
        With an internal connection, share the database: ••• → Connections → + Add connection → Sitecatch. With a
        personal access token, check you’re in the right workspace and can open the database yourself. Then click
        Refresh. <ExternalLink href={docsUrl('setup-guide.md', 'cant-see-your-database')}>Troubleshooting</ExternalLink>
      </>
    ),
  },
  {
    q: 'What is a preset?',
    a: (
      <>
        A preset is a target database plus where each property’s value comes from: the page (title, URL, description,
        fonts…), a question in the popup, or a fixed value.{' '}
        <ExternalLink href={docsUrl('preset-model.md')}>Preset model</ExternalLink>
      </>
    ),
  },
  {
    q: 'A preset says “Needs fix”.',
    a: (
      <>
        A property it uses was deleted, changed type, or the database isn’t visible anymore. Open the preset: the
        affected properties are highlighted.{' '}
        <ExternalLink href={docsUrl('preset-model.md', 'validation')}>Validation rules</ExternalLink>
      </>
    ),
  },
  {
    q: 'Where does the screenshot go?',
    a: (
      <>
        Wherever the preset says: a Files &amp; media property, the page cover, and/or an image in the page body. It’s
        uploaded once and reused. <ExternalLink href={docsUrl('extractors.md')}>Extractors</ExternalLink>
      </>
    ),
  },
  {
    q: 'Why can’t Sitecatch save some pages?',
    a: (
      <>
        Browsers don’t let extensions read about: pages, add-on stores, the PDF viewer or reader mode. Sitecatch still
        saves the URL, tab title and date there. <ExternalLink href={docsUrl('ui-flows.md', 'restricted-page')}>Restricted pages</ExternalLink>
      </>
    ),
  },
  {
    q: 'What data does Sitecatch store or send?',
    a: (
      <>
        Your token stays on this device and is sent only to api.notion.com. Presets sync through your browser account.
        No analytics, no servers. <ExternalLink href={docsUrl('permissions-privacy.md')}>Permissions &amp; privacy</ExternalLink>
      </>
    ),
  },
];

export function HelpPage() {
  return (
    <div class="sco-page">
      <header class="sco-page__header">
        <h1>Help</h1>
        <p class="sco-muted">
          Quick answers. The full documentation lives on <ExternalLink href={docsUrl('README.md')}>GitHub</ExternalLink>.
        </p>
      </header>
      <div class="sco-faq">
        {FAQ.map((f) => (
          <details key={f.q} class="sco-faq__item">
            <summary>{f.q}</summary>
            <div class="sco-faq__answer">{f.a}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
