import type { MorfiraEditorProps, MorfiraEditorHandle } from './types.js';
export type { MorfiraEditorProps, MorfiraEditorHandle } from './types.js';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createEditor } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';

export const MorfiraEditor = forwardRef<MorfiraEditorHandle, MorfiraEditorProps>((props, ref) => {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Editor | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;
  const applying = useRef(false);
  useImperativeHandle(ref, () => ({ getEditor: () => instance.current }), []);
  useEffect(() => {
    const options = latest.current;
    const editor = createEditor(host.current!, {
      ...options,
      onChange: (change) => {
        if (!applying.current)
          latest.current.onChange?.(change);
      },
    });
    instance.current = editor;
    latest.current.onReady?.(editor);
    return () => { editor.destroy(); instance.current = undefined; };
  }, []);
  useEffect(() => {
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
  useEffect(() => { instance.current?.setReadOnly(props.readOnly ?? false); }, [props.readOnly]);
  return <div ref={host} className={props.className ?? 'mw-host'} />;
});
