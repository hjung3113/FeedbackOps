import { useRouter } from '@tanstack/react-router';
import { type ComponentProps, forwardRef } from 'react';

type InternalLinkProps = ComponentProps<'a'> & { href: string };

export const InternalLink = forwardRef<HTMLAnchorElement, InternalLinkProps>(function InternalLink(
  { href, onClick, ...props },
  ref,
) {
  const router = useRouter({ warn: false });

  return (
    <a
      {...props}
      href={href}
      ref={ref}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          (props.target !== undefined && props.target !== '_self') ||
          event.currentTarget.hasAttribute('download') ||
          !href.startsWith('/') ||
          href.startsWith('//') ||
          !router
        ) {
          return;
        }

        event.preventDefault();
        void router.navigate({ href });
      }}
    />
  );
});
