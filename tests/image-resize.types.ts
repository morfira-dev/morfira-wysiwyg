import type { ImageCommands, ImageResize } from '@morfira-dev/wysiwyg/plugins/images';

declare global {
  interface Window {
    resizeImageAPI: ImageCommands;
  }
}

const assertImageResizeTypes = (api: ImageCommands) => {
  const width: ImageResize = { width: 240 };
  api.resize(width);
  api.resize({ height: 180 });
  // @ts-expect-error proportional resize accepts one axis, not an independent pair
  api.resize({ width: 240, height: 180 });
  // @ts-expect-error proportional resize requires a dimension
  api.resize({});
  // @ts-expect-error resize dimensions are numbers
  api.resize({ width: '240' });
};
void assertImageResizeTypes;
