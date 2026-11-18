import type { TablePropertiesPatch } from '../../table-properties/types.js';
import type { TablePropertiesFormField, TablePropertiesFormValues } from './types.js';

export const propertyFields: readonly TablePropertiesFormField[] = ['width', 'alignment', 'cellBackground', 'cellBorder', 'cellVerticalAlign', 'headerRow', 'headerColumn', 'caption'];
export const checkedFormValues = (input: Partial<TablePropertiesFormValues>): Partial<TablePropertiesFormValues> => {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new TypeError('Expected table property form values.');
  const entries = Reflect.ownKeys(input).map((key) => {
    if (typeof key !== 'string' || !propertyFields.includes(key as TablePropertiesFormField))
      throw new TypeError('Unknown table property field.');
    const value = input[key as TablePropertiesFormField];
    if (typeof value !== 'string' || value.length > (key === 'caption' ? 5000 : 100)) throw new TypeError('Property form values must be bounded strings.');
    if (key === 'alignment' && !['', 'left', 'center', 'right'].includes(value)) throw new TypeError('Unsupported table placement.');
    if (key === 'cellVerticalAlign' && !['', 'top', 'middle', 'bottom'].includes(value)) throw new TypeError('Unsupported cell alignment.');
    if ((key === 'headerRow' || key === 'headerColumn') && !['', 'true'].includes(value)) throw new TypeError('Unsupported table header choice.');
    return [key, value];
  });
  return Object.fromEntries(entries);
};
export const propertyPatch = (values: TablePropertiesFormValues, dirty: ReadonlySet<TablePropertiesFormField>): TablePropertiesPatch =>
  Object.fromEntries([...dirty].map((key) => [key,
    key === 'headerRow' || key === 'headerColumn' ? values[key] === 'true'
      : key === 'caption' ? values[key] || false : values[key].trim() || false,
  ])) as TablePropertiesPatch;
