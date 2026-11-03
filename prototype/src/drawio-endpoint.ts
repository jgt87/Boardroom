export const DEFAULT_DRAWIO_EDITOR = 'https://embed.diagrams.net/';
/** Deployment-owned endpoint only; board files cannot choose an executable editor. */
export function drawioEndpoint(value = DEFAULT_DRAWIO_EDITOR): { url: string; origin: string } {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Draw.io editor must use HTTPS, or HTTP on localhost, without credentials, query or fragment.');
  url.pathname = url.pathname.replace(/\/?$/, '/');
  return { url: url.href, origin: url.origin };
}
