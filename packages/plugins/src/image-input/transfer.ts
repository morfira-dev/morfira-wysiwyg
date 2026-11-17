const supported = (type: string) => ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(type);

export const hasInputFiles = (transfer: DataTransfer): boolean =>
  transfer.files.length > 0 || [...transfer.types].includes('Files') || [...transfer.items].some((item) => item.kind === 'file');

export const inputFile = (transfer: DataTransfer): File => {
  if (transfer.files.length !== 1) throw new TypeError('Paste or drop exactly one image file.');
  const file = transfer.files[0];
  if (!file.size || !supported(file.type)) throw new TypeError('Choose a supported nonempty raster image.');
  return file;
};
