/** Pick one of the connected workspaces (new preset, or assigning an unresolved preset). */
import type { ConnectionSummary } from '@/lib/messaging/protocol';
import { Icon } from '@/ui/components';
import { TOKEN_KIND_LABEL, workspaceName } from '../lib/connections';

export interface WorkspacePickerProps {
  connections: readonly ConnectionSummary[];
  onPick: (c: ConnectionSummary) => void;
  /** Disables picking while something loads; marks that row busy. */
  busyId?: string | null;
  /** Highlights the current workspace. */
  currentId?: string | null;
}

export function WorkspacePicker({ connections, onPick, busyId = null, currentId = null }: WorkspacePickerProps) {
  return (
    <ul class="sco-workspace-pick sco-dblist__items" aria-label="Workspaces">
      {connections.map((c) => (
        <li key={c.id} class="sco-dblist__item">
          <button
            type="button"
            class="sco-dblist__pick"
            disabled={busyId !== null}
            aria-busy={busyId === c.id ? 'true' : undefined}
            aria-current={currentId === c.id ? 'true' : undefined}
            onClick={() => {
              onPick(c);
            }}
          >
            <span class="sco-dblist__icon" aria-hidden="true">
              <Icon name="database" />
            </span>
            <span class="sco-dblist__name">
              {workspaceName(c)}
              <span class="sco-muted"> · {TOKEN_KIND_LABEL[c.tokenKind]}</span>
              {currentId === c.id && <span class="sco-muted"> · current</span>}
            </span>
            <Icon name="chevron-right" class="sco-dblist__chevron" />
          </button>
        </li>
      ))}
    </ul>
  );
}
