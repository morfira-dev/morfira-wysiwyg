import type { MorfiraEditorProps, MorfiraEditorHandle } from './types.js';
export type { MorfiraEditorProps, MorfiraEditorHandle } from './types.js';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { createEditor } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';

// Synchronize before parent layout effects can issue another editor command.
// Server rendering must not invoke React's browser-only layout effect.
const useEditorLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const MorfiraEditor = forwardRef<MorfiraEditorHandle, MorfiraEditorProps>((props, ref) => {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Editor | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;
  const applying = useRef(false);
  useImperativeHandle(ref, () => ({ getEditor: () => instance.current }), []);
  useEditorLayoutEffect(() => {
    const options = latest.current;
    const editor = createEditor(host.current!, {
      ...options,
      onChange: (change) => {
        if (!applying.current) {
          latest.current.onChange?.(change);
        }
      },
    });
    instance.current = editor;
    latest.current.onReady?.(editor);
    return () => {
      editor.destroy();
      instance.current = undefined;
    };
  }, []);
  useEditorLayoutEffect(() => {
    const editor = instance.current;
    if (!editor || props.value === undefined || props.value === editor.getHTML())
      return;
    applying.current = true;
    try {
      editor.setHTML(props.value);
    }
    finally {
      applying.current = false;
    }
  }, [props.value]);
  useEditorLayoutEffect(() => {
    instance.current?.setReadOnly(props.readOnly ?? false);
  }, [props.readOnly]);
  useEditorLayoutEffect(() => {
    instance.current?.setLocale(props.locale ?? 'ru', props.translations);
  }, [props.locale, props.translations]);
  return <div ref={host} className={props.className ?? 'mw-host'} />;
});
