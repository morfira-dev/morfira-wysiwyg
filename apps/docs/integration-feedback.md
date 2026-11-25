<script setup>
import IntegrationFeedbackExample from './.vitepress/theme/IntegrationFeedbackExample.vue';
</script>

# Integration scenarios and feedback

Try a complete authoring task before adapting the editor to your application.
Choose CMS article editing, knowledge content with tables, or a form field. Each
scenario gives actions and observable outcomes, using the existing ready tools.
These are local examples, not deployed customer integrations or collected reviews.

<IntegrationFeedbackExample />

## Use your application's integration boundary

The local field has a ready toolbar, labels, validation, read-only, save/retry and
an image-upload simulation. Switching tasks changes the instructions without
replacing an open draft. Closing the field destroys its editor and local service;
reopening starts a new example. No durable storage or upload server is created.

For a production application:

- Connect your adapter's controlled value and ready lifecycle through the
  [editor-field example](/editor-field).
- Give your save/upload callbacks an authenticated backend with validation,
  authorization and version-conflict handling. AbortSignal cannot roll back a
  write already accepted by a server.
- Exercise representative [table commands and clipboard](/plugins) with synthetic
  values before using your own content.
- Display the accepted saved snapshot with the separate
  [content view](/content-view), rather than a second editing instance.

## Describe a reproducible issue

Use a short synthetic document and explain the exact action, expected result and
observed result. Include the selected modules and the version you installed. The
example shows its build's package manifest version; that is not a verification of
which npm package is installed in another application. Optional application
version must be a short version token, for example `1.0.0`.

The builder never reads editor text, HTML/JSON, files, entity IDs, backend URLs,
tokens, console logs, storage or clipboard contents. Browser information is absent
by default. Checking its option and choosing **Generate report** adds only a coarse
browser family, never the raw user-agent, extensions or a device inventory.

Reproduction steps are limited to 4000 UTF-16 units; expected and actual behavior
to 2000 each. Common URL, email and credential-looking patterns are refused so you
can replace them with placeholders. This is a conservative convenience check, not
secret detection or guaranteed anonymization. Do not paste production content,
real identifiers or secrets. Inspect every line yourself.

**Generate report** creates a literal preview; it sends nothing. Editing a source
field invalidates the previous preview and review. Copy becomes available only
after explicit review. If native clipboard access is unavailable, the selectable
preview remains for manual copying. No issue or message is submitted automatically.

After reviewing it, you may manually open a
[repository issue](https://github.com/morfira-dev/morfira-wysiwyg/issues/new/choose)
and paste the report. Reproduce security-sensitive findings with synthetic data;
do not publish real credentials or private documents in an issue.
