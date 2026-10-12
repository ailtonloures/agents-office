import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { copyText } from '../lib/clipboard';

export interface CommandSnippetProps {
  command: string;
  /** Accessible name of the whole snippet (translated). */
  label: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

const RESET_MS = 2000;

/** A shell command in a pixel box with a copy button and a polite status message. */
export function CommandSnippet({ command, label }: CommandSnippetProps) {
  const { t } = useI18n();
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = async () => {
    const ok = await copyText(command);
    setState(ok ? 'copied' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), RESET_MS);
  };

  const buttonLabel =
    state === 'copied'
      ? t('install.copied')
      : state === 'failed'
        ? t('install.copyFailed')
        : t('install.copy');

  return (
    <div className="command-snippet">
      <code className="command-snippet__code" title={label}>
        <span className="command-snippet__prompt" aria-hidden="true">
          $
        </span>{' '}
        {command}
      </code>
      <button
        type="button"
        className="command-snippet__copy"
        onClick={onCopy}
        aria-label={t('install.copyLabel')}
      >
        {buttonLabel}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'idle' ? '' : buttonLabel}
      </span>
    </div>
  );
}
