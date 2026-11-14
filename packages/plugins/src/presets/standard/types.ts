import type { MinimalPresetOptions } from '../minimal/types.js';
import type { TableOptions } from '../../tables/types.js';
import type { ImageOptions } from '../../images/types.js';
import type { StatisticsOptions } from '../../statistics/types.js';
import type { MarkdownShortcutOptions } from '../../markdown/types.js';
import type { AutolinkOptions } from '../../autolink/types.js';

export interface StandardPresetOptions extends MinimalPresetOptions {
  tables?: TableOptions | false;
  images?: ImageOptions | false;
  search?: boolean;
  statistics?: StatisticsOptions | false;
  markdown?: MarkdownShortcutOptions | false;
  autolink?: AutolinkOptions | false;
}
