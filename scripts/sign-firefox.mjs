// Builds the Firefox MV3 extension and signs it on AMO's unlisted channel (self-distribution).
// Usage: pnpm sign:firefox [--dry-run]   (dev only; the signed .xpi lands in web-ext-artifacts/)
//
// Keys: WEB_EXT_API_KEY / WEB_EXT_API_SECRET from the environment, else from .env.local at the
// repo root (parsed here, never sourced by a shell). Values are never printed: they reach web-ext
// only through its environment, and any occurrence in child output is replaced with [redacted].
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvFile } from './lib/env-file.mjs';
import { createScrubber } from './lib/scrub.mjs';

const KEY_VAR = 'WEB_EXT_API_KEY';
const SECRET_VAR = 'WEB_EXT_API_SECRET';
const KEY_RE = /^user:\d+:\d+$/;
const KEYS_URL = 'https://addons.mozilla.org/developers/addon/api/key/';
const SOURCE_DIR = '.output/firefox-mv3';
const ARTIFACTS_DIR = 'web-ext-artifacts';
const REDACTED = '[redacted]';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

/** @param {string} message */
const say = (message) => process.stdout.write(`${message}\n`);
/** @param {string} message @returns {never} */
const fail = (message) => {
  process.stderr.write(`\nsign:firefox: ${message}\n`);
  process.exit(1);
};

// --- Arguments --------------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  say('Usage: pnpm sign:firefox [--dry-run]');
  say('  --dry-run  validate keys and version, run the build, skip signing');
  process.exit(0);
}
const unknown = args.filter((a) => a !== '--dry-run');
if (unknown.length > 0) fail(`unknown argument(s): ${unknown.join(' ')}. Usage: pnpm sign:firefox [--dry-run]`);
const dryRun = args.includes('--dry-run');

// --- Keys ------------------------------------------------------------------------------------
const envFile = join(root, '.env.local');
/** @type {Record<string, string> | undefined} */
let fileVars;
/** @param {string} name @returns {{ value: string | undefined, from: string }} */
function lookup(name) {
  const fromEnv = process.env[name];
  if (fromEnv !== undefined && fromEnv !== '') return { value: fromEnv, from: 'environment' };
  if (fileVars === undefined) {
    fileVars = {};
    if (existsSync(envFile)) {
      const { vars, invalidLines } = parseEnvFile(readFileSync(envFile, 'utf8'));
      fileVars = vars;
      if (invalidLines.length > 0) {
        process.stderr.write(
          `Warning: ignored malformed line(s) ${invalidLines.join(', ')} in .env.local (expected KEY=value).\n`,
        );
      }
    }
  }
  return { value: fileVars[name], from: '.env.local' };
}

const help =
  `Create or view your AMO API credentials at ${KEYS_URL}\n` +
  `then set them in .env.local at the repo root (copy .env.example), or export them in your shell.`;

const key = lookup(KEY_VAR);
const secret = lookup(SECRET_VAR);
/** @type {string[]} */
const problems = [];
if (key.value === undefined || key.value.trim() === '') {
  problems.push(`${KEY_VAR} is missing (checked the environment and .env.local).`);
} else if (!KEY_RE.test(key.value.trim())) {
  problems.push(`${KEY_VAR} (from ${key.from}) doesn't look like an AMO JWT issuer (expected the form user:<digits>:<digits>).`);
}
if (secret.value === undefined || secret.value.trim() === '') {
  problems.push(`${SECRET_VAR} is missing (checked the environment and .env.local).`);
} else if (/\s/.test(secret.value.trim())) {
  problems.push(`${SECRET_VAR} (from ${secret.from}) contains whitespace; paste the JWT secret as a single token.`);
} else if (KEY_RE.test(secret.value.trim())) {
  problems.push(`${SECRET_VAR} (from ${secret.from}) looks like a JWT issuer. Did you swap ${KEY_VAR} and ${SECRET_VAR}?`);
}
if (problems.length > 0) fail(`AMO API credentials aren't usable:\n${problems.map((p) => `- ${p}`).join('\n')}\n\n${help}`);

