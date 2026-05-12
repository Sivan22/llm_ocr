import { useI18n } from '../i18n/I18nContext';
import { LANG_NAMES } from '../i18n/translations';
import { Button } from './ui/button';

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  const other = lang === 'en' ? 'he' : 'en';
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setLang(other)}
      aria-label={`Switch to ${LANG_NAMES[other]}`}
    >
      {LANG_NAMES[other]}
    </Button>
  );
}
