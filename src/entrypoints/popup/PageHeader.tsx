import type { CaptureResult } from '@/lib/extract/types';
import { Icon, Skeleton, Thumbnail } from '@/ui/components';
import { hostnameOf } from './format';

export interface PageHeaderProps {
  /** null while capturing. */
  capture: CaptureResult | null;
  /** Tab info, available before the capture finishes. */
  tabTitle: string;
  tabUrl: string;
  tabFavicon?: string;
}

/** Favicon + title + domain of the page being saved, with the screenshot thumbnail. */
export function PageHeader({ capture, tabTitle, tabUrl, tabFavicon }: PageHeaderProps) {
  const favValue = capture?.values.favicon;
  const favicon = (favValue?.kind === 'image' ? favValue.url : undefined) ?? tabFavicon;
  const domainValue = capture?.values.domain;
  const url = capture?.url || tabUrl;
  const domain = (domainValue?.kind === 'text' ? domainValue.value : '') || hostnameOf(url);
  const title = capture?.title || tabTitle;
  const shot = capture?.values.screenshot;
  const shotSrc = shot?.kind === 'image' ? (shot.dataUrl ?? shot.url ?? null) : null;

  return (
    <section class="popup-page" aria-label="Page being saved">
      <div class="popup-page__meta">
        <div class="popup-page__site">
          {favicon ? (
            <img class="popup-page__favicon" src={favicon} alt="" width={16} height={16} />
          ) : (
            <Icon name="file" size={16} class="popup-page__favicon" />
          )}
          <span class="popup-page__domain">{domain || (capture ? 'Unknown site' : '')}</span>
        </div>
        {title ? (
          <p class="popup-page__title" title={title}>
            {title}
          </p>
        ) : (
          <Skeleton lines={2} />
        )}
        {capture && !shotSrc && <p class="popup-note">No screenshot for this page.</p>}
      </div>
      {(!capture || shotSrc) && (
        <Thumbnail class="popup-page__thumb" src={shotSrc} loading={!capture} alt={`Screenshot of ${title || 'the page'}`} />
      )}
    </section>
  );
}