const apiKey = /** @type {string} */ (key.value).trim();
const apiSecret = /** @type {string} */ (secret.value).trim();
say(`AMO credentials: ${KEY_VAR} from ${key.from}, ${SECRET_VAR} from ${secret.from} (values hidden).`);

// --- Version ---------------------------------------------------------------------------------
/** @type {{ version?: unknown }} */
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (typeof pkg.version !== 'string' || pkg.version === '') fail('package.json has no "version".');
const version = pkg.version;
say(`Signing Sitecatch v${version} on AMO's unlisted channel${dryRun ? ' (dry run: build only, no signing)' : ''}.`);
say(`AMO rejects a version it has already signed: bump "version" in package.json (and CHANGELOG.md) for every new build.`);
const artifactsPath = join(root, ARTIFACTS_DIR);
if (existsSync(artifactsPath) && readdirSync(artifactsPath).some((f) => f.endsWith(`-${version}.xpi`))) {
  process.stderr.write(`Warning: ${ARTIFACTS_DIR}/ already has a signed .xpi for v${version}; AMO will likely reject it.\n`);
}

// --- Child processes -------------------------------------------------------------------------
// Real AMO values are long (the secret is 64 hex chars). Values too short to be real would only
// mangle ordinary output if redacted (e.g. a dummy `x` in a dry run), so they are skipped.
const MIN_SCRUB_LENGTH = 6;
const secrets = [apiKey, apiSecret].filter((s) => s.length >= MIN_SCRUB_LENGTH);

/**
 * Streams `source` to `sink` with every secret value replaced by [redacted].
 * @param {import('node:stream').Readable} source
 * @param {NodeJS.WriteStream} sink
 */
function pipeScrubbed(source, sink) {
  const scrubber = createScrubber(secrets, REDACTED);
  source.setEncoding('utf8');
  source.on('data', (/** @type {string} */ chunk) => sink.write(scrubber.push(chunk)));
  source.on('end', () => sink.write(scrubber.flush()));
}

/**
 * @param {string} command
 * @param {string[]} commandArgs
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<number>} exit code
 */
function run(command, commandArgs, env) {
  say(`\n$ ${command} ${commandArgs.join(' ')}`);
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: isWindows, // pnpm / .bin shims are .cmd files on Windows; args are constants.
    });
    if (child.stdout) pipeScrubbed(child.stdout, process.stdout);
    if (child.stderr) pipeScrubbed(child.stderr, process.stderr);
    child.on('error', (error) => {
      process.stderr.write(`sign:firefox: couldn't start ${command}: ${error.message}\n`);
      resolve(1);
    });
    child.on('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

// The build never needs the AMO keys.
const buildEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== KEY_VAR && name !== SECRET_VAR),
);

const buildCode = await run('pnpm', ['build:firefox'], buildEnv);
if (buildCode !== 0) fail(`build failed (exit ${buildCode}); nothing was signed.`);

if (dryRun) {
  say(`\nDry run OK: keys look valid, v${version} built into ${SOURCE_DIR}. Skipped signing.`);
  process.exit(0);
}

const webExt = join(root, 'node_modules', '.bin', isWindows ? 'web-ext.cmd' : 'web-ext');
if (!existsSync(webExt)) fail('web-ext is not installed locally. Run `pnpm install` first.');

// web-ext reads WEB_EXT_API_KEY / WEB_EXT_API_SECRET from its environment; never put them in argv.
const signCode = await run(webExt, ['sign', '-s', SOURCE_DIR, '--channel=unlisted'], {
  ...process.env,
  [KEY_VAR]: apiKey,
  [SECRET_VAR]: apiSecret,
});
if (signCode === 0) {
  say(`\nSigned v${version}. Install the .xpi from ${ARTIFACTS_DIR}/ via about:addons → gear → Install Add-on From File…`);
} else {
  process.stderr.write(`\nsign:firefox: web-ext sign exited with ${signCode}.\n`);
}
process.exit(signCode);
