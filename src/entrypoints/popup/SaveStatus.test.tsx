import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Saving } from './SaveStatus';

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
