import type { JobStatus } from '@/lib/messaging/protocol';
import { Button, Spinner, SuccessCard } from '@/ui/components';

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Starting…',
  uploading: 'Uploading screenshot…',
  creating: 'Saving to Notion…',
  done: 'Saved',
  error: 'Save failed',
};

export function statusLabel(status: JobStatus | 'starting'): string {
  return status === 'starting' ? 'Starting…' : STATUS_LABEL[status];
}

export interface SavingProps {
  status: JobStatus | 'starting';
  /** True after ~20 s. */
  slow: boolean;
}

export function Saving({ status, slow }: SavingProps) {
  return (
    <div class="popup-saving" role="status" aria-live="polite">
      <Spinner size="lg" />
      <p class="popup-saving__label">{statusLabel(status)}</p>
      {slow && (
        <p class="popup-note">Still working… it continues in the background — you can close this popup.</p>
      )}
    </div>
  );
}

export interface SavedProps {
  dbName: string;
  pageUrl?: string;
  onSaveAnother: () => void;
  onClose: () => void;
}

export function Saved({ dbName, pageUrl, onSaveAnother, onClose }: SavedProps) {
  return (
    <div class="popup-saved">
      <SuccessCard
        title={`Saved to ${dbName}`}
        subtitle={pageUrl ? undefined : 'Open your database in Notion to see it.'}
        href={pageUrl}
        secondaryAction={{ label: 'Save with another preset', onClick: onSaveAnother }}
      />
      <Button variant="ghost" size="sm" fullWidth onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
