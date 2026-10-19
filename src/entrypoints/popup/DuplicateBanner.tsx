import type { DuplicateMatch } from '@/lib/notion/types';
import { Banner, Button } from '@/ui/components';
import { relativeTime } from './format';

export interface DuplicateBannerProps {
  /** Non-empty. */
  matches: DuplicateMatch[];
  dbName: string;
  onUpdate: (pageId: string) => void;
  onDuplicate: () => void;
  onOpen: (url: string) => void;
  disabled?: boolean;
  now?: Date;
}

/** Most recently edited match first. */
export function sortMatches(matches: DuplicateMatch[]): DuplicateMatch[] {
  return [...matches].sort((a, b) => Date.parse(b.lastEditedTime) - Date.parse(a.lastEditedTime));
}

export function DuplicateBanner({ matches, dbName, onUpdate, onDuplicate, onOpen, disabled = false, now }: DuplicateBannerProps) {
  const [latest] = sortMatches(matches);
  if (!latest) return null;
  const others = matches.length - 1;
  return (
    <Banner
      tone="warning"
      class="popup-dup"
      title={`Already in ${dbName}`}
      actions={
        <>
          <Button size="sm" variant="primary" disabled={disabled} onClick={() => { onUpdate(latest.pageId); }}>
            Update existing
          </Button>
          <Button size="sm" variant="secondary" disabled={disabled} onClick={onDuplicate}>
            Save as duplicate
          </Button>
          <Button size="sm" variant="ghost" icon="external" onClick={() => { onOpen(latest.url); }}>
            Open existing
          </Button>
        </>
      }
    >
      <p class="sc-banner__text">
        <strong>{latest.title || 'Untitled'}</strong> (saved {relativeTime(latest.lastEditedTime, now)})
        {others > 0 && ` and ${others} more ${others === 1 ? 'page' : 'pages'} with this URL`}.
      </p>
    </Banner>
  );
}
