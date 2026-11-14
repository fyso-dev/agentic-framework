// Stable authoring surface for optional extension-owned static pages (v2 adds page counters).
import { createRoot } from 'react-dom/client';
import { type ComponentType } from 'react';
import i18next from 'i18next';
import extensionApi from '../extension-api.json';
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
export { botRoster } from './lib/botRoster';
export { ActionButton, ActionStatus } from './components/Action';
export { External, RelTime } from './components/ui';
export { refreshBadges } from './lib/extensionBadges';
export const PANEL_API_VERSION = extensionApi.version;
export async function mountExtensionPage(Page:ComponentType, messages:Record<string,Record<string,unknown>>) {
  for (const [language,resources] of Object.entries(messages)) i18next.addResourceBundle(language,'translation',resources,true,true);
  const loaded=await loadBackend();
  function Root() {useTheme();return <StoreProvider loaded={loaded}><Page/></StoreProvider>;}
  createRoot(document.getElementById('root')!).render(<Root/>);
}
