# Optional image form

The host must be outside the persisted editor surface: the surface itself and every descendant are rejected before creating view DOM, listeners or subscriptions. Rejection preserves document, selection and history.

Status: implementation contract; document schema v1 is unchanged.

`createImageForm(host, editor, options?)` requires the images plugin and mounts one owned section with role=form. It can be embedded inside an application form without nested HTML form elements. Buttons have type=button; Enter in a single-line metadata field executes image insertion and does not submit the outer application form. Draft controls have no native name attributes and do not add fields to application FormData. The controller exposes element, refresh, copied getValues/partial setValues and idempotent destroy. Draft values are strings: src, alt, width, height and caption. Options accept initialValues, an explicit accessible label and onError for original diagnostics. Built-in RU/EN messages use ui.images.* and live editor locale/overrides; fields retain drafts while focused.

Insert, update and remove restore a valid remembered editor range before invoking existing image commands. Empty dimensions remove existing constraints during update. Selecting an image or a caret in its caption refreshes metadata without stealing focus. API replacement invalidates the previous target; the form must not silently edit another document. Read-only blocks edit/upload controls but leaves an owned upload cancellation available. Invalid commands retain drafts and show generic localized errors; original errors are delivered only to onError.

Each form upload owns a caller AbortController passed to ImageCommands.upload. Cancel/dispose/read-only invalidation cannot cancel a newer upload started elsewhere; pending UI callbacks become inert after disposal. Destroy removes only the owned form, subscriptions and DOM listeners. Editor destruction automatically disposes the form.

Image click inspection is synchronous: moving focus into a metadata field in the same event turn must show the newly selected image values without waiting for the browser selectionchange event.

Acceptance: real field focus retains rich/empty-cell selection; insert/update/remove and one-step history; locale/read-only/custom-label updates; invalid drafts/errors; external replacement; two instances; owned upload cancellation and late completion; detached controls/editor destroy. Exercise Chromium, Firefox and WebKit through public built artifacts.
