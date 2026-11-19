import type { OfficeSample } from './types.js';
export type { OfficeSample } from './types.js';

/** Authored representative HTML, not clipboard captures from external applications. */
export const officePasteSamples: Record<OfficeSample, string> = {
  word: '<p>Word sample</p><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1. </span><strong>First item</strong></p><p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">• </span>Nested item</p><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2. </span>Second item</p><p>After list</p>',
  excel: '<meta name="ProgId" content="Excel.Sheet"><style>.xl65{color:red}</style><table><tbody><tr><td colspan="2"><strong>Excel sample</strong></td></tr><tr><td>Item</td><td>Quantity</td></tr><tr><td>Apples</td><td>12</td></tr></tbody></table>',
  'google-docs': '<b id="docs-internal-guid-morfira-sample" style="font-weight:normal"><h2>Google Docs sample</h2><p>Ordinary text and <b>bold text</b>, <em>emphasis</em> and <a href="https://example.com">a link</a>.</p><ul><li>First item</li><li>Second item</li></ul></b>',
};
