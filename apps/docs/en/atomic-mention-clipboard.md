# Copying atomic mention references

With `mentions({ persistent: true, atomic: true })`, copy, cut and paste retain IDs through `text/html`. The `text/plain` representation contains visible text only. Current browser/example execution results and their limits are recorded under [testing](/en/testing). Synthetic ClipboardEvents do not prove OS clipboard behavior across platforms.

## API

```ts
import { mentionClipboardCommands } from '@morfira-dev/wysiwyg/plugins/mentions';
import type {
  MentionClipboardCommands,
  MentionClipboardData,
  MentionClipboardInput,
} from '@morfira-dev/wysiwyg/plugins/mentions';

const clipboard = mentionClipboardCommands(editor);
const copied = clipboard.copy(); // { html, text } | undefined; current selection
const cut = clipboard.cut(); // returns data and deletes the selection
// After choosing a new paste position:
if (copied) clipboard.paste(copied); // boolean
if (cut) clipboard.paste({ text: cut.text }); // label only, no ID
```

`MentionClipboardData` holds `html` and `text` strings; `MentionClipboardInput` accepts optional `html` and `text`. Commands use the editor's current native selection. The getter rejects when the atomic profile is not installed. The API requests no permissions and does not read or write the OS clipboard: the application owns the returned object. Preserve native selection for external buttons; `copy()` itself changes neither focus, selection, document nor history.

| Command | Contract |
| --- | --- |
| `copy()` | Nonempty selection touching a mention within one flow, eligible sibling paragraphs/headings or supported intervals in one ordinary list tree; partial tokens are copied whole. Returns `undefined` when unavailable |
| `cut()` | Same boundaries; returns data and deletes content in one transaction. Returns `undefined` read-only |
| `paste(input)` | Inserts inline content, one paragraph/heading or an ordinary sequence, plus a supported UL/OL tree at an eligible item target. Returns `false` on refusal, including read-only |

Copy works read-only. Paste replaces selected tokens whole and leaves the caret outside the inserted mention. Following ordinary input does not modify the token label. Each successful cut/paste creates one Undo/Redo revision restoring IDs and selection; refusal creates none.

## Formats and boundaries

HTML carries registered `data-mw-node="morfira:mention"` and `data-mention-id`, the label and supported surrounding `strong/em/u/s/sub/sup/span/br` formatting. Runtime `contenteditable`, classes and unchecked attributes are not exported. Plain text contains visible labels, ordinary text and BR newlines; a plain `@Anna` never invents an ID reference.

Ordinary paragraph/heading, list, quote and cell-paragraph flows are supported, including a merged cell without grid changes. References can also transfer across sibling `p`/`h1`–`h6` leaves under one parent: the editor surface, an ordinary quote, one cell or one list item. Both selection endpoints must be inside these leaves; offsets of the container itself remain unsupported. Every crossed block must be an eligible ordinary leaf. Only formatting whitespace text nodes may separate the blocks.

A single selection across unrelated list trees, containers, cells or quote boundaries, images, incoming table fragments, links/code and other semantic owners refuses. Different levels within one ordinary tree use the structural profile below. Consecutive items of one list, including fully selected supported trailing branches, use the separate profile below. Preflight checks structure before mutation; refusal never partially deletes a reference. This is a bounded mention contract, not a universal rich clipboard engine. Explicit table selections and file pastes retain their existing owners.

## Across paragraphs and headings

Multiblock copy retains selected fragments inside their original safe `p`/`h` tags with attributes and supported inline marks. Unselected text is excluded, while partial atom endpoints expand to whole references. `text/plain` separates block fragments with LF; BR also adds a newline. Empty selected blocks retain their boundaries. Text never encodes hidden IDs.

Cut keeps the actual first block, its attributes and prefix, moves the last block's surviving suffix into it and removes the selected later blocks. The caret remains at the join, outside a mention. Untouched siblings, list/quote containers and cells retain identity. A fully empty result receives an editable BR.

| Incoming data | Paste composition |
| --- | --- |
| Inline content or one ordinary `p` | Inserts in the first block's original inline context, then joins the last source suffix; the incoming `p` is unwrapped |
| Multiple `p`/`h` blocks | First incoming children join the retained left block; intermediate wrappers survive; the final incoming wrapper receives the suffix. The caret stays before that suffix |
| One heading | A standalone heading between retained prefix and suffix wrappers, with the caret before the suffix |

