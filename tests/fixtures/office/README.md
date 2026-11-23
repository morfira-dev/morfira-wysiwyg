# Office clipboard corpus

These fixtures are recorded application data, never editing-engine code or library runtime imports.
The JSON manifest pins source commits, SHA-256 bytes, capture provenance and known losses.
The adjacent original MIT notices apply to each respective source's data.

- `word-*.html`: Jodit explicitly identifies real Word Windows/Edge and Mac/Safari
  clipboards, already trimmed by its maintainers. Files are extracted cooked string
  literals from the pinned source; no upstream test code is executed/copied.
- `excel-windows-chromium.*`: gridclip's documented real Excel captures, byte-identical
  here including CRLF. The upstream corpus anonymized temporary-path user names.
  Its [REAL-CAPTURES.md](https://github.com/fillddak/gridclip/blob/e6e315c6c46e3c7ff37ebf390dcc344643dcb4a6/test/fixtures/REAL-CAPTURES.md)
  documents version, OS, browser, capture process and original workbook values.
- `google-docs-native-chrome.html` / `.txt`: a fresh native Google Docs capture,
  recorded on 2026-11-23T08:03:38.605Z in Google Chrome on macOS (versions unknown).
  The sample text was authored for this MIT project: three paragraphs and a bullet
  list, including explicit bold formatting. Native Cmd+C produced the clipboard
  data; HTML/plaintext bytes are preserved. No private document URL/account is
  recorded, and Docs internal-slice MIME was deliberately excluded.
- `google-docs-table.html` / `google-docs-formatting.html`: Lexical's upstream clipboard samples. The table test names
  Google Docs; the formatting sample contains its origin wrapper. Capture date,
  OS, browser and direct raw-clipboard provenance are **not documented**. Treat these
  as upstream application samples, not independently verified fresh Docs captures.

No fixture proves compatibility with every current application/browser release.
Prepared synthetic reproductions remain separately in `tests/office-paste.fixture.ts`.
The fresh native capture and historical upstream samples have distinct manifest statuses.
Local capture tooling on the Office guide exports raw MIME strings and self-reported
application metadata without uploading or rendering untrusted HTML.
