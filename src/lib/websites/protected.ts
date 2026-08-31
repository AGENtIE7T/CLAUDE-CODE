/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Protected-URL matching — a hard write-safety gate.
 * ─────────────────────────────────────────────────────────────────────────
 *  A URL that matches any protected pattern may NEVER be modified by a write
 *  task, regardless of approval. Patterns are simple, predictable globs (no
 *  regex injection surface):
 *
 *    *   matches any run of characters except "/"
 *    **  matches any run of characters including "/"
 *    ?   matches a single character except "/"
 *
 *  Matching is done on the URL PATH (plus optional query), case-sensitively
 *  for the path. Patterns may be written as paths ("/checkout/*") or full
 *  URLs; full URLs are reduced to their path+search before matching.
 */

/** Escape regex metacharacters except our glob tokens, then expand globs. */
function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        out += ".*"; // ** → any chars incl. "/"
        i++;
      } else {
        out += "[^/]*"; // * → any chars except "/"
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

/** Reduce a pattern or URL to the comparable path (+search). */
function toPath(patternOrUrl: string): string {
  if (/^https?:\/\//i.test(patternOrUrl)) {
    try {
      const u = new URL(patternOrUrl);
      return u.pathname + (u.search || "");
    } catch {
      return patternOrUrl;
    }
  }
  // Ensure a leading slash for bare paths.
  return patternOrUrl.startsWith("/") ? patternOrUrl : `/${patternOrUrl}`;
}

/** True iff `url` matches `pattern`. */
export function matchesPattern(url: string, pattern: string): boolean {
  const target = toPath(url);
  const re = globToRegExp(toPath(pattern));
  return re.test(target);
}

/** True iff `url` matches ANY protected pattern. */
export function isProtected(url: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesPattern(url, p));
}

/**
 * Partition a set of candidate URLs into allowed vs. protected. Write tasks
 * use this to strip protected URLs before proposing changes, and to prove none
 * slipped through before executing.
 */
export function partitionProtected(
  urls: string[],
  patterns: string[],
): { allowed: string[]; protectedUrls: string[] } {
  const allowed: string[] = [];
  const protectedUrls: string[] = [];
  for (const u of urls) {
    if (isProtected(u, patterns)) protectedUrls.push(u);
    else allowed.push(u);
  }
  return { allowed, protectedUrls };
}
