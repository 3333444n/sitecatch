import type { WritablePropertyType } from '@/lib/notion/types';
import { formValueKindFor } from './compat';
import type { FormValue } from './types';

/** The blank form value for a property type. */
export function emptyFormValue(propertyType: WritablePropertyType): FormValue {
  switch (formValueKindFor(propertyType)) {
    case 'text':
      return { kind: 'text', value: '' };
    case 'number':
      return { kind: 'number', value: null };
    case 'checkbox':
      return { kind: 'checkbox', value: false };
    case 'select':
      return { kind: 'select', value: null };
    case 'multi_select':
      return { kind: 'multi_select', value: [] };
    case 'date':
      return { kind: 'date', value: null };
    case 'files':
      return { kind: 'files', value: [] };
  }
}

/** True when the value carries nothing worth writing. Checkbox is never empty. */
export function isEmptyFormValue(value: FormValue): boolean {
  switch (value.kind) {
    case 'text':
      return value.value.trim() === '';
    case 'number':
      return value.value === null || !Number.isFinite(value.value);
    case 'checkbox':
      return false;
    case 'select':
      return value.value === null || value.value.trim() === '';
    case 'multi_select':
      return value.value.every((v) => v.trim() === '');
    case 'date':
      return value.value === null || value.value.start.trim() === '';
    case 'files':
      return value.value.length === 0;
  }
}

/** True when `value` has the input kind expected by `propertyType`. */
export function fitsPropertyType(value: FormValue, propertyType: WritablePropertyType): boolean {
  return value.kind === formValueKindFor(propertyType);
}
