import type { MediaProvider, MediaReference } from './types.js';

export const mediaReference = (provider: unknown, id: unknown): MediaReference => {
  if (typeof id !== 'string' || (provider === 'youtube' ? !/^[A-Za-z0-9_-]{11}$/.test(id)
    : provider === 'vimeo' ? !/^[1-9][0-9]{0,11}$/.test(id) : true))
    throw new TypeError('Unsupported media provider or ID.');
  return Object.freeze({ provider: provider as MediaProvider, id,
    url: provider === 'youtube' ? `https://www.youtube.com/watch?v=${id}` : `https://vimeo.com/${id}` });
};

/** Parse only provider identities; no supplied host/query becomes an iframe URL. */
export const parseMediaURL = (input: string): MediaReference => {
  if (typeof input !== 'string' || input.length > 2048 || /[\u0000-\u001f\u007f]/.test(input))
    throw new TypeError('A bounded HTTPS media URL is required.');
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new TypeError('A valid HTTPS media URL is required.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new TypeError('Media URLs require ordinary HTTPS without credentials or ports.');
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  if (host === 'youtu.be') {
    const matched = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(path);
    if (matched) return mediaReference('youtube', matched[1]);
  }
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) {
    const embedded = /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(path);
    if (embedded) return mediaReference('youtube', embedded[1]);
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)
      && path === '/watch' && url.searchParams.getAll('v').length === 1)
      return mediaReference('youtube', url.searchParams.get('v'));
  }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const matched = (host === 'player.vimeo.com' ? /^\/video\/([1-9][0-9]{0,11})\/?$/ : /^\/([1-9][0-9]{0,11})\/?$/).exec(path);
    // Unlisted private hashes are not part of this public-provider profile.
    if (matched && !url.searchParams.has('h')) return mediaReference('vimeo', matched[1]);
  }
  throw new TypeError('Only supported YouTube and public Vimeo URLs are accepted.');
};

export const mediaEmbedURL = (provider: MediaProvider, id: string): string => {
  const checked = mediaReference(provider, id);
  return checked.provider === 'youtube' ? `https://www.youtube-nocookie.com/embed/${checked.id}?autoplay=0`
    : `https://player.vimeo.com/video/${checked.id}?autoplay=0&dnt=1`;
};
