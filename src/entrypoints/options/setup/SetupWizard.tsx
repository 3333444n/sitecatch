/**
 * Workspaces & guided setup (#/setup). With connections: the list of
 * workspaces (databases, replace token, remove, add). The wizard (first run,
 * "Add workspace", "Replace token"): choose auth method → create token → grant
 * api.notion.com access → paste & validate → (connection only) share
 * databases → list visible databases.
 */
import { useEffect, useState } from 'preact/hooks';
import type { AppError, AppErrorAction } from '@/lib/errors';
import { sendRequest } from '@/lib/messaging/client';
import type { ConnectionSummary } from '@/lib/messaging/protocol';
import type { TokenKind } from '@/lib/storage/items';
import {
  Badge,
  Banner,
  Button,
  Card,
  ErrorBanner,
  ScreenshotSlot,
  Stepper,
  TextInput,
  Field,
  type StepItem,
} from '@/ui/components';
import {
  connectionsStatus,
  refreshConnections,
  removeConnection,
  TOKEN_KIND_LABEL,
  workspaceName,
} from '../lib/connections';
import { setupShot } from '../lib/constants';
import { hasNotionAccess, requestNotionAccess } from '../lib/permissions';
import { navigate } from '../lib/router';
import { DatabaseList } from './DatabaseList';
import { CreateConnectionInstructions, CreatePatInstructions, ShareDatabasesInstructions } from './instructions';

export type StepId = 'method' | 'create' | 'access' | 'token' | 'share' | 'databases';

const STEP_TITLES: Record<StepId, string> = {
  method: 'Choose how to connect',
  create: 'Create the token',
  access: 'Allow access to Notion',
  token: 'Paste your token',
  share: 'Share your databases',
  databases: 'Your databases',
};

export function stepsFor(kind: TokenKind): StepId[] {
  return kind === 'personal'
    ? ['method', 'create', 'access', 'token', 'databases']
    : ['method', 'create', 'access', 'token', 'share', 'databases'];
}

type Validated = ConnectionSummary;

/**
 * #/setup: the workspaces overview once something is connected, otherwise
 * the guided wizard. "Add workspace" and "Replace token" reuse the wizard.
 */
export function SetupWizard() {
  const list = connectionsStatus.value?.connections ?? [];
  const [flow, setFlow] = useState<{ replacing: ConnectionSummary | null } | null>(
    list.length > 0 ? null : { replacing: null },
  );

  if (flow === null) {
    return (
      <WorkspacesOverview
        onAdd={() => {
          setFlow({ replacing: null });
        }}
        onReplace={(c) => {
          setFlow({ replacing: c });
        }}
      />
    );
  }
  return (
    <ConnectWizard
      key={flow.replacing?.id ?? 'new'}
      replacing={flow.replacing}
      onDone={
        list.length > 0
          ? () => {
              setFlow(null);
            }
          : undefined
      }
    />
  );
}

// ---------------------------------------------------------------------------

