import { ListStateMessage } from '@/components/ListStateMessage';
import { homeSidebarEntries } from '@/features/home/homeNavigation';
import { MeRequestError, UnauthenticatedError } from '@/lib/api/auth';
import { useMe } from '@/lib/auth/useMe';
import { ROUTER_FALLBACK_COPY } from '@/lib/copy/router';
import { Button, PageShell } from '@fops/ui';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef } from 'react';
import { AppFrame } from './AppFrame';

interface RouterErrorFallbackProps {
  error: unknown;
  withShell?: boolean;
}

function FallbackFrame({ children }: { children: ReactNode }) {
  return (
    <AppFrame
      sidebarEntries={homeSidebarEntries(undefined, false)}
      activeDomain="home"
      scopeControlEnabled={false}
    >
      {children}
    </AppFrame>
  );
}

function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <PageShell contentClassName="flex min-h-full items-center justify-center">
      <div className="w-full max-w-2xl" role="alert">
        {children}
      </div>
    </PageShell>
  );
}

export function RouteErrorFallback({ error, withShell = false }: RouterErrorFallbackProps) {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const me = useMe();
  const isLoginRoute = location.pathname === '/login';
  const isUnauthenticated =
    error instanceof UnauthenticatedError || me.error instanceof UnauthenticatedError;
  const isMeRateLimited = error instanceof MeRequestError && error.status === 429;

  useEffect(() => {
    console.error('FeedbackOps route error', error);
  }, [error]);

  useEffect(() => {
    if (isLoginRoute || !isUnauthenticated) return;
    void router.navigate({
      to: '/login',
      search: { redirectTo: location.href },
      replace: true,
    });
  }, [isLoginRoute, isUnauthenticated, location.href, router]);

  const retry = () => {
    void router.invalidate().catch((retryError: unknown) => {
      console.error('FeedbackOps route retry failed', retryError);
    });
  };

  // #584 keeps raw prototype diagnostics out of user-facing route errors.
  const message = (
    <CenteredPage>
      <ListStateMessage
        variant="error"
        title={
          isMeRateLimited
            ? ROUTER_FALLBACK_COPY.error.meRateLimitedTitle
            : ROUTER_FALLBACK_COPY.error.title
        }
        body={
          isMeRateLimited
            ? ROUTER_FALLBACK_COPY.error.meRateLimitedBody
            : ROUTER_FALLBACK_COPY.error.body
        }
        action={{ label: ROUTER_FALLBACK_COPY.error.action, onClick: retry }}
      />
    </CenteredPage>
  );

  if (isLoginRoute) return message;
  if (isUnauthenticated || (!me.data && me.isPending)) return null;
  return withShell ? <FallbackFrame>{message}</FallbackFrame> : message;
}

export function AuthenticatedRouteErrorFallback({ error }: RouterErrorFallbackProps) {
  return <RouteErrorFallback error={error} withShell />;
}

export function RouteNotFoundFallback() {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const me = useMe();
  const redirectedFrom = useRef<string | null>(null);
  const isKnownRoute = router.getMatchedRoutes(location.pathname).foundRoute !== undefined;

  useEffect(() => {
    if (
      isKnownRoute ||
      !(me.error instanceof UnauthenticatedError) ||
      redirectedFrom.current === location.href
    ) {
      return;
    }
    redirectedFrom.current = location.href;
    void router.navigate({
      to: '/login',
      search: { redirectTo: location.href },
      replace: true,
    });
  }, [isKnownRoute, location.href, me.error, router]);

  if (isKnownRoute || me.error instanceof UnauthenticatedError || (!me.data && me.isPending)) {
    return null;
  }
  if (!me.data && me.error) return <AuthenticatedRouteErrorFallback error={me.error} />;

  return (
    <FallbackFrame>
      <CenteredPage>
        <ListStateMessage
          variant="error"
          title={ROUTER_FALLBACK_COPY.notFound.title}
          body={ROUTER_FALLBACK_COPY.notFound.body}
          actionContent={
            <div className="flex items-center justify-center gap-2">
              <Button asChild variant="primary" size="sm">
                <Link to="/home">{ROUTER_FALLBACK_COPY.notFound.home}</Link>
              </Button>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                onClick={() => router.history.back()}
              >
                {ROUTER_FALLBACK_COPY.notFound.back}
              </Button>
            </div>
          }
        />
      </CenteredPage>
    </FallbackFrame>
  );
}
