import type { Preset } from '@/lib/presets/types';
import { Select } from '@/ui/components';

export interface PresetPickerProps {
  presets: Preset[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function PresetPicker({ presets, value, onChange, disabled = false }: PresetPickerProps) {
  return (
    <label class="popup-picker">
      <span class="sc-visually-hidden">Preset</span>
      <Select
        size="sm"
        value={value}
        disabled={disabled}
        aria-label="Preset"
        options={presets.map((p) => ({
          value: p.id,
          label: p.name === p.dataSourceName ? p.name : `${p.name} · ${p.dataSourceName}`,
        }))}
        onChange={(id) => {
          if (id) onChange(id);
        }}
      />
    </label>
  );
}
