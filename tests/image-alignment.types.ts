import type { ImageAlignment, ImageCommands, ImageValue } from '@morfira-dev/wysiwyg/plugins/images';

declare global {
  interface Window {
    alignmentImageAPI: ImageCommands;
  }
}

const assertImageAlignmentTypes = (api: ImageCommands) => {
  const alignment: ImageAlignment = 'center';
  const image: ImageValue = { src: '/logo.svg', alignment };
  api.insert(image);
  api.update({ alignment: 'right' });
  api.align('left');
  api.align(false);
  // @ts-expect-error placement is physical, not logical text direction
  api.align('start');
  // @ts-expect-error reset is false, not null
  api.update({ alignment: null });
};
void assertImageAlignmentTypes;
