import type { Page } from '@playwright/test';
import { initializeTableHeaders } from './table-headers-caption.fixture.js';
import './table-row-height.types.js';

export const rowHeightSample = '<table title="Row heights"><caption>Keep caption</caption><thead><tr><th scope="col"><p>Area</p></th><th scope="col"><p>Value</p></th><th scope="col"><p>Outside</p></th></tr></thead><tbody><tr style="color:navy"><td rowspan="2"><p><strong>Merged</strong></p></td><td><p>First</p></td><td><p>Outside A</p></td></tr><tr><td><p>Second</p></td><td><p>Outside B</p></td></tr><tr><td><p>Last</p></td><td><p>Third</p></td><td><p>Outside C</p></td></tr></tbody></table><p>After</p>';

export const initializeRowHeight = async (page: Page, value = rowHeightSample, form = false) => {
  await initializeTableHeaders(page, value, form);
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')?.firstChild
      ?? window.editor.surface.querySelector('td p,th p')!.firstChild!;
    window.editor.surface.focus();
    const native = document.getSelection()!;
    native.setBaseAndExtent(text, 0, text, 0);
    window.headerForm?.refresh();
  });
};
