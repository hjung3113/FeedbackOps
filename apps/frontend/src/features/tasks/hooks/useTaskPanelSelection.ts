import * as React from 'react';

export function useTaskPanelSelection({
  selectedParam,
  items,
  context,
  onSelectionChange,
}: {
  selectedParam?: string | undefined;
  items: readonly { id: string }[];
  context?: readonly [string, string | undefined];
  onSelectionChange?: ((id: string | null, replace: boolean) => void) | undefined;
}) {
  const [linkMissing, setLinkMissing] = React.useState(false);
  const [panelClosed, setPanelClosed] = React.useState(false);
  const [panelContext, setPanelContext] = React.useState(context);
  const [selection, setSelection] = React.useState({
    param: selectedParam,
    id: selectedParam ?? null,
  });
  if (panelContext?.[0] !== context?.[0] || panelContext?.[1] !== context?.[1]) {
    setPanelContext(context);
    setPanelClosed(false);
    setLinkMissing(false);
    setSelection({ param: selectedParam, id: selectedParam ?? null });
  }
  // Reconcile during render so a URL/scope change never queries the previous detail ID.
  const selectedId = selection.param === selectedParam ? selection.id : (selectedParam ?? null);
  if (selection.param !== selectedParam) setSelection({ param: selectedParam, id: selectedId });
  const setLocalSelectedId = React.useCallback(
    (id: string | null) => setSelection({ param: selectedParam, id }),
    [selectedParam],
  );

  React.useEffect(() => {
    if (selectedParam !== undefined) {
      setPanelClosed(false);
      setLinkMissing(false);
    }
  }, [selectedParam]);

  React.useEffect(() => {
    if (
      !panelClosed &&
      !linkMissing &&
      selectedParam === undefined &&
      selectedId === null &&
      items[0]
    )
      setLocalSelectedId(items[0].id);
  }, [items, selectedId, selectedParam, panelClosed, linkMissing, setLocalSelectedId]);

  const selectRow = React.useCallback(
    (id: string) => {
      setPanelClosed(false);
      setLinkMissing(false);
      setLocalSelectedId(id);
      onSelectionChange?.(id, false);
    },
    [onSelectionChange, setLocalSelectedId],
  );
  const closePanel = React.useCallback(() => {
    setPanelClosed(true);
    setLinkMissing(false);
    setLocalSelectedId(null);
    onSelectionChange?.(null, true);
  }, [onSelectionChange, setLocalSelectedId]);
  const markLinkMissing = React.useCallback(() => {
    setLinkMissing(true);
    setLocalSelectedId(null);
    onSelectionChange?.(null, true);
  }, [onSelectionChange, setLocalSelectedId]);

  return { selectedId, linkMissing, setLocalSelectedId, selectRow, closePanel, markLinkMissing };
}
