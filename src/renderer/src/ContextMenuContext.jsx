import { createContext, useContext } from 'react';

export const ContextMenuContext = createContext(null);

export function useContextMenu() {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error('useContextMenu must be used inside a ContextMenuProvider');
  }
  return ctx;
}
