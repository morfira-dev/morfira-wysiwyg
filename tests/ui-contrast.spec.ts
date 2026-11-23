import { expect, test } from '@playwright/test';

const luminance = (value: string): number => {
  const components = value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((component) => {
    const channel = component / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return components[0] * .2126 + components[1] * .7152 + components[2] * .0722;
};
const contrast = (foreground: string, background: string): number => {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
};

for (const dark of [false, true]) {
  test(`muted quote, caption and placeholder retain readable computed contrast (${dark ? 'application dark override' : 'default light'})`, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('textbox')).toBeVisible();
    const result = await page.evaluate((dark) => {
      window.dispose();
      const host = document.createElement('div');
      document.body.replaceChildren(host);
      if (dark) {
        host.style.setProperty('--mw-muted', '#b6c2d2');
        host.style.setProperty('--mw-surface', '#1c2130');
        host.style.setProperty('--mw-text', '#e0e6f0');
      }
      const editor = window.createEditor(host, { placeholder: 'Start writing', plugins: [window.createImages()],
        value: '<blockquote>Quoted text</blockquote><figure><img src="/logo.svg" alt="Example"><figcaption>Image caption</figcaption></figure>' });
      window.editor = editor;
      const background = getComputedStyle(editor.element).backgroundColor;
      const quote = getComputedStyle(editor.surface.querySelector('blockquote')!).color;
      const caption = getComputedStyle(editor.surface.querySelector('figcaption')!).color;
      editor.setHTML('<p><br></p>');
      const placeholder = getComputedStyle(editor.surface, '::before').color;
      return { background, quote, caption, placeholder, empty: editor.surface.dataset.empty };
    }, dark);
    expect(result.empty).toBe('true');
    for (const foreground of [result.quote, result.caption, result.placeholder])
      expect(contrast(foreground, result.background)).toBeGreaterThanOrEqual(4.5);
    if (dark) expect(result.quote).toBe('rgb(182, 194, 210)');
  });
}

test('forced-color editor keyboard focus remains visible without changing document or history', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => {
    window.dispose();
    const before = document.createElement('button');
    before.textContent = 'Before editor';
    const host = document.createElement('div');
    document.body.replaceChildren(before, host);
    window.editor = window.createEditor(host, { value: '<p>Keyboard focus</p>' });
  });
  await page.getByRole('button', { name: 'Before editor' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox')).toBeFocused();
  const result = await page.evaluate(() => {
    const style = getComputedStyle(window.editor.surface);
    const probe = document.createElement('span');
    probe.style.color = 'Highlight';
    document.body.append(probe);
    const highlight = getComputedStyle(probe).color;
    probe.remove();
    return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor,
      highlight, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  });
  expect(result).toMatchObject({ outline: 'solid', html: '<p>Keyboard focus</p>', undo: false });
  expect(result.width).toBeGreaterThanOrEqual(2);
  expect(result.color).toBe(result.highlight);
});
