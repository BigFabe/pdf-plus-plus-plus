import { App, Component, Notice, Platform, TFile } from 'obsidian';
import pLimit from 'p-limit';

import PDFPlus from 'main';
import { AnnotationElement, Embed, EmbedContext, Rect } from 'typings';


export class PDFCroppedEmbed extends Component implements Embed {
    // Limit the number of concurrent PDF rendering tasks to avoid running out of memory
    // especially on mobile devices, which will cause the app to crash.
    // https://github.com/RyotaUshio/obsidian-pdf-plus/issues/397
    private static readonly limit = pLimit(Platform.isMobile ? 3 : 10);

    app: App;
    containerEl: HTMLElement;

    get lib() {
        return this.plugin.lib;
    }

    constructor(public plugin: PDFPlus, public ctx: EmbedContext, public file: TFile, public subpath: string, public pageNumber: number, public rect: Rect, public width?: number, public annotationId?: string) {
        super();
        this.app = ctx.app;
        this.containerEl = ctx.containerEl;
        this.rect = window.pdfjsLib.Util.normalizeRect(rect);
        this.containerEl.addClass('pdf-cropped-embed');
        if (width) this.containerEl.setAttribute('width', '' + width);
    }

    onload() {
        super.onload();

        const reload = () => {
            this.loadFile().catch((error) => {
                console.error(`${this.plugin.manifest.name}: Failed to reload PDF crop "${this.file.path}".`, error);
                new Notice(`${this.plugin.manifest.name}: Could not reload PDF crop "${this.file.path}". See console for details.`);
            });
        };

        if (this.shouldUpdateOnModify()) {
            this.registerEvent(this.app.vault.on('modify', (file) => {
                if (file === this.file) reload();
            }));
        }

        if (this.plugin.settings.rectFollowAdaptToTheme) {
            this.registerEvent(this.app.workspace.on('css-change', reload));
            this.registerEvent(this.plugin.on('adapt-to-theme-change', reload));
        }
    }

    shouldUpdateOnModify() {
        return typeof this.annotationId === 'string';
    }

    async loadFile() {
        const dataUrl: string = await PDFCroppedEmbed.limit(this.computeDataUrl.bind(this));

        this.containerEl.empty();
        const imgEl = this.containerEl.createEl('img');
        const width = this.containerEl.getAttribute('width');
        const height = this.containerEl.getAttribute('height');
        if (width) imgEl.setAttribute('width', width);
        if (height) imgEl.setAttribute('height', height);

        let timeout: number | undefined;
        try {
            await new Promise<void>((resolve, reject) => {
                imgEl.onload = () => resolve();
                imgEl.onerror = () => reject(new Error('Failed to load the PDF crop image.'));
                timeout = window.setTimeout(() => reject(new Error('PDF crop image loading timed out.')), 5000);
                imgEl.src = dataUrl;
            });
        } finally {
            window.clearTimeout(timeout);
            imgEl.onload = null;
            imgEl.onerror = null;
        }
    }

    async computeDataUrl() {
        const doc = await this.lib.loadPDFDocument(this.file);
        try {
            const page = await doc.getPage(this.pageNumber);

            if (this.annotationId) {
                const annotations = await page.getAnnotations();
                const annotation: AnnotationElement['data'] = annotations.find((annot) => annot.id === this.annotationId);
                if (annotation && Array.isArray(annotation.rect)) {
                    this.rect = window.pdfjsLib.Util.normalizeRect(annotation.rect);
                }
            }

            return await this.lib.pdfPageToImageDataUrl(page, {
                type: 'image/png',
                cropRect: this.rect,
                renderParams: this.lib.getOptionalRenderParameters(),
            });
        } finally {
            await doc.destroy();
        }
    }
}
