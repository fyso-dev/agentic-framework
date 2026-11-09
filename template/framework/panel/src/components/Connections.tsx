import { useTranslation } from 'react-i18next';
import { href } from '../lib/router';

export function Connections() {
  const {t}=useTranslation();
  return <section className="card connector-card">
    <h2>{t('connectors.title')}</h2>
    <p className="mute">{t('connectors.subtitle')}</p>
    <a className="btn btn-soft" href={href.connectors}>{t('connectors.manage')}</a>
  </section>;
}
