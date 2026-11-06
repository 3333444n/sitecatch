import type { ConnectionSummary } from '@/lib/messaging/protocol';
import { resolvePresetConnection } from '@/lib/presets/connection';
import type { Preset } from '@/lib/presets/types';
import { Select, type SelectOptionItem } from '@/ui/components';

export interface PresetPickerProps {
  presets: Preset[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Connected workspaces. With more than one, presets are grouped by workspace. */
  connections?: readonly ConnectionSummary[];
}

/** Group label for a preset: its workspace here, or why it has none. */
export function presetGroup(preset: Preset, connections: readonly ConnectionSummary[]): string {
  const res = resolvePresetConnection(preset, connections);
  if (res.ok) return res.data.workspaceName ?? 'Unnamed workspace';
  if (preset.connectionId === null) return 'No workspace yet';
  return `${preset.workspaceName ?? 'Unknown workspace'} (not connected)`;
}

export function presetOptions(presets: Preset[], connections: readonly ConnectionSummary[] = []): SelectOptionItem[] {
  const grouped = connections.length > 1;
  return presets.map((p) => ({
    value: p.id,
    label: p.name === p.dataSourceName ? p.name : `${p.name} · ${p.dataSourceName}`,
    ...(grouped ? { group: presetGroup(p, connections) } : {}),
  }));
}

export function PresetPicker({ presets, value, onChange, disabled = false, connections = [] }: PresetPickerProps) {
  return (
    <label class="popup-picker">
      <span class="sc-visually-hidden">Preset</span>
      <Select
        size="sm"
        value={value}
        disabled={disabled}
        aria-label="Preset"
        options={presetOptions(presets, connections)}
        onChange={(id) => {
          if (id) onChange(id);
        }}
      />
    </label>
  );
}
