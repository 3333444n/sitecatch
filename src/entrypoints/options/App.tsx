/** Options page shell: header nav + hash routes. */
import { useEffect } from 'preact/hooks';
import { Spinner } from '@/ui/components';
import { authStatus, refreshAuth } from './lib/auth';
import { navigate, useRoute, type Route } from './lib/router';
import { HelpPage } from './help/HelpPage';
import { EditPresetRoute, NewPresetRoute } from './presets/PresetRoutes';
import { PresetsList } from './presets/PresetsList';
import { SettingsPage } from './settings/SettingsPage';
import { SetupWizard } from './setup/SetupWizard';
import './options.css';

const NAV: { path: string; label: string; match: Route['name'][] }[] = [
  { path: '/setup', label: 'Setup', match: ['setup'] },
  { path: '/presets', label: 'Presets', match: ['presets', 'preset', 'preset-new'] },
  { path: '/settings', label: 'Settings', match: ['settings'] },
  { path: '/help', label: 'Help', match: ['help'] },
];

export function App() {
  const route = useRoute();
  const status = authStatus.value;

  useEffect(() => {
    void refreshAuth();
  }, []);

  // Default route: setup until a token exists, then presets.
  useEffect(() => {
    if (route.name === 'root' && status) navigate(status.hasToken ? '/presets' : '/setup', { replace: true });
  }, [route.name, status]);

  return (
    <div class="sco-app">
      <a
        href="#/"
        class="sco-skip"
        onClick={(e) => {
          // Hash links are routes here, so move focus manually.
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header class="sco-topbar">
        <div class="sco-topbar__inner">
          <a href="#/presets" class="sco-brand">
            <img src="/icon/32.png" alt="" width={20} height={20} class="sco-brand__logo" />
            Sitecatch
          </a>
          <nav aria-label="Sections" class="sco-nav">
            {NAV.map((item) => {
              const current = item.match.includes(route.name);
              return (
                <a
                  key={item.path}
                  href={`#${item.path}`}
                  class={`sco-nav__link${current ? ' sco-nav__link--current' : ''}`}
                  aria-current={current ? 'page' : undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>
      </header>
      <main class="sco-main" id="main" tabIndex={-1}>
        {status === null ? (
          <div class="sco-page sco-center">
            <Spinner size="lg" label="Loading…" />
          </div>
        ) : (
          <RouteView route={route} />
        )}
      </main>
    </div>
  );
}

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'root':
      return null;
    case 'setup':
      return <SetupWizard />;
    case 'presets':
      return <PresetsList />;
    case 'preset-new':
      return <NewPresetRoute />;
    case 'preset':
      return <EditPresetRoute key={route.id} id={route.id} />;
    case 'settings':
      return <SettingsPage />;
    case 'help':
      return <HelpPage />;
    case 'not-found':
      return (
        <div class="sco-page">
          <h1>Page not found</h1>
          <p>
            <a href="#/presets">Go to presets</a>
          </p>
        </div>
      );
  }
}
