// Stable v1 authoring surface for optional extension-owned static pages.
import { createRoot } from 'react-dom/client';
import { type ComponentType } from 'react';
import i18next from 'i18next';
import { loadBackend } from './api';
import { StoreProvider } from './store';
import { useTheme } from './lib/theme';
import './lib/i18n';
import './styles.css';
export { useState, useRef, useEffect, useMemo, useCallback, createElement } from 'react';
export { jsx, jsxs, Fragment } from 'react/jsx-runtime';
export { useTranslation } from 'react-i18next';
export { useDaguAction } from './lib/useDaguAction';
export { useStore } from './store';
export { ActionButton, ActionStatus } from './components/Action';
export { External, RelTime } from './components/ui';
export const PANEL_API_VERSION = 1;
export async function mountExtensionPage(Page:ComponentType, messages:Record<string,Record<string,unknown>>) {
  for (const [language,resources] of Object.entries(messages)) i18next.addResourceBundle(language,'translation',resources,true,true);
  const loaded=await loadBackend();
  function Root() {useTheme();return <StoreProvider loaded={loaded}><Page/></StoreProvider>;}
  createRoot(document.getElementById('root')!).render(<Root/>);
}
