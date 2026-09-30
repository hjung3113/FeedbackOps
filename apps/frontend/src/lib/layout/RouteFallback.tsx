import { ListStateMessage } from '@/components/ListStateMessage';
import { homeSidebarEntries } from '@/features/home/homeNavigation';
import { MeRequestError, UnauthenticatedError } from '@/lib/api/auth';
import { useMe } from '@/lib/auth/useMe';
import { ROUTER_FALLBACK_COPY } from '@/lib/copy/router';
import { Button, PageShell } from '@fops/ui';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
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

export function AuthenticatedRoutePendingFallback() {
  return (
    <PageShell contentClassName="flex min-h-screen items-center justify-center">
      <output className="text-sm text-text-muted">불러오는 중…</output>
    </PageShell>
  );
}

function MeRateLimitedRouteErrorFallback({ error }: { error: MeRequestError }) {
  const router = useRouter();

  useEffect(() => {
    console.error('FeedbackOps route error', error);
  }, [error]);

  const retry = () => {
    void router.invalidate().catch((retryError: unknown) => {
      console.error('FeedbackOps route retry failed', retryError);
    });
  };

  return (
    <CenteredPage>
      <ListStateMessage
        variant="error"
        title={ROUTER_FALLBACK_COPY.error.meRateLimitedTitle}
        body={ROUTER_FALLBACK_COPY.error.meRateLimitedBody}
        action={{ label: ROUTER_FALLBACK_COPY.error.action, onClick: retry }}
      />
    </CenteredPage>
  );
}

export function RouteErrorFallback({ error, withShell = false }: RouterErrorFallbackProps) {
  if (error instanceof MeRequestError && error.status === 429) {
    return <MeRateLimitedRouteErrorFallback error={error} />;
  }

  return <RouteErrorFallbackWithIdentity error={error} withShell={withShell} />;
}

function RouteErrorFallbackWithIdentity({ error, withShell }: Required<RouterErrorFallbackProps>) {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const me = useMe();
  const isLoginRoute = location.pathname === '/login';
  const isUnauthenticated =
    error instanceof UnauthenticatedError || me.error instanceof UnauthenticatedError;
  const [redirectInFlight, setRedirectInFlight] = useState(
    () => isUnauthenticated && !isLoginRoute,
  );

  useEffect(() => {
    console.error('FeedbackOps route error', error);
  }, [error]);

  useEffect(() => {
    if (isLoginRoute || !isUnauthenticated) {
      setRedirectInFlight(false);
      return;
    }

    let active = true;
    setRedirectInFlight(true);
    void router
      .navigate({
        to: '/login',
        search: { redirectTo: location.href },
        replace: true,
      })
      .then(() => {
        if (active && router.state.location.pathname !== '/login') {
          setRedirectInFlight(false);
        }
      })
      .catch((navigationError: unknown) => {
        console.error('FeedbackOps login redirect failed', navigationError);
        if (active) setRedirectInFlight(false);
      });
    return () => {
      active = false;
    };
  }, [isLoginRoute, isUnauthenticated, location.href, router]);

  const retry = () => {
    void router.invalidate().catch((retryError: unknown) => {
      console.error('FeedbackOps route retry failed', retryError);
    });
  };

  const message = (
    <CenteredPage>
      <ListStateMessage
        variant="error"
        title={ROUTER_FALLBACK_COPY.error.title}
        body={ROUTER_FALLBACK_COPY.error.body}
        action={{ label: ROUTER_FALLBACK_COPY.error.action, onClick: retry }}
      />
    </CenteredPage>
  );

  if (isLoginRoute) return message;
  if (isUnauthenticated && redirectInFlight) return null;
  if (!me.data) return message;
  return withShell ? <FallbackFrame>{message}</FallbackFrame> : message;
}

export function AuthenticatedRouteErrorFallback({ error }: RouterErrorFallbackProps) {
  return <RouteErrorFallback error={error} withShell />;
}

export function RouteNotFoundFallback() {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const me = useMe();
  const isKnownRoute = router.getMatchedRoutes(location.pathname).foundRoute !== undefined;

  if (isKnownRoute || (!me.data && me.isPending)) return <AuthenticatedRoutePendingFallback />;
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
