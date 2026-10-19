// Minimal dotenv-style parser for git-ignored local env files (e.g. .env.local).
// Parses the text itself instead of `source`-ing it in a shell, so a malformed
// line can never be echoed back (with its value) in a shell error message.
// Error messages name line numbers and variables only, never values.

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Parses `KEY=value` lines. Tolerates CRLF, blank lines, `#` comments,
 * a leading `export `, spaces around `=`, and single/double quotes around the value.
 * Unquoted values may carry a trailing ` # comment`.
 * @param {string} text
 * @returns {{ vars: Record<string, string>, invalidLines: number[] }}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const vars = {};
  /** @type {number[]} */
  const invalidLines = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;

    const body = line.startsWith('export ') ? line.slice('export '.length).trimStart() : line;
    const eq = body.indexOf('=');
    const key = eq === -1 ? '' : body.slice(0, eq).trim();
    if (!KEY_RE.test(key)) {
      invalidLines.push(index + 1);
      return;
    }

    let value = body.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else if (quote === '"' || quote === "'") {
      // Opening quote without a matching closing one.
      invalidLines.push(index + 1);
      return;
    } else {
      const hash = value.search(/\s#/);
      if (hash !== -1) value = value.slice(0, hash).trimEnd();
    }
    vars[key] = value;
  });

  return { vars, invalidLines };
}
