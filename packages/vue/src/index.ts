import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PropType } from 'vue';
import { createEditor } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';

export const MorfiraEditor = defineComponent({
  name: 'MorfiraEditor',
  props: {
    modelValue: { type: String, default: '' },
    readOnly: Boolean,
    placeholder: String,
    label: String,
    plugins: { type: Array as PropType<EditorPlugin[]>, default: () => [] },
  },
  emits: ['update:modelValue', 'change', 'ready'],
  setup: (props, { emit, expose }) => {
    const host = ref<HTMLElement>();
    let editor: Editor | undefined;
    let applying = false;
    onMounted(() => {
      editor = createEditor(host.value!, {
        value: props.modelValue, readOnly: props.readOnly, placeholder: props.placeholder, label: props.label, plugins: props.plugins,
        onChange: (change) => {
          if (!applying) {
            emit('update:modelValue', change.html);
            emit('change', change);
          }
        },
      });
      emit('ready', editor);
    });
    watch(() => props.modelValue, (value) => {
      if (!editor || value === editor.getHTML())
        return;
      applying = true;
      try {
        editor.setHTML(value);
      }
      finally {
        applying = false;
      }
    });
    watch(() => props.readOnly, (value) => editor?.setReadOnly(value));
    onBeforeUnmount(() => editor?.destroy());
    expose({ getEditor: () => editor });
    return () => h('div', { ref: host, class: 'mw-host' });
  },
});
