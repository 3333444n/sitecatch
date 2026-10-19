import type { ComponentChildren } from 'preact';
import { cx } from './cx';
import { Icon } from './Icon';

export type StepStatus = 'complete' | 'current' | 'upcoming' | 'error';

export interface StepItem {
  id: string;
  title: ComponentChildren;
  description?: ComponentChildren;
  /** Overrides the status derived from `current`. */
  status?: StepStatus;
}

export interface StepperProps {
  steps: StepItem[];
  /** Index of the current step. Earlier steps are complete, later ones upcoming. */
  current: number;
  /** Makes complete (and current) steps clickable, e.g. to go back in the wizard. */
  onStepClick?: (index: number) => void;
  /** Vertical (default, options page) or horizontal (compact). */
  orientation?: 'vertical' | 'horizontal';
  /** Accessible name of the list (default "Setup progress"). */
  label?: string;
  class?: string;
}

function statusOf(step: StepItem, index: number, current: number): StepStatus {
  if (step.status) return step.status;
  if (index < current) return 'complete';
  if (index === current) return 'current';
  return 'upcoming';
}

const STATUS_TEXT: Record<StepStatus, string> = {
  complete: 'completed',
  current: 'current step',
  upcoming: 'not started',
  error: 'needs attention',
};

export function Stepper({
  steps,
  current,
  onStepClick,
  orientation = 'vertical',
  label = 'Setup progress',
  class: className,
}: StepperProps) {
  return (
    <ol class={cx('sc-steps', `sc-steps--${orientation}`, className)} aria-label={label}>
      {steps.map((step, i) => {
        const status = statusOf(step, i, current);
        const clickable = Boolean(onStepClick) && status !== 'upcoming';
        const marker = (
          <span class="sc-steps__marker" aria-hidden="true">
            {status === 'complete' ? (
              <Icon name="check" size={12} />
            ) : status === 'error' ? (
              <Icon name="alert" size={12} />
            ) : (
              i + 1
            )}
          </span>
        );
        const text = (
          <span class="sc-steps__text">
            <span class="sc-steps__title">{step.title}</span>
            <span class="sc-visually-hidden">, {STATUS_TEXT[status]}</span>
            {step.description && <span class="sc-steps__description">{step.description}</span>}
          </span>
        );
        return (
          <li
            key={step.id}
            class={cx('sc-steps__item', `sc-steps__item--${status}`)}
            aria-current={status === 'current' ? 'step' : undefined}
          >
            {clickable ? (
              <button
                type="button"
                class="sc-steps__button"
                onClick={() => {
                  onStepClick?.(i);
                }}
              >
                {marker}
                {text}
              </button>
            ) : (
              <span class="sc-steps__button">
                {marker}
                {text}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
