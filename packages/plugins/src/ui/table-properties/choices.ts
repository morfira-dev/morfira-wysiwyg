import { alignments, verticalAlignments, textAlignments, directions, borderStyles } from '../../table-properties/choices.js';
import type { TablePropertiesFormField } from './types.js';
import type { TablePropertyChoice } from './internal-types.js';

/** Shared native options and draft validation, with the existing label order. */
export const propertyChoices: Partial<Record<TablePropertiesFormField, TablePropertyChoice>> = {
  alignment: [['reset', ...alignments], 'Unsupported table placement.'],
  cellVerticalAlign: [['reset', ...verticalAlignments], 'Unsupported cell alignment.'],
  cellTextAlign: [['reset', ...textAlignments], 'Unsupported cell text alignment.'],
  cellDirection: [['reset', ...directions], 'Unsupported cell direction.'],
  cellBorderStyle: [['reset', ...borderStyles], 'Unsupported cell border style.'],
  headerRow: [['off', 'on'], 'Unsupported table header choice.'],
  headerColumn: [['off', 'on'], 'Unsupported table header choice.'],
};

export const propertyChoiceValue = (label: string): string => label === 'reset' || label === 'off' ? '' : label === 'on' ? 'true' : label;
