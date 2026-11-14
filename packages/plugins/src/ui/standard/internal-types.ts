import type { LinkFormController } from '../links/types.js';
import type { ImageFormController } from '../images/types.js';
import type { SearchFormController } from '../search/types.js';

export type StandardPanel = 'link' | 'image' | 'search' | 'table';

export interface TablePanelController {
  refresh(): void;
  destroy(): void;
}

export type ActiveStandardPanel =
  | { kind: 'link'; controller: LinkFormController }
  | { kind: 'image'; controller: ImageFormController }
  | { kind: 'search'; controller: SearchFormController }
  | { kind: 'table'; controller: TablePanelController };
