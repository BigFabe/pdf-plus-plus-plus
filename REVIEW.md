# Scope

Disposition of the automated findings at https://community.obsidian.md/plugins/pdf-plus for upstream commit `6a3218b9c506076b405438489e614bc9e22b833b` (0.40.31). The community listing is external and will not change until it scans a published release containing these changes.

# Fixed in this checkout

- Async failures: floating and misused promises, async lifecycle hooks, callback exceptions that left enclosing promises pending, missing awaits on dependent writes, redundant awaits and non-Error rejection values. User-facing operations report failures; background and shutdown failures are logged. PDF workers, crop image handlers and timers are released after failures.
- Window compatibility: timer ownership, document/style selection, per-window generated styles and body classes, active-view access, notice message elements with compatibility fallbacks, and preference for the standard caret-position API.
- Runtime correctness: iOS-incompatible lookbehind, unsafe own-property checks, mutation of shared suggestion defaults, needless expression statements, aliases, duplicated/redundant type constituents, unnecessary assertions and incomplete caret-position declarations. Android WebView diagnostics now use Capacitor's device information rather than user-agent detection. CSS uses compatible RGB components, scoped selectors without `:has()` and no `!important` overrides.
- Packaging and delivery: plugin description, direct CodeMirror dependency, replacement of `builtin-modules` with Node's built-in list and locked package-manager version. Lint/build CI and release-asset attestation configuration are prepared locally; publication of the workflow files is still pending.
- Permissions and disclosures: explicit opt-in for automatic GitHub update checks, HTTP imports via `requestUrl`, trusted-code warnings beside template/vimrc settings, and documented vault, clipboard, network and desktop-process access.

# Settings search

Obsidian 1.13+ receives real setting definitions with names, descriptions, section aliases and setting keys. Indexing does not create controls, register UI handlers or open dialogs. Imperative row renderers preserve the existing controls, templates, navigation and save callbacks. Conditional visibility is represented in the definitions; structural changes call `update()` to rebuild the UI and search index.

Older supported Obsidian versions keep the imperative `display()` fallback. Each rendered settings view owns its components and event handlers; rebuilding or closing the view releases them. Descriptions containing links retain their nodes and handlers when rendered again.

# Findings retained with reasons

- Dynamic execution: JavaScript templates and Vim scripts are existing documented features. Their `Function` constructors remain with narrowly scoped lint explanations and prominent trust warnings; they are not sandboxed.
- Desktop capabilities: AnyStyle and explicit Vim shell commands are intentional desktop-only features. OS inspection is desktop-only debug information. Node modules are dynamically imported after platform checks rather than removed.
- Legacy APIs: `noticeEl` is retained only as a fallback for older supported Obsidian versions. `caretRangeFromPoint` is retained only when the standard API is absent. Explicit owner-window timer/document references remain where targeting that window is necessary.
- Capability disclosures: vault enumeration/read/write and clipboard access are required for the plugin's requested features. Local blob/resource fetching is not an external HTTP request and cannot use `requestUrl`.

# External limitations

Existing upstream release assets cannot acquire attestations merely through a local source edit. The workflow changes are not yet published on GitHub. Future releases need their publication and a successful workflow run; no release has been published here.

The listing's unavailable malware, vulnerability, obfuscation, network and build-verification scans describe the community service's coverage. This checkout cannot turn those scans on or certify their results. No full security audit or live Obsidian compatibility verification is claimed.

# Verification

`pnpm install --frozen-lockfile --ignore-scripts`, `pnpm lint`, `pnpm build` and `git diff --check` are the local verification steps. Lint now additionally enforces `no-explicit-any`, the `no-unsafe-*` type-safety rules and safe enum comparisons, alongside promise handling, own-property access, meaningful expressions and global document/timer restrictions. Public callback contracts and runtime narrowing replace unchecked data at external boundaries. TypeScript also checks bound calls, implicit `this` and caught error values. Deliberate trusted-code execution has documented local exemptions.

No tests were added or run. The release and validation workflows have not been executed on GitHub, and the built plugin has not been installed into the user's vault.
