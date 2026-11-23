import type { ImageOptions, ImageValue } from '@morfira-dev/wysiwyg/plugins/images';

/** Application-owned HTTP example; the server owns authorization, MIME and storage. */
export const createImageUpload = (endpoint: string): NonNullable<ImageOptions['upload']> => {
  if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 2048) throw new TypeError('Expected a bounded upload endpoint.');
  return async (file, { signal, reportProgress }) => {
    signal.throwIfAborted();
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size < 1 || file.size > 5_000_000)
      throw new RangeError('Expected a supported raster file up to 5 MB.');
    const url = new URL(endpoint, location.href);
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
      throw new TypeError('The example upload endpoint must be same-origin HTTP(S).');
    return new Promise<ImageValue>((resolve, reject) => {
      const request = new XMLHttpRequest();
      let settled = false;
      const finish = (error?: unknown, value?: ImageValue) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        request.onload = request.onerror = request.onabort = request.ontimeout = request.onprogress = null;
        request.upload.onprogress = null;
        if (error !== undefined) reject(error);
        else resolve(value!);
      };
      const abort = () => {
        finish(new DOMException('Upload cancelled.', 'AbortError'));
        request.abort();
      };
      request.upload.onprogress = (event) => {
        if (settled) return;
        try { reportProgress({ loaded: event.loaded, ...(event.lengthComputable ? { total: event.total } : {}) }); }
        catch (error) { finish(error); request.abort(); }
      };
      request.onerror = () => finish(new Error('Upload transport failed.'));
      request.ontimeout = () => finish(new Error('Upload timed out.'));
      request.onprogress = (event) => {
        if (event.loaded > 65536) { finish(new RangeError('Upload response is too large.')); request.abort(); }
      };
      request.onabort = () => finish(new DOMException('Upload cancelled.', 'AbortError'));
      request.onload = () => {
        if (settled) return;
        try {
          if (request.status < 200 || request.status >= 300 || request.responseText.length > 65536) throw new Error('Upload response rejected.');
          if (request.responseURL && new URL(request.responseURL).origin !== location.origin) throw new TypeError('Upload response redirected outside the origin.');
          const value: unknown = JSON.parse(request.responseText);
          if (!value || typeof value !== 'object' || Array.isArray(value) || !('src' in value)
            || typeof value.src !== 'string' || value.src.length > 2048) throw new TypeError('Invalid upload response.');
          const source = new URL(value.src, location.href);
          if (source.origin !== location.origin || !['http:', 'https:'].includes(source.protocol) || source.username || source.password)
            throw new TypeError('The example image URL must be same-origin HTTP(S).');
          const alt = 'alt' in value ? value.alt : '';
          if (typeof alt !== 'string' || alt.length > 1024) throw new TypeError('Invalid image alternative text.');
          finish(undefined, { src: source.href, alt });
        }
        catch (error) { finish(error); }
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      try {
        request.open('POST', url.href);
        request.timeout = 30000;
        const form = new FormData();
        form.append('file', file);
        request.send(form);
      }
      catch (error) { finish(error); request.abort(); }
    });
  };
};