The same composition works at a caret inside one block by splitting its prefix/suffix. For multiple incoming blocks, the original first source block's attributes win over the first incoming wrapper. Placeholder BR at joined edges does not create an extra line; real BR and empty middle paragraphs survive. Mixed inline/block and unsupported structural payloads refuse; the separate list-tree profile is described below.

Nonempty HTML takes precedence over text. An invalid registered mention rejects without silently falling back to its plain-text label. The receiver validates the ID and text-only label through the [atomic schema](/en/atomic-mentions). A missing-schema HTML reader may keep text and drop IDs; an editable persistent reader retains IDs without atomic behavior.

## Between list items

Consecutive ordinary `li` siblings of one actual `ul` or `ol` are supported. An item body may be direct inline text or a sequence of ordinary `p`/`h1`–`h6` leaves; endpoint items may use different representations. Selection must start and end inside the items' own bodies. Unrelated list trees/cells, offsets on the list container itself, checklists, quotes/code and mixed direct/block item bodies refuse. Different levels within one tree use the separate structural profile below.

Copy retains selected item fragments, IDs and marks inside a safe original `ul`/`ol` wrapper. `text/plain` separates bodies and items with LF, without bullets or hidden ID syntax. Stored `start`, `reversed` and marker attributes are copied as-is; selection-relative numbering is not recalculated.

Cut keeps the actual first `li`, its preceding bodies and prefix, joins the last selected body's suffix and removes covered later items. The final item's unselected subsequent bodies and trailing branches move as actual nodes in their original order. A direct-inline retained body receives a `p` wrapper only when needed to avoid mixing inline content with later blocks. No `li` is nested directly in another `li`; an empty join remains editable.

| Incoming data at an item target | Composition |
| --- | --- |
| Inline or one `p` | Inserts into the retained first body, then joins the last source suffix |
| Multiple `p`/`h` leaves or one heading | Ordinary bodies within the retained item; a heading stays a separate body |
| One `ul`/`ol` with ordinary `li` bodies and supported trailing nested branches | First incoming body joins the prefix; later items become siblings in the target list. The final item receives the suffix, subsequent bodies and branches, with the caret before the suffix |

A list payload requires an eligible item caret or selection. Target outer list type and attributes win: an OL pasted into a UL becomes items of that existing UL. Nested branch kinds and attributes remain their own. One incoming item needs no additional sibling. Supported later incoming item/body attributes survive; no automatic counter recalculation or list coalescing is added. Checklist metadata and mixed/orphan roots refuse.

### Through selected trailing branches

Fully covered trailing `ul`/`ol` branches of the first and intermediate items transfer recursively. Each nested item has direct inline content or ordinary P/H bodies followed by branches of the same shape. HTML keeps the hierarchy, order, branch kinds/attributes and IDs without flattening or coalescing. Plain text emits visible labels in source order with LF between bodies, items and branches; it adds no bullets, indentation or hidden IDs.

Cut removes the selected branches from the source after both native clipboard formats are written successfully. Replacing that interval with inline/P/H content also removes those selected branches. The final source item's unselected later bodies and trailing branches remain outside copied data and survive as actual nodes. Undo restores the entire source tree and selection in one step.

On paste, branches belonging to the first incoming item remain under the retained first target item; later incoming outer items become siblings. The final incoming item receives the source suffix and unselected following own bodies **before** trailing branches. Incoming branches then precede unselected source branches. A one-item payload uses the same order within the retained item. No own-body block is put after a branch, and no LI is nested directly in another LI.

Sibling endpoints use the joining profile above. Different levels within one ordinary tree use the structural interval below. Bodies after branches and protected structures remain unsupported. Source and incoming selected branches share bounded recursive validation: resource/foreign/task/other-owned content, links/code, quotes/tables and excessive depth/size reject the complete operation before mutation or native clipboard writes. Unselected final branch descendants stay opaque and are not cloned merely to preserve them. This is a bounded tree transfer, not arbitrary structural selection.

Actual items, bodies, list, selection and revisions are rechecked after focus and clipboard callbacks. Each successful cut/paste retains one Undo/Redo revision; incoming HTML passes the receiver schema before rendering. Current browser/example execution results and their limits are recorded under [testing](/en/testing).

## Between list levels

Own-body endpoints may belong to a parent and descendant, a descendant and a later outer item, or cousin branches of the same ordinary list tree. The closest common actual UL/OL provides context. Existing same-flow/sibling behavior keeps priority. Unrelated trees/cells, protected paths, checklist metadata, bodies after branches and root/list container offsets remain barriers.

