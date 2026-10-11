import { HOME_INBOX_COPY } from '@/lib/copy/home';
import { Button } from '@fops/ui';

// Same control placement and states as the shipped Entity Link inventory.
export function ListLoadMore({
  hasMore,
  loadingMore,
  failed,
  onLoadMore,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  failed: boolean;
  onLoadMore: () => void;
}) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center border-t border-border-subtle py-2">
      <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore}>
        {loadingMore
          ? HOME_INBOX_COPY.loadingMore
          : failed
            ? HOME_INBOX_COPY.retry
            : HOME_INBOX_COPY.loadMore}
      </Button>
    </div>
  );
}
