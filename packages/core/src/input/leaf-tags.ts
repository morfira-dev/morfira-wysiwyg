/** One canonical ordinary leaf vocabulary for native input and replacement. */
export const ordinaryLeafSelector = 'p,h1,h2,h3,h4,h5,h6';
export const ordinaryLeafTags: ReadonlySet<string> = new Set(ordinaryLeafSelector.split(','));
