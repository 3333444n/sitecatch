import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Saved, Saving } from './SaveStatus';

afterEach(() => {
  cleanup();
});

describe('Saving', () => {
  it('announces the step and the background hint once slow', () => {
    render(<Saving status="uploading" slow />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Uploading screenshot…');
    expect(status.textContent).toContain('you can close this popup');
  });

  it('hides the hint while fast', () => {
    render(<Saving status="creating" slow={false} />);
    expect(screen.getByRole('status').textContent).toBe('Saving to Notion…');
  });
});

describe('Saved', () => {
  const noop = () => undefined;

  it('shows warnings as small notes', () => {
    render(
      <Saved
        dbName="Resources"
        pageUrl="https://www.notion.so/p1"
        warnings={['Saved without screenshot: too large.', '“Notes” was too long for Notion and was shortened.']}
        onSaveAnother={noop}
        onClose={noop}
      />,
    );
    const list = screen.getByRole('list', { name: 'Notes about this save' });
    expect(list.querySelectorAll('li.popup-note')).toHaveLength(2);
    expect(list.textContent).toContain('Saved without screenshot');
  });

  it('renders no notes without warnings', () => {
    render(<Saved dbName="Resources" onSaveAnother={noop} onClose={noop} />);
    expect(screen.queryByRole('list')).toBeNull();
  });
});
