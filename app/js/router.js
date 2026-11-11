/**
 * IronLog — hash router.
 *
 * Hash routing keeps the app working from any base path (it is served from
 * /fitness/app/ on GitHub Pages and from / in local preview) with no server
 * rewrite rules.
 */

export const ROUTES = ["home", "workout", "history", "stats", "library", "settings", "routine-editor"];

export function parseHash(hash) {
  const raw = String(hash ?? "").replace(/^#\/?/, "");
  const [path, queryString] = raw.split("?");
  const name = path.replace(/\/+$/, "");
  const route = ROUTES.includes(name) ? name : "home";
  const params = new URLSearchParams(queryString ?? "");
  return { route, params };
}

export class Router {
  constructor({ onNavigate } = {}) {
    this.onNavigate = onNavigate ?? (() => {});
    this.current = parseHash(globalThis.location?.hash);
    this._listener = () => {
      this.current = parseHash(globalThis.location?.hash);
      this.onNavigate(this.current);
    };
  }

  start() {
    globalThis.addEventListener?.("hashchange", this._listener);
    this.onNavigate(this.current);
    return this;
  }

  stop() {
    globalThis.removeEventListener?.("hashchange", this._listener);
  }

  go(route, params = {}) {
    const search = new URLSearchParams(params).toString();
    const target = `#/${route}${search ? `?${search}` : ""}`;
    if (globalThis.location && globalThis.location.hash !== target) {
      globalThis.location.hash = target;
    } else {
      this.current = parseHash(target);
      this.onNavigate(this.current);
    }
  }
}
