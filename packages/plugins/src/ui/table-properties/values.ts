import { propertyChoices, propertyChoiceValue } from './choices.js';
import type { TablePropertiesPatch } from '../../table-properties/types.js';
import type { TablePropertiesFormField, TablePropertiesFormValues } from './types.js';

export const propertyFields: readonly TablePropertiesFormField[] = ['width', 'rowMinHeight', 'alignment', 'cellBackground', 'cellBorder', 'cellPadding', 'cellBorderWidth', 'cellBorderStyle', 'cellVerticalAlign', 'cellTextAlign', 'cellDirection', 'headerRow', 'headerColumn', 'caption'];
export const checkedFormValues = (input: Partial<TablePropertiesFormValues>): Partial<TablePropertiesFormValues> => {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new TypeError('Expected table property form values.');
  const entries = Reflect.ownKeys(input).map((key) => {
    if (typeof key !== 'string' || !propertyFields.includes(key as TablePropertiesFormField))
      throw new TypeError('Unknown table property field.');
    const value = input[key as TablePropertiesFormField];
    if (typeof value !== 'string' || value.length > (key === 'caption' ? 5000 : 100)) throw new TypeError('Property form values must be bounded strings.');
    const choice = propertyChoices[key as TablePropertiesFormField];
    if (choice && !choice[0].some((label) => propertyChoiceValue(label) === value)) throw new TypeError(choice[1]);
    return [key, value];
  });
  return Object.fromEntries(entries);
};
export const propertyPatch = (values: TablePropertiesFormValues, dirty: ReadonlySet<TablePropertiesFormField>): TablePropertiesPatch =>
  Object.fromEntries([...dirty].map((key) => [key,
    key === 'headerRow' || key === 'headerColumn' ? values[key] === 'true'
      : key === 'caption' ? values[key] || false : values[key].trim() || false,
  ])) as TablePropertiesPatch;
