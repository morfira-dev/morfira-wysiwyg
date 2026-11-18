---
layout: home
hero:
  name: Morfira WYSIWYG
  text: Your words. Less weight.
  tagline: A modular editor with tables, framework adapters, and your design. Try lists, nesting, and formatting right here.
  actions:
    - theme: brand
      text: Get started
      link: /en/guide
    - theme: alt
      text: Open playground
      link: /en/#editor
features:
  - title: TypeScript first
    details: Typed APIs, plugins, components, and events.
  - title: Just the modules you need
    details: Tables have a separate import. The core does not bundle frameworks or the table engine.
  - title: Vue · React · Svelte
    details: One document model and a consistent lifecycle across three frameworks.
  - title: Your design
    details: CSS custom properties, an optional toolbar, and headless integration.
---


The full homepage and playground explicitly install the optional [table size picker](/en/table-picker) and [image clipboard/drop input](/en/image-input). Use the Table toolbar button for the 8 × 8 picker, or paste/drop one raster file into ordinary text. The local upload callback returns the logo; it does not send or store the file.


The Tables section also installs the ready [table and cell properties form](/en/table-properties): select a cell or spanning rectangle, then change width, placement, colors and vertical alignment. Apply edits only dirty fields as one Undo operation.
