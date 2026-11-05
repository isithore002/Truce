import { useEffect, useState } from "react";

/** A tiny History-API router: three pages do not need a dependency. */
export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    window.addEventListener("truce:navigate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("truce:navigate", onPop);
    };
  }, []);
  return path;
}

export function navigate(to: string) {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new Event("truce:navigate"));
  window.scrollTo(0, 0);
}

/** Matches "/pay/:hash"-style patterns. Returns the params or undefined. */
export function match(pattern: string, path: string): Record<string, string> | undefined {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return undefined;
  }
  return params;
}
