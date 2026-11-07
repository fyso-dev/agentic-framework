import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { localized } from '../lib/i18n';
import type { Theme } from '../lib/theme';
export function ExtensionPage({extensionId,pageId,theme}:{extensionId:string;pageId:string;theme:Theme}) {
  const {t,i18n}=useTranslation();
  const {extensions}=useStore();
  const page=extensions.data?.find(ext=>ext.id===extensionId)?.pages?.find(p=>p.id===pageId);
  if (extensions.status==='loading') return <main className="page"><p role="status">{t('extensionPage.loading')}</p></main>;
  if (!page || !page.url.startsWith(`/extensions/${extensionId}/panel/`)) return <main className="page"><p role="alert">{t('extensionPage.missing')}</p></main>;
  const url=new URL(page.url,location.origin);
  if(url.origin!==location.origin)return <main className="page"><p role="alert">{t('extensionPage.missing')}</p></main>;
  url.searchParams.set('lang',i18n.language);url.searchParams.set('theme',theme);url.searchParams.set('page',page.id);
  return <main className="extension-page"><iframe className="extension-frame" title={localized(i18n.language,page.name,page.name_i18n)} src={url.pathname+url.search} /></main>;
}
