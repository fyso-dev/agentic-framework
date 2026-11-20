// Stable authoring surface for optional extension-owned static pages (v2 adds page counters,
// v3 the project identity: pages follow it, and an editor may preview a look on the whole panel).
import { createRoot } from 'react-dom/client';
import { type ComponentType } from 'react';
import i18next from 'i18next';
import extensionApi from '../extension-api.json';
import { loadBackend } from './api';
import { StoreProvider } from './store';
import { useTheme } from './lib/theme';
import { useStore } from './store';
import { applyLook, type Look } from './lib/brand';
import { useEffect } from 'react';
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
export { FONTS, DEFAULT_ACCENT, type Font, type Radius, type Look } from './lib/brand';
export type { Brand } from './api/types';

/** Shows a look on this page and on the panel around it, until the next save or previewLook. */
export function previewLook(look: Look) {
  applyLook(look);
  try { if (window.parent !== window && window.parent.location.origin === location.origin) applyLook(look, window.parent.document); }
  catch { /* not framed by the panel */ }
}

/** Every extension page takes the project's saved identity, like the panel. */
function SavedLook() {
  const brand = useStore().project.data?.brand;
  useEffect(() => { if (brand) applyLook(brand); }, [brand?.accent, brand?.font, brand?.radius]);
  return null;
}
export const PANEL_API_VERSION = extensionApi.version;
export async function mountExtensionPage(Page:ComponentType, messages:Record<string,Record<string,unknown>>) {
  for (const [language,resources] of Object.entries(messages)) i18next.addResourceBundle(language,'translation',resources,true,true);
  const loaded=await loadBackend();
  function Root() {useTheme();return <StoreProvider loaded={loaded}><SavedLook/><Page/></StoreProvider>;}
  createRoot(document.getElementById('root')!).render(<Root/>);
}
