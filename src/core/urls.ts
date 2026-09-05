const marker = document.querySelector<HTMLMetaElement>('meta[name="odd-index-base"]');
export const siteBase = new URL(marker?.content || './', window.location.href);

export function siteUrl(path = ''): string {
  return new URL(path, siteBase).href;
}

export function projectUrl(id: string): string {
  return siteUrl(`projects/${encodeURIComponent(id)}/`);
}
