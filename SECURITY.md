# Vault and clipboard permissions

PDF++ lists vault files to find backlinks, suggest files and associate Markdown notes with PDFs. Annotation, page-composer, auto-paste and settings operations read or modify vault files. Some commands modify PDF files directly; keep important PDFs under version control or another backup system.

Copy commands write links, text or images to the clipboard. Explicit debug commands also read clipboard contents. Built-in update checks do not transmit vault contents or clipboard data.

# Network activity

- Automatic update checks are opt-in and disabled by default, including upgrades from versions without explicit consent. Enabling the setting allows release-metadata requests to `api.github.com` on startup and every 24 hours. GitHub receives ordinary connection metadata such as your IP address. A manual update-check command also contacts GitHub.
- Opening or importing an external PDF requests the URL stored in its dummy PDF file. The destination may be any user-selected host, including `arxiv.org`. HTTP requests use Obsidian's `requestUrl`; browser `fetch` is retained only for local blob/resource URLs.
- Google Scholar citation search/popovers, when selected, send the citation search text to `scholar.google.com`.
- Clicking help, documentation, sponsorship or download links opens the corresponding external site, including `github.com`, `help.obsidian.md`, `obsidian.md`, `ryotaushio.github.io`, `ko-fi.com` and `www.buymeacoffee.com`.

The built-in background request is an update check, not an analytics beacon. Disabling it does not prevent requests caused by opening external PDFs, Scholar, external links, other plugins or user scripts.

# JavaScript and desktop processes

Copy templates evaluate `{{...}}` as JavaScript. Vim's `:js`, `:jsfile` and vimrc commands can also execute JavaScript. These are intentional scripting features, not a sandbox: scripts can access Obsidian APIs, files, the clipboard, the network and, on desktop, Node.js. Only use templates and scripts you have reviewed and trust. Do not copy untrusted settings or vimrc files into your vault.

AnyStyle runs a local executable on desktop to parse citation text from a temporary file. It is launched directly with argument separation and without a shell. Vim shell commands explicitly requested by the user execute a shell. Node.js operating-system access is used only for desktop debug information. These desktop-only paths are guarded and are not loaded on mobile.

# Build provenance

The release workflow lints and builds locked dependencies, then requests GitHub build attestations for `main.js`, `manifest.json` and `styles.css`. Attestations are only created when that workflow runs successfully in a repository supporting GitHub attestations. Editing the workflow does not attest existing upstream releases.

# Compatibility limits

PDF++ patches undocumented Obsidian/PDF.js internals. New Obsidian releases can still break those integrations. Static declarations retain explicit `any` at incompletely documented API boundaries; this is not a claim of complete type safety or a security audit.
