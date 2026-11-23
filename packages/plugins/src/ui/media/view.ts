import { localize } from '@morfira-dev/wysiwyg-core';
import type { NodeViewsController } from '../../sdk/types.js';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createNodeViews } from '../../sdk/node-views/index.js';
import { mediaCommands } from '../../media/index.js';
import { mediaEmbedURL } from '../../media/url.js';
import { mediaMessages } from './messages.js';
import type { MediaViewController } from './types.js';

/** External consent-owned iframe views, never editing/persisted DOM. */
export const createMediaView = (host: HTMLElement, editor: Editor): MediaViewController => {
  const commands = mediaCommands(editor);
  const document = editor.surface.ownerDocument;
  if (host.ownerDocument !== document || editor.surface.contains(host) || host.contains(editor.surface))
    throw new Error('Media views require a separate host in the editor document.');
  const element = document.createElement('div');
  element.className = 'mw-media-views';
  host.append(element);
  let disposed = false;
  let cards: NodeViewsController;
  try { cards = createNodeViews(element, editor, {
    name: 'morfira:media',
    create: (context) => {
      const card = document.createElement('section');
      card.className = 'mw-media-card';
      const title = document.createElement('p');
      const notice = document.createElement('p');
      const load = document.createElement('button');
      const unload = document.createElement('button');
      const frameHost = document.createElement('div');
      load.type = unload.type = 'button';
      card.append(title, notice, load, unload, frameHost);
      let retired = false;
      let reference = commands.get(context.node);
      let frame: HTMLIFrameElement | undefined;
      const unmount = () => {
        frame?.remove();
        frame = undefined;
        unload.disabled = true;
        load.disabled = !reference;
      };
      const render = () => {
        const locale = editor.getLocale();
        title.textContent = reference?.title ?? context.text;
        notice.textContent = localize(locale, 'ui.media.notice', mediaMessages);
        load.textContent = localize(locale, 'ui.media.load', mediaMessages);
        unload.textContent = localize(locale, 'ui.media.unload', mediaMessages);
        load.disabled = !reference || !!frame;
        unload.disabled = !frame;
        if (frame && reference) frame.title = reference.title;
      };
      const loaded = () => {
        if (disposed || retired || frame || !card.isConnected) return;
        const current = commands.get(context.node);
        if (!current || !reference || current.provider !== reference.provider || current.id !== reference.id || current.title !== reference.title) return;
        const iframe = document.createElement('iframe');
        iframe.className = 'mw-media-frame';
        iframe.title = current.title;
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
        iframe.allow = 'fullscreen; picture-in-picture; encrypted-media';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.src = mediaEmbedURL(current.provider, current.id);
        // Nothing is attached until the current actual target has passed every check.
        if (disposed || retired || !commands.get(context.node) || !card.isConnected) return;
        frame = iframe;
        frameHost.append(iframe);
        render();
      };
      const unloaded = () => { unmount(); render(); };
      load.addEventListener('click', loaded);
      unload.addEventListener('click', unloaded);
      render();
      return {
        element: card,
        update: () => {
          const next = commands.get(context.node);
          if (!next || !reference || next.provider !== reference.provider || next.id !== reference.id || next.title !== reference.title) unmount();
          reference = next;
          render();
        },
        destroy: () => {
          if (retired) return;
          retired = true;
          load.removeEventListener('click', loaded);
          unload.removeEventListener('click', unloaded);
          unmount();
        },
      };
    },
  }); }
  catch (error) { element.remove(); throw error; }
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    stopDestroy();
    cards.destroy();
    element.remove();
  };
  const stopDestroy = editor.events.on('destroy', destroy);
  return { element, refresh: () => { if (!disposed) cards.refresh(); }, destroy };
};