Copy reconstructs the selected hierarchy with IDs and necessary ancestor shells. Unselected ancestor text and outside siblings are excluded; context-only own bodies may contain an editable BR. These shells are ordinary HTML data: a later paste does not infer a relative nesting-depth change. Plain text retains the established LF policy; hierarchy lives in HTML.

**Different-level cut preserves partial paths at their existing levels.** It removes selected text and complete subtrees, repairs affected empty own bodies, and leaves unselected suffixes in their surviving wrappers. It does not join endpoints, dedent, flatten or rebuild unrelated branches. The caret stays at the retained start boundary. This differs deliberately from the joining operation between sibling items.

Paste removes the same structural interval and applies the existing same-item inline/P-H/list composition at the retained start caret. One transaction/change/Undo covers the complete step; forward/backward selection is restored by history. Incoming outer list type adapts to the target list while internal hierarchy and IDs survive. Target branches move only under those established paste rules. Source paths/subtrees, actual nodes and revisions are validated again after callbacks; malformed data rejects atomically before native clipboard writes or mutation.

This completes the planned mention clipboard feature scope for this milestone. Later work returns to the wider roadmap, with concrete regression fixes as needed. Browser/OS acceptance remains pending while local tests are paused; this is not a claim of universal structural editing.

## Native events and safety

Handlers use cancelable `copy/cut/paste` events and their `clipboardData`; there is no `navigator.clipboard`, network or new dependency. Paste is intercepted for incoming mentions or a touched token; unrelated pastes remain with existing handlers. Previously handled events, IME and file data do not start a second synthetic edit.

Native cut writes both formats successfully before deleting the selection. A write failure preserves document/history; rollback of a partially modified OS clipboard is not promised. Handlers revalidate document/selection after application callbacks and focus to avoid deleting a replacement document. Input is schema-checked before active rendering; active resource subtrees are not cloned just for serialization.

An ID is an untrusted entity reference. Schema validation proves neither user existence, tenant membership nor permission: those checks, upload/notification authorization and CSP remain application/backend responsibilities. Frontend filtering is not a server trust boundary.

## Demo

On the [homepage](/en/#editor) and [playground](/en/playground), expand “Mention clipboard: IDs and plain text”. Load the sample, select `@Anna`, copy to memory and choose the position after the token. “Paste with ID” creates another `anna` reference; “Paste plain text” inserts only the label. HTML/text and `{id,text}` snapshots expose the difference. Buttons never access the OS clipboard; loading the example replaces the document. Native shortcuts require separate target-browser/OS verification when checks resume.

For a multiblock transfer, choose “Load block clipboard sample” → “Select blocks backward” → “Copy to memory”. HTML contains a paragraph, heading and paragraph with `anna`/`boris`; plain text exposes LF separators. “Caret in destination paragraph” or “Select destination blocks” chooses the target for “Paste with ID”. To try cut, reload the sample, select blocks and choose “Cut to memory”: retained `Before`/`after` join; Undo restores source blocks and IDs. Current browser/example execution results and their limits are recorded under [testing](/en/testing).

For item transfer, choose “Load list clipboard sample” → “Select list items backward” → “Copy to memory”. HTML exposes an OL with three LIs and two IDs; text shows `@Anna first`, `Shared item` and `@Boris` separated by LF. “Caret in destination item” or “Select destination items” targets the UL: “Paste with ID” keeps its type and unselected subsequent body/branch. To try cut, reload the sample and cut the source items: `Before`/`after` join while `Retained body` and `Retained branch` stay. Undo restores items and IDs. These buttons use page memory, not the OS clipboard.

For selected branches, choose “Load nested branch clipboard sample” and reuse the item selection/copy/paste buttons. The three outer items include first/middle branches and a deeper OL with five IDs: `anna`, `elena`, `deep`, `liam` and `boris`. HTML shows the hierarchy; text shows labels in traversal order. Paste into the destination UL retains nested UL/OL kinds and the final unselected destination body/branch. Reload and cut to see selected branches removed while `Retained body` and `Retained branch` stay outside the cut. Undo restores them. Current browser/example execution results and their limits are recorded under [testing](/en/testing).

For level intervals, choose “Load different-level clipboard sample”, then “Parent → nested item”, “Nested → outer item” or “Between cousin branches”. Each button creates a backward selection with the relevant IDs. Copy to memory, choose “Tree paste position” and paste with ID to inspect preserved ancestor shells. Reload and cut between cousin branches: `Left` and `right tail` stay in their original UL/OL branches, rather than joining; parent `anna` and later outer `boris` remain untouched. Undo restores the entire interval. Current browser/example execution results and their limits are recorded under [testing](/en/testing).
