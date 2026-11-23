# Optional provider media plugin and owned external UI

Status: accepted implementation contract, 2026-11-23; executed evidence is recorded
separately. No core changes, runtime dependencies or automatic preset inclusion.
Public behavior `/plugins/media`; view/form `/ui/media`; optional scoped CSS.

## Persisted document and commands

media() registers schema-v1 `figure[data-mw-node="morfira:media"]`, a provider enum
(youtube or vimeo), bounded opaque ID and bounded literal single-line title text.
No iframe, executable HTML, resource URL or foreign namespace enters persisted
HTML/JSON. Schema readers without this owning plugin follow existing fail-closed
semantic-node policy. Metadata is data; the viewer revalidates provider/ID before
building any resource URL, including values imported through JSON.

parseMediaURL accepts HTTPS allowlisted YouTube/youtu.be/youtube-nocookie and Vimeo
URLs only, extracts a strictly bounded provider ID and returns canonical data.
Credentials, foreign hosts, unexpected paths, duplicate identity parameters and
unsafe schemes reject. Tracking/query/autoplay settings are not persisted.
mediaCommands(editor) offers insert({url,title?}), update(target,value), remove.
Commands delegate validated literal content to the SDK's guarded atomic
transactions, preserve actual target identity, selection/history, read-only and
composition. Initial schema compilation occurs before import. External values
never implicitly load resources or grant consent.

## External presentation and network ownership

createMediaView(host,editor) owns one external card per actual eligible semantic
figure. Host cannot be within/around persisted surface. Default card contains
safe literal title/provider and explicit localized Load/Unload controls; no iframe,
thumbnail, preconnect, fetch, oEmbed or provider URL request exists before Load.
Explicit load revalidates current actual target, provider/ID and lifecycle after
callbacks; one exact HTTPS iframe URL is constructed from that validated data.
YouTube uses youtube-nocookie.com/embed/ID and Vimeo player.vimeo.com/video/ID.
No autoplay. iframe sandbox permits scripts/same-origin/presentation only; its
allow policy is fullscreen/picture-in-picture/encrypted-media, referrer policy
strict-origin-when-cross-origin. No caller-controlled iframe attributes or URLs.

Unload, target removal/change, external document replacement and destruction
remove only the owned iframe and controls. Repeated load is idempotent; changing
locale preserves consent only for the same unchanged target. Read-only still
allows explicit viewing, but mutation controls are disabled. External view DOM,
consent and playback state never enter HTML/JSON/history. Loading sends a request
to the provider; application CSP/frame-src and provider/backend rules remain
application concerns. This is not arbitrary HTML embed, upload/transcoding or
an asset manager. No network assertion claims privacy after consent.

## Reusable insertion/editing form

createMediaForm(host,editor,options?) provides open/close/isOpen/refresh/getValues/
setValues/destroy with a native modal dialog by default and optional inline mode.
URL/title drafts use native inputs, localized labels/status/Close/Escape, no
executable template data. open captures actual revision-bound selection; closing
or replacement releases it. Applying suspends native modal inertness, restores
only the current selection, rechecks focus/intent/read-only/composition and invokes
commands; successful edit closes, invalid draft stays available. Existing selected
media can update/remove through actual-node binding; stale same-markup recreation
cannot redirect a draft. Per-instance subscriptions/listeners are fully cleaned.

## Acceptance

Representative Chromium/Firefox/WebKit tests cover URL/provider rejection and
inert schema roundtrip, insertion/update/remove plus selection/history, no network
before explicit Load, exact iframe attributes/URL, stale controls and foreign
host rejection, read-only/composition/focus callbacks, two instances/cleanup and
localized dialog controls/draft recovery. Provider requests are intercepted in
browser tests; no external media success or tracking certification is implied.
Packed imports, strict types, selective dependencies, JS gzip/Brotli and CSS are
measured separately by parent validation. RU/EN docs and a live example describe
provider/network boundaries and missing arbitrary embed support.
