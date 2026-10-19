import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { cx } from './cx';
import { Icon } from './Icon';

export interface ScreenshotSlotProps {
  /** Image URL (e.g. `browser.runtime.getURL('/setup/step-1.png')`). Missing → placeholder. */
  src?: string | null;
  /** Describes what the screenshot shows (required — also used by the placeholder). */
  alt: string;
  caption?: ComponentChildren;
  class?: string;
}

/**
 * A documentation screenshot that degrades to a dashed "Screenshot coming soon"
 * placeholder when the file is missing or fails to load — never a broken image.
 */
export function ScreenshotSlot({ src, alt, caption, class: className }: ScreenshotSlotProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  const showImage = Boolean(src) && !failed;

  return (
    <figure class={cx('sc-shot', className)}>
      {showImage ? (
        <img
          class="sc-shot__img"
          src={src ?? undefined}
          alt={alt}
          loading="lazy"
          onError={() => {
            setFailed(true);
          }}
        />
      ) : (
        <div class="sc-shot__placeholder" role="img" aria-label={`${alt} (screenshot coming soon)`}>
          <Icon name="image" size={20} />
          <span>Screenshot coming soon</span>
        </div>
      )}
      {caption && <figcaption class="sc-shot__caption">{caption}</figcaption>}
    </figure>
  );
}
