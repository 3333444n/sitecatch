// Redacts secret values from streamed text, including a secret split across two chunks.

/**
 * @param {string[]} secrets values to redact (empty strings are ignored)
 * @param {string} [replacement]
 * @returns {{ push: (chunk: string) => string, flush: () => string }}
 *   `push` returns the text that is safe to emit now; `flush` returns the held-back rest.
 */
export function createScrubber(secrets, replacement = '[redacted]') {
  const values = secrets.filter((s) => s.length > 0);
  // Secrets never span a newline, and at most (longest - 1) trailing chars can be a secret's prefix.
  const holdBack = Math.max(0, ...values.map((s) => s.length - 1));
  /** @param {string} text */
  const scrub = (text) => values.reduce((acc, s) => acc.split(s).join(replacement), text);
  let pending = '';

  return {
    push(chunk) {
      const text = scrub(pending + chunk);
      const keep = Math.min(holdBack, text.length - (text.lastIndexOf('\n') + 1));
      pending = text.slice(text.length - keep);
      return text.slice(0, text.length - keep);
    },
    flush() {
      const rest = scrub(pending);
      pending = '';
      return rest;
    },
  };
}
