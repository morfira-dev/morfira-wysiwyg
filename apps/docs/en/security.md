# Security and trust boundaries

Morfira reconstructs allowed content at the HTML and schema-v1 JSON boundaries. This reduces executable-markup risk; it does not replace server validation or sandbox application code. Verification results and remaining product limits are listed in the [roadmap](/en/roadmap#verification-and-limits).

## Document input

The codec keeps allowed HTML elements and validated attributes, styles and URL protocols. Event handlers, executable elements, foreign SVG/MathML subtrees and arbitrary CSS do not become editor content. JSON is validated too: TypeScript types alone do not validate network input. Custom schema contributions use this same boundary.

HTML input and normalized output have a conservative limit of 5,000,000 UTF-16 code units, with at most 100,000 visited nodes, depth 100 and retained attribute values of at most 20,000 code units. Escaping and retained attributes count toward the output limit. These are resource bounds, not a byte-size guarantee. Applications should impose smaller request/document limits appropriate to their workload and handle validation errors.

String-only sanitization/serialization uses inert intermediate DOM; deliberately rendering or inserting an allowed image can load it. HTTP(S) and relative image URLs are allowed; this is not a host allowlist or tracking-prevention policy. Restrict media origins separately when needed. Disallowed `data:`, `blob:` or executable URL schemes are not upload-storage mechanisms.

## Trusted application code

Plugins, event listeners, suggestion providers, upload callbacks, transaction callbacks and access to `editor.surface` execute with the application's privileges. Install only trusted code; do not construct executable plugins or callbacks from a stored document. Typed events are notifications, not a security boundary. Read-only prevents supported user mutations; it cannot restrict arbitrary application JavaScript or replace authorization.

Adapters pass controlled values through editor validation. Framework imports can be used in SSR, but creating editors and using the DOM-based codec requires a browser DOM. Do not assume the client sanitizer is a server-side library.

## Server storage and output

Validate submitted HTML/JSON independently on the server using an explicitly supported document schema and policy. Enforce authentication, document ownership, authorization, request limits and safe output rules on every write/read path. A client can bypass the editor entirely.

`getHTML()` produces document HTML, not a value escaped for every embedding context. Use framework property bindings and context-appropriate escaping. For the Web Component, assign its `value` property; if using an HTML attribute, escape the entire quoted attribute value. Arbitrary existing light-DOM children are not an automatically sanitized input channel. Do not interpolate documents into script blocks, JavaScript strings or raw SSR templates; use the framework's safe data serializer. `JSON.stringify()` alone is insufficient protection for an inline script containing `</script>`.

## Uploads and network access

The [images plugin](/en/images) performs preliminary MIME/size checks and validates the returned image value. Your server must independently validate file content and size, authorize storage and media access, and apply its media processing policy. Use HTTPS for the application and upload/media endpoints. For cookie-authenticated uploads, apply the application's CSRF protection; credentials, CORS and tokens belong to the transport implementation. Pass `AbortSignal` through to transport, and render errors as text.

If a backend fetches user-supplied URLs, protect that separate service against SSRF, including private-network targets and redirects. Browser URL sanitization does not provide that protection. Use CSP `img-src` and application URL rules to limit permitted media origins.

## CSP and Trusted Types limitations

There is no tested universal CSP header for every integration. The codec/editor currently writes validated strings to `innerHTML` and does not expose a TrustedHTML/policy integration. Enforcing `require-trusted-types-for 'script'` rejects string sinks in supporting browsers; compatibility with that enforcement is **not implemented**. Do not bypass the boundary with a default policy that blindly approves strings. See [MDN: require-trusted-types-for](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/require-trusted-types-for).

Document formatting uses validated inline style attributes for colors, alignment and image dimensions. A policy forbidding style attributes can block those styles; a nonce on a stylesheet does not authorize element style attributes. Review [MDN: style-src-attr](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr) when choosing the required formatting profile and policy. Nonce-only compatibility is not promised.

The local documentation is a separate VitePress application: generated pages contain inline bootstrap scripts and style attributes. Hosting it under a strict CSP requires its own build/header work and browser verification; a policy suitable for a headless consumer is not automatically suitable for this site. Validate the actual deployed app under its headers, using report-only rollout where appropriate. CSP supplements input validation; it does not replace it.

For suspected vulnerabilities, follow the repository's [security reporting policy](https://github.com/morfira-dev/morfira-wysiwyg/blob/main/SECURITY.md). No independent security audit or complete security certification is claimed.