function WorkspacesOverview({
  onAdd,
  onReplace,
}: {
  onAdd: () => void;
  onReplace: (c: ConnectionSummary) => void;
}) {
  const status = connectionsStatus.value;
  const list = status?.connections ?? [];
  const [open, setOpen] = useState<string | null>(list.length === 1 ? (list[0]?.id ?? null) : null);
  const [error, setError] = useState<AppError | null>(null);

  async function onRemove(c: ConnectionSummary) {
    const ok = window.confirm(
      `Remove “${workspaceName(c)}”? Sitecatch forgets its token. Presets for this workspace stay, but can’t save until you connect it again or pick another workspace for them.`,
    );
    if (!ok) return;
    setError(await removeConnection(c.id));
  }

  return (
    <div class="sco-page sco-setup">
      <header class="sco-page__header sco-page__header--row">
        <div>
          <h1>Workspaces</h1>
          <p class="sco-muted">
            Each Notion workspace needs its own token. Every preset saves into a database in one of these workspaces.
          </p>
        </div>
        <Button variant="primary" icon="plus" onClick={onAdd}>
          Add workspace
        </Button>
      </header>

      {status && !status.hostPermission && (
        <Banner
          tone="warning"
          title="Sitecatch can’t reach api.notion.com"
          actions={
            <GrantAccessButton
              onGranted={() => void refreshConnections()}
              onDenied={() => void refreshConnections()}
            />
          }
        >
          Grant access so Sitecatch can talk to Notion.
        </Banner>
      )}
      {error && (
        <ErrorBanner
          error={error}
          onDismiss={() => {
            setError(null);
          }}
        />
      )}

      <ul class="sco-workspaces" aria-label="Connected workspaces">
        {list.map((c) => (
          <li key={c.id}>
            <Card
              compact
              class="sco-connected"
              headingLevel={2}
              title={workspaceName(c)}
              description={
                <>
                  {TOKEN_KIND_LABEL[c.tokenKind]} · as {c.botName}
                </>
              }
              actions={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={open === c.id ? 'true' : 'false'}
                    onClick={() => {
                      setOpen(open === c.id ? null : c.id);
                    }}
                  >
                    {open === c.id ? 'Hide databases' : 'Databases'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Replace token for ${workspaceName(c)}`}
                    onClick={() => {
                      onReplace(c);
                    }}
                  >
                    Replace token
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label={`Remove ${workspaceName(c)}`}
                    onClick={() => void onRemove(c)}
                  >
                    Remove
                  </Button>
                </>
              }
            >
              {open === c.id ? (
                <DatabaseList
                  connectionId={c.id}
                  tokenKind={c.tokenKind}
                  onErrorAction={(action) => {
                    if (action === 'open-setup' || action === 'reshare-db') onReplace(c);
                  }}
                />
              ) : undefined}
            </Card>
          </li>
        ))}
      </ul>

      <div class="sco-cta">
        <Button
          variant="secondary"
          icon="plus"
          onClick={() => {
            navigate('/presets/new');
          }}
        >
          New preset
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ConnectWizard({ replacing, onDone }: { replacing: ConnectionSummary | null; onDone?: () => void }) {
  const [kind, setKind] = useState<TokenKind>(replacing?.tokenKind ?? 'personal');
  const [step, setStep] = useState<StepId>(replacing ? 'token' : 'method');
  const [granted, setGranted] = useState<boolean | null>(null);
  const [validated, setValidated] = useState<Validated | null>(null);

  useEffect(() => {
    void hasNotionAccess().then(setGranted);
  }, []);

  const steps = stepsFor(kind);
  const index = Math.max(0, steps.indexOf(step));
  const firstRun = onDone === undefined;
  const target = validated ?? replacing;

  function go(id: StepId) {
    setStep(id);
    // Move focus to the new step's heading for keyboard and screen reader users.
    requestAnimationFrame(() => {
      document.getElementById('sco-step-heading')?.focus();
    });
  }

  function next() {
    let i = index + 1;
    // Skip the permission step when access is already granted.
    if (steps[i] === 'access' && granted === true) i += 1;
    const id = steps[i];
    if (id) go(id);
  }

  function back() {
    let i = index - 1;
    if (steps[i] === 'access' && granted === true) i -= 1;
    const id = steps[Math.max(0, i)];
    if (id) go(id);
  }

  const stepItems: StepItem[] = steps.map((id) => ({ id, title: STEP_TITLES[id] }));

  const title = replacing
    ? `Replace the token for “${workspaceName(replacing)}”`
    : firstRun
      ? 'Set up Sitecatch'
      : 'Add a workspace';
  const intro = replacing
    ? 'Paste a new token for this workspace. Its presets keep working with the new token.'
    : firstRun
      ? 'About five minutes. You’ll create a Notion token, paste it here and pick your databases.'
      : 'Each Notion workspace needs its own token. Create one in the workspace you want to add, then paste it here.';

  return (
    <div class="sco-page sco-setup">
      <header class="sco-page__header">
        {onDone && (
          <button type="button" class="sco-back sco-linkbutton" onClick={onDone}>
            ← Workspaces
          </button>
        )}
        <h1>{title}</h1>
        <p class="sco-muted">{intro}</p>
      </header>

      <div class="sco-setup__layout">
        <nav class="sco-setup__progress" aria-label="Setup steps">
          <Stepper
            steps={stepItems}
            current={index}
            onStepClick={(i) => {
              const id = steps[i];
              if (id) go(id);
            }}
          />
        </nav>

        <section class="sco-setup__step" aria-labelledby="sco-step-heading">
          <h2 id="sco-step-heading" tabIndex={-1} class="sco-step-heading">
            <span class="sco-step-heading__num">Step {index + 1} of {steps.length}</span>
            {STEP_TITLES[step]}
          </h2>

          {step === 'method' && (
            <MethodStep
              value={kind}
              onChange={(k) => {
                setKind(k);
              }}
            />
          )}
          {step === 'create' && (kind === 'personal' ? <CreatePatInstructions /> : <CreateConnectionInstructions />)}
          {step === 'access' && <AccessStep granted={granted} onGranted={setGranted} />}
          {step === 'token' && (
            <TokenStep
              kind={kind}
              granted={granted}
              onGranted={setGranted}
              validated={validated}
              replacing={replacing}
              onValidated={(v) => {
                setValidated(v);
                void refreshConnections();
              }}
            />
          )}
          {step === 'share' && <ShareDatabasesInstructions />}
          {step === 'databases' &&
            (target ? (
              <DatabasesStep
                kind={kind}
                connection={target}
                onErrorAction={(action) => {
                  if (action === 'open-setup') go('token');
                  else if (action === 'reshare-db') go(kind === 'connection' ? 'share' : 'token');
                  else if (action === 'grant-permission') go('access');
                }}
              />
            ) : (
              <Banner tone="info" title="Paste your token first" live={false}>
                Go back to “{STEP_TITLES.token}” and check your token to see its databases.
              </Banner>
            ))}

          <div class="sco-step-nav">
            {index > 0 && (
              <Button variant="ghost" onClick={back}>
                Back
              </Button>
            )}
            {step !== 'databases' && (
              <Button
                variant="primary"
                onClick={next}
                disabled={step === 'token' && validated === null && replacing === null}
              >
                {step === 'method' ? `Continue with ${kind === 'personal' ? 'a personal access token' : 'an internal connection'}` : 'Continue'}
              </Button>
            )}
            {step === 'databases' && onDone && (
              <Button variant="ghost" onClick={onDone}>
                Done
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MethodStep({ value, onChange }: { value: TokenKind; onChange: (k: TokenKind) => void }) {
  const options: { kind: TokenKind; title: string; recommended?: boolean; body: string; points: string[] }[] = [
    {
      kind: 'personal',
      title: 'Personal access token',
      recommended: true,
      body: 'Sitecatch acts as you. It can save into any database you can open, with no per-database sharing.',
      points: [
        'Fastest setup: create a token, paste it, done',
        'Expires after the period you choose (7 days to 1 year)',
        'Your workspace may restrict who can create one',
      ],
    },
    {
      kind: 'connection',
      title: 'Internal connection',
      body: 'Scoped access: Sitecatch only sees the databases you explicitly share with the connection.',
      points: [
        'Tightest scope: nothing is visible until you share it',
        'You must be a Workspace Owner to create it',
        'Needs capabilities Read, Update and Insert content',
      ],
    },
  ];
  return (
    <div class="sco-methods" role="radiogroup" aria-label="How Sitecatch connects to Notion">
      {options.map((o) => {
        const selected = o.kind === value;
        return (
          <button
            key={o.kind}
            type="button"
            role="radio"
            aria-checked={selected ? 'true' : 'false'}
            class={`sco-method${selected ? ' sco-method--selected' : ''}`}
            onClick={() => {
              onChange(o.kind);
            }}
          >
            <span class="sco-method__head">
              <span class="sco-method__radio" aria-hidden="true" />
              <span class="sco-method__title">{o.title}</span>
              {o.recommended && <Badge tone="accent">Recommended</Badge>}
            </span>
            <span class="sco-method__body">{o.body}</span>
            <ul class="sco-method__points">
              {o.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface AccessProps {
  granted: boolean | null;
  onGranted: (g: boolean) => void;
}

/** Button that requests the api.notion.com host permission synchronously on click. */
export function GrantAccessButton({ onGranted, onDenied }: { onGranted: () => void; onDenied: () => void }) {
  return (
    <Button
      variant="primary"
      icon="lock"
      onClick={() => {
        // No await before this call: the browser requires a direct user gesture.
        void requestNotionAccess().then((ok) => {
          if (ok) onGranted();
          else onDenied();
        });
      }}
    >
      Grant access to api.notion.com
    </Button>
  );
}

function AccessStep({ granted, onGranted }: AccessProps) {
  const [denied, setDenied] = useState(false);
  return (
    <div class="sco-instructions">
      <p>
        Sitecatch only ever talks to <code>api.notion.com</code>. Your browser needs to allow that. It doesn’t give
        Sitecatch access to any website you visit.
      </p>
      {granted === true ? (
        <Banner tone="success" title="Access granted">
          Sitecatch can reach api.notion.com. Continue to paste your token.
        </Banner>
      ) : (
        <>
          <GrantAccessButton
            onGranted={() => {
              setDenied(false);
              onGranted(true);
            }}
            onDenied={() => {
              setDenied(true);
              onGranted(false);
            }}
          />
          {denied && (
            <Banner tone="warning" title="Access wasn’t granted">
              Click the button again and choose <strong>Allow</strong> in the browser prompt. Without it Sitecatch can’t
              reach Notion.
            </Banner>
          )}
        </>
      )}
      <ScreenshotSlot
        src={setupShot(7)}
        alt="Browser prompt asking to allow Sitecatch to access api.notion.com"
        caption="The browser asks once. Choose Allow."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface TokenStepProps {
  kind: TokenKind;
  granted: boolean | null;
  onGranted: (g: boolean) => void;
  validated: Validated | null;
  /** The workspace whose token is being replaced, if any. */
  replacing?: ConnectionSummary | null;
  onValidated: (v: Validated) => void;
}

const INVALID_TOKEN_HINT: Record<TokenKind, string> = {
  personal:
    'Copy the token again from Personal access tokens (it’s shown only once, so you may need to create a new one). Check that it hasn’t expired or been revoked.',
  connection:
    'Copy the API token again from the connection’s Configuration tab (Show → Copy). If it was refreshed or the connection deleted, use the current token.',
};

export function TokenStep({ kind, granted, onGranted, validated, replacing = null, onValidated }: TokenStepProps) {
  const [token, setToken] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  async function validate(value: string) {
    const t = value.trim();
    if (t === '') {
      setError({ code: 'validation', message: 'Paste your token first.' });
      return;
    }
    setBusy(true);
    setError(null);
    const res = await sendRequest({ type: 'conn/add', token: t, tokenKind: kind });
    setBusy(false);
    if (res.ok) {
      setToken('');
      onValidated(res.data);
    } else {
      setError(res.error);
    }
  }

  function onErrorAction(action: AppErrorAction) {
    if (action === 'grant-permission') {
      void requestNotionAccess().then((ok) => {
        onGranted(ok);
        if (ok) void validate(token);
      });
    } else if (action === 'retry') {
      void validate(token);
    }
  }

  const label = kind === 'personal' ? 'Personal access token' : 'API token';

  return (
    <div class="sco-instructions">
      {granted === false && (
        <Banner
          tone="warning"
          title="Sitecatch can’t reach api.notion.com yet"
          actions={
            <GrantAccessButton
              onGranted={() => {
                onGranted(true);
              }}
              onDenied={() => {
                onGranted(false);
              }}
            />
          }
        >
          Grant access first, then paste your token.
        </Banner>
      )}
      <form
        class="sco-token-form"
        onSubmit={(e) => {
          e.preventDefault();
          void validate(token);
        }}
      >
        <Field
          label={label}
          hint="Pasting checks the token right away. It’s stored only on this device and sent only to api.notion.com."
        >
          <div class="sco-token-input">
            <TextInput
              type={visible ? 'text' : 'password'}
              mono
              value={token}
              autoComplete="off"
              spellcheck={false}
              placeholder="ntn_…"
              onChange={(v) => {
                setToken(v);
                setError(null);
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData?.getData('text') ?? '';
                if (pasted.trim() === '') return;
                e.preventDefault();
                setToken(pasted.trim());
                void validate(pasted);
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={visible ? 'eye-off' : 'eye'}
              aria-pressed={visible ? 'true' : 'false'}
              onClick={() => {
                setVisible(!visible);
              }}
            >
              {visible ? 'Hide' : 'Show'}
            </Button>
          </div>
        </Field>
        <div>
          <Button type="submit" variant="secondary" loading={busy} loadingLabel="Checking…">
            Check token
          </Button>
        </div>
      </form>

      {error && (
        <div class="sco-stack-sm">
          <ErrorBanner
            title={error.code === 'invalid-token' ? 'Notion rejected this token' : undefined}
            error={error}
            onAction={onErrorAction}
          />
          {error.code === 'invalid-token' && <p class="sco-muted">{INVALID_TOKEN_HINT[kind]}</p>}
        </div>
      )}

      {validated && !error && (
        <Banner tone="success" title="Connected">
          Workspace <strong>{validated.workspaceName ?? 'unknown workspace'}</strong>, as{' '}
          <strong>{validated.botName}</strong>.
        </Banner>
      )}
      {validated && !error && replacing && validated.id !== replacing.id && (
        <Banner tone="warning" title="That token is for another workspace">
          It was added as a new workspace. “{workspaceName(replacing)}” still uses its old token. To replace it, paste a
          token created in that workspace.
        </Banner>
      )}

      <ScreenshotSlot
        src={setupShot(8)}
        alt="Sitecatch setup: token pasted and validated, showing the workspace and bot name"
        caption="After pasting you’ll see your workspace name."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function DatabasesStep({
  kind,
  connection,
  onErrorAction,
}: {
  kind: TokenKind;
  connection: ConnectionSummary;
  onErrorAction: (a: AppErrorAction) => void;
}) {
  return (
    <div class="sco-instructions">
      <p>
        {kind === 'personal'
          ? 'These are the databases your token can see. Anything you can open in Notion should be here.'
          : 'These are the databases shared with your Sitecatch connection. Shared one just now? Click Refresh.'}
      </p>
      <DatabaseList connectionId={connection.id} tokenKind={kind} onErrorAction={onErrorAction} />
      <ScreenshotSlot
        src={setupShot(11)}
        alt="Sitecatch setup: the list of databases Sitecatch can see"
        caption="Your databases"
      />
      <div class="sco-cta">
        <Button
          variant="primary"
          icon="plus"
          onClick={() => {
            navigate('/presets/new');
          }}
        >
          {connectionsStatus.value && connectionsStatus.value.connections.length > 1 ? 'Create a preset' : 'Create your first preset'}
        </Button>
      </div>
    </div>
  );
}
