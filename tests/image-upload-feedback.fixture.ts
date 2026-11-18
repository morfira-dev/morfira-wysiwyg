import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import './image-upload-feedback.types.js';

export const initializeUploadFeedback = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => {
    window.dispose();
    const host = document.createElement('div');
    host.className = 'upload-feedback-editor';
    document.body.replaceChildren(host);
    window.feedbackAttempts = [];
    window.feedbackReports = [];
    window.changes = [];
    window.editor = window.createEditor(host, { value: '<p><strong>abcd</strong></p>', locale: 'en',
      plugins: [window.createImages({ upload: (file, context) => new Promise((finish, fail) => {
        window.feedbackAttempts.push({ context, file, finish, fail });
      }) })], onChange: (change) => window.changes.push(change) });
    window.feedbackAPI = window.imageCommands(window.editor);
    window.editor.setSelection(2);
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  });
};
