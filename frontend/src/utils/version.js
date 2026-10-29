export const VERSION = { major:1, minor:1, patch:0, label:'stable', releaseDate:'2026-05-25' };
export const getVersion     = () => `${VERSION.major}.${VERSION.minor}.${VERSION.patch}`;
export const getFullVersion = () => {
  const label = VERSION.label !== 'stable' ? `-${VERSION.label}` : '';
  return `v${getVersion()}${label}`;
};
