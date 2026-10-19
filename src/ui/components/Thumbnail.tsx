import { useEffect, useRef, useState } from 'preact/hooks';
import { cx } from './cx';
import { Icon } from './Icon';
import { Skeleton } from './Skeleton';

export interface ThumbnailProps {
  /** Image URL (data: URL of the capture is fine). Missing → "No preview" placeholder. */
  src?: string | null;
  alt: string;
  /** Show a skeleton while the capture is in progress. */
  loading?: boolean;
  /** Allow click-to-enlarge (default true). */
  enlargeable?: boolean;
  class?: string;
}

/** Screenshot preview; click (or Enter/Space) opens a lightbox, Esc/backdrop closes it. */
export function Thumbnail({ src, alt, loading = false, enlargeable = true, class: className }: ThumbnailProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        // The close button is the only focusable element: keep focus inside the dialog.
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  if (loading) {
    return (
      <div class={cx('sc-thumb', className)} aria-busy="true">
        <Skeleton variant="rect" class="sc-thumb__skeleton" />
        <span class="sc-visually-hidden">Capturing screenshot…</span>
      </div>
    );
  }

  if (!src || failed) {
    return (
      <div class={cx('sc-thumb', 'sc-thumb--empty', className)} role="img" aria-label={`${alt} (no preview)`}>
        <Icon name="image" />
        <span>No preview</span>
      </div>
    );
  }

  const img = (
    <img
      class="sc-thumb__img"
      src={src}
      alt={alt}
      onError={() => {
        setFailed(true);
      }}
    />
  );

  if (!enlargeable) return <div class={cx('sc-thumb', className)}>{img}</div>;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        class={cx('sc-thumb', 'sc-thumb--button', className)}
        aria-haspopup="dialog"
        aria-label={`Enlarge: ${alt}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        {img}
      </button>
      {open && (
        <div
          class="sc-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <img class="sc-lightbox__img" src={src} alt={alt} />
          <button
            ref={closeRef}
            type="button"
            class="sc-icon-button sc-icon-button--md sc-button--secondary sc-lightbox__close"
            aria-label="Close preview"
            title="Close preview"
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
}
