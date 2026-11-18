# Image placement

Additive image-plugin contract: `ImageAlignment = 'left' | 'center' | 'right'`;
`ImageValue.alignment?: ImageAlignment | false`, inherited by ImagePatch, and
`ImageCommands.align(alignment: ImageAlignment | false): void`. False resets
explicit placement; omission preserves existing placement in update. getSelected
reports alignment only when the IMG has canonical block placement, otherwise
omits it. No schema version change: older readers may discard the new styles.

Placement belongs to the actual IMG, independently of caption text alignment.
Canonical styles are display:block and margin-left/right pairs 0px/auto,
auto/auto, auto/0px. Reset removes these three properties. It preserves actual
IMG/figure/rich caption, source, dimensions, surrounding paragraphs and cell/list
structure. Inline imports are not promoted or split: block display changes their
visual line placement only. No floats, wrapping, crop, logical start/end or
caption placement is implied. Placement is physical in both LTR and RTL; a full
width image can have visually neutral alignment.

Core HTML/JSON codecs accept display:block only on IMG and margin-left/right
0px|auto on IMG in addition to the existing TABLE rule. Reject other display
values/tags, arbitrary lengths, CSS-wide values, shorthand and executable CSS.
Persistence requires no image plugin and exported HTML carries inline placement.

Alignment writes (including insert/update) accept only the enum or false, require
ordinary image ownership (same bounded figure/semantic rules as proportional
resize), and reject unsupported targets before mutation. Read-only/composition
block alignment edits. align checks ownership, actual selection and revision
again after focus; identical canonical alignment/reset is a history no-op.
One successful align is one transaction/Undo and keeps selected IMG. Metadata
updates that omit alignment preserve it. Invalid alignment rejects atomically.

The reusable image form adds a separately labeled left/center/right/reset button
group, localized in RU/EN, applying immediately to its remembered selected image.
It is available in all/edit modes and contextual image properties. It does not
change ImageFormValues, drafts or insert semantics. Disabled for no selection,
read-only, composition, uploads or ineligible ownership. Restore selection with a
post-focus revision/identity guard; never apply old controls to a replacement.
Dispose with the existing form. Main demo and RU/EN docs expose these controls.

Acceptance definitions cover all placements/reset, JSON/HTML safety and roundtrip,
rich-caption preservation, history/no-op, inline/list/merged-cell boundaries,
invalid input, semantic/complex ownership, read-only/IME, focus replacement and
localized form lifecycle. Tests are authored but not run locally at the user's
request; report non-test checks and gzip measurements from actual runs only.
