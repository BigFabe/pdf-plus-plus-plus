/*
 * Content-bound detection adapted from Zotero's PDF.js fork (Apache-2.0):
 * https://github.com/zotero/pdf.js/blob/f57fc80d1c07e4cdc50a767ae0b500b5272123b4/src/core/module/content-rect.js
 * Modified for Obsidian text runs, cached neighboring pages, and conservative
 * page-number filtering. See THIRD_PARTY_LICENSES.
 */
import { Component, TFile } from 'obsidian';
import { PDFDocumentProxy } from 'pdfjs-dist';

import { PDFPlusLibSubmodule } from './submodule';
import { PDFPageView, PDFViewerChild, Rect, TextContentItem } from 'typings';
import { getOffsetInTextLayerNode, getTextLayerInfo, getTextLayerNode } from 'utils';

export interface SelectionTextRange {
    beginIndex: number;
    beginOffset: number;
    endIndex: number;
    endOffset: number;
}

type TextLayerInfo = NonNullable<ReturnType<typeof getTextLayerInfo>>;

export interface MultiPageSelection {
    child: PDFViewerChild;
    file: TFile;
    doc: PDFDocumentProxy;
    firstPage: number;
    lastPage: number;
    beginIndex: number;
    beginOffset: number;
    endIndex: number;
    endOffset: number;
    anchorPage: number;
    anchorIndex: number;
    layers: Map<number, TextLayerInfo>;
}

export interface SelectionPart {
    page: number;
    range: SelectionTextRange;
    text: string;
    rects: Rect[];
}

interface Line {
    text: string;
    rect: Rect;
}

interface PageText {
    items: TextContentItem[];
    lines: Line[];
    view: Rect;
}

function bounds(rects: Rect[]): Rect {
    return rects.reduce<Rect>((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
}

function itemRect(item: TextContentItem): Rect {
    if (item.chars?.length) return bounds(item.chars.map(char => char.r));
    const [a, b, c, d, x, y] = item.transform;
    const length = Math.hypot(a, b) || 1;
    const endX = x + a / length * item.width + c;
    const endY = y + b / length * item.width + d;
    return [Math.min(x, endX), Math.min(y, endY), Math.max(x, endX), Math.max(y, endY)];
}

function inside(rect: Rect, content: Rect): boolean {
    const x = (rect[0] + rect[2]) / 2;
    const y = (rect[1] + rect[3]) / 2;
    return x >= content[0] && x <= content[2] && y >= content[1] && y <= content[3];
}

function similar(a: string, b: string): boolean {
    if (a === b) return true;
    if (!a || !b || Math.abs(a.length - b.length) / Math.max(a.length, b.length) > 0.2) return false;
    // Zotero compares neighboring lines with a 20% edit-distance tolerance.
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        previous = current;
    }
    return previous[b.length] / a.length <= 0.2;
}

export class PDFSelectionLib extends PDFPlusLibSubmodule {
    private pages = new WeakMap<PDFDocumentProxy, Map<number, Promise<PageText>>>();
    private content = new WeakMap<PDFDocumentProxy, Map<number, Promise<Rect>>>();
    private viewerCleanups = new WeakMap<PDFViewerChild, () => void>();

    /** Exclude recognized marginal text from native selection when its anchor is in the body. */
    registerViewer(child: PDFViewerChild, parent: Component) {
        this.viewerCleanups.get(child)?.();
        const container = child.pdfViewer.dom?.viewerContainerEl;
        if (!container) return;
        const binding = parent.addChild(new Component());
        const cleanup = () => parent.removeChild(binding);
        this.viewerCleanups.set(child, cleanup);
        let disposed = false;
        const role = (node: Node | null) => {
            const el = node?.nodeType === 1 ? node as Element : node?.parentElement;
            return el?.closest<HTMLElement>('[data-pdf-plus-selection-role]')?.dataset.pdfPlusSelectionRole;
        };
        const updateFlow = () => {
            const anchor = container.doc.getSelection()?.anchorNode ?? null;
            container.toggleClass('pdf-plus-selection-body', !!anchor && container.contains(anchor) && role(anchor) === 'body');
        };
        const markPage = async (page: PDFPageView) => {
            const doc = child.pdfViewer.pdfViewer?.pdfDocument;
            const info = page.textLayer && getTextLayerInfo(page.textLayer);
            if (!doc || !info?.textContentItems.length) return;
            const content = await this.getContent(doc, page.id);
            if (disposed || child.pdfViewer.pdfViewer?.pdfDocument !== doc
                || !page.textLayer || getTextLayerInfo(page.textLayer) !== info) return;
            info.textDivs.forEach((div, index) => {
                const item = info.textContentItems[index];
                if (!item) return;
                const margin = !inside(itemRect(item), content);
                div.dataset.pdfPlusSelectionRole = margin ? 'margin' : 'body';
                div.toggleClass('pdf-plus-selection-margin', margin);
            });
            updateFlow();
        };
        const mark = (page: PDFPageView) => {
            markPage(page).catch(error => console.warn(`${this.plugin.manifest.name}: Could not classify PDF selection margins.`, error));
        };
        binding.registerDomEvent(container, 'pointerdown', event => {
            if (event.button !== 0) return;
            // Switch before the browser starts selection. Clicking directly in a
            // header still permits selecting it; Shift extends the existing flow.
            const anchor = event.shiftKey ? container.doc.getSelection()?.anchorNode : event.targetNode;
            container.toggleClass('pdf-plus-selection-body', role(anchor ?? null) === 'body');
        }, true);
        binding.registerDomEvent(container.doc, 'selectionchange', updateFlow);
        this.lib.registerPDFEvent('textlayerrendered', child.pdfViewer.eventBus, binding, ({ source }) => mark(source));
        binding.register(() => {
            disposed = true;
            container.removeClass('pdf-plus-selection-body');
            for (const div of container.querySelectorAll<HTMLElement>('[data-pdf-plus-selection-role]')) {
                delete div.dataset.pdfPlusSelectionRole;
                div.removeClass('pdf-plus-selection-margin');
            }
            if (this.viewerCleanups.get(child) === cleanup) this.viewerCleanups.delete(child);
        });
        child.pdfViewer.pdfViewer?._pages.forEach(page => {
            if (page.textLayer) mark(page);
        });
    }

    /** Snapshot endpoints before an async menu or a PDF write can clear selection. */
    capture(selection: Selection | null = activeWindow.getSelection()): MultiPageSelection | null {
        if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
        const range = selection.getRangeAt(0);
        const firstEl = this.lib.getPageElAssociatedWithNode(range.startContainer);
        const lastEl = this.lib.getPageElAssociatedWithNode(range.endContainer);
        if (!firstEl || !lastEl || firstEl === lastEl) return null;
        const child = this.lib.getPDFViewerChildAssociatedWithNode(firstEl);
        if (!child?.file || this.lib.getPDFViewerChildAssociatedWithNode(lastEl) !== child) return null;
        const doc = child.pdfViewer.pdfViewer?.pdfDocument;
        if (!doc) return null;
        const firstPage = Number(firstEl.dataset.pageNumber);
        const lastPage = Number(lastEl.dataset.pageNumber);
        if (!Number.isInteger(firstPage) || !Number.isInteger(lastPage) || firstPage < 1 || lastPage < firstPage || lastPage > doc.numPages) return null;
        const start = getTextLayerNode(firstEl, range.startContainer);
        const end = getTextLayerNode(lastEl, range.endContainer);
        if (start?.dataset.idx === undefined || end?.dataset.idx === undefined) return null;
        const beginOffset = getOffsetInTextLayerNode(start, range.startContainer, range.startOffset);
        const endOffset = getOffsetInTextLayerNode(end, range.endContainer, range.endOffset);
        if (beginOffset === null || endOffset === null) return null;
        const layers = new Map<number, TextLayerInfo>();
        for (let page = firstPage; page <= lastPage; page++) {
            const layer = child.getPage(page)?.textLayer;
            const info = layer && getTextLayerInfo(layer);
            if (info?.textContentItems.length && info.textDivs.length) layers.set(page, info);
        }
        const beginIndex = Number(start.dataset.idx) - this.plugin.textDivFirstIdx;
        const endIndex = Number(end.dataset.idx) - this.plugin.textDivFirstIdx;
        const reversed = selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset;
        return {
            child, file: child.file, doc, firstPage, lastPage, beginIndex, beginOffset, endIndex, endOffset,
            anchorPage: reversed ? lastPage : firstPage,
            anchorIndex: reversed ? endIndex : beginIndex,
            layers,
        };
    }

    private getPage(doc: PDFDocumentProxy, pageNumber: number): Promise<PageText> {
        let pages = this.pages.get(doc);
        if (!pages) this.pages.set(doc, pages = new Map<number, Promise<PageText>>());
        let result = pages.get(pageNumber);
        if (!result) {
            result = (async () => {
                const page = await doc.getPage(pageNumber);
                const options: NonNullable<Parameters<typeof page.getTextContent>[0]> & { includeChars: boolean } = { includeChars: true };
                const content = await page.getTextContent(options);
                const items = content.items.filter((item): item is TextContentItem => 'str' in item);
                const lines: Line[] = [];
                let line: Line | null = null;
                const flush = () => {
                    if (line?.text.trim()) lines.push({ ...line, text: line.text.replace(/\s+/g, ' ').trim() });
                    line = null;
                };
                for (const item of items) {
                    if (item.str.trim()) {
                        const rect = itemRect(item);
                        if (line && Math.abs((rect[1] + rect[3] - line.rect[1] - line.rect[3]) / 2) > Math.max(item.height, 1) / 2) flush();
                        if (line) {
                            line.text += item.str;
                            line.rect = bounds([line.rect, rect]);
                        } else line = { text: item.str, rect };
                    } else if (line && item.str) line.text += ' ';
                    if (item.hasEOL) flush();
                }
                flush();
                return { items, lines, view: page.view as Rect };
            })();
            pages.set(pageNumber, result);
        }
        return result;
    }

    private getContent(doc: PDFDocumentProxy, pageNumber: number): Promise<Rect> {
        let pages = this.content.get(doc);
        if (!pages) this.content.set(doc, pages = new Map<number, Promise<Rect>>());
        let result = pages.get(pageNumber);
        if (!result) {
            result = (async () => {
                const current = await this.getPage(doc, pageNumber);
                const neighbors: PageText[] = [];
                for (let page = Math.max(1, pageNumber - 2); page <= Math.min(doc.numPages, pageNumber + 2); page++) {
                    if (page === pageNumber) continue;
                    const other = await this.getPage(doc, page);
                    if (other.view[2] - other.view[0] === current.view[2] - current.view[0]
                        && other.view[3] - other.view[1] === current.view[3] - current.view[1]) neighbors.push(other);
                }
                const labels = await doc.getPageLabels();
                const label = labels?.[pageNumber - 1] ?? String(pageNumber);
                const height = current.view[3] - current.view[1];
                const body = current.lines.filter(line => {
                    if (!inside(line.rect, current.view)) return false;
                    const centerY = (line.rect[1] + line.rect[3]) / 2 - current.view[1];
                    // Only marginal lines can reduce the body bounds. This keeps
                    // repeated body text, footnotes and deliberately chosen titles.
                    if (centerY > height * 0.2 && centerY < height * 0.8) return true;
                    if (line.text === label || /^[-–—\s]*\d+[-–—\s]*$/.test(line.text)) return false;
                    return !neighbors.some(other => other.lines.some(otherLine => {
                        const otherY = (otherLine.rect[1] + otherLine.rect[3]) / 2 - other.view[1];
                        return Math.abs(centerY - otherY) <= 0.2 && similar(line.text, otherLine.text);
                    }));
                });
                return body.length ? bounds(body.map(line => line.rect)) : current.view;
            })();
            pages.set(pageNumber, result);
        }
        return result;
    }

    async prepare(snapshot: MultiPageSelection): Promise<SelectionPart[]> {
        const anchor = await this.getPage(snapshot.doc, snapshot.anchorPage);
        const anchorItems = snapshot.layers.get(snapshot.anchorPage)?.textContentItems ?? anchor.items;
        const anchorItem = anchorItems[snapshot.anchorIndex];
        const filterMargins = !!anchorItem && inside(itemRect(anchorItem), await this.getContent(snapshot.doc, snapshot.anchorPage));
        const parts: SelectionPart[] = [];
        for (let page = snapshot.firstPage; page <= snapshot.lastPage; page++) {
            const data = await this.getPage(snapshot.doc, page);
            const layer = snapshot.layers.get(page);
            const items = layer?.textContentItems ?? data.items;
            const content = filterMargins ? await this.getContent(snapshot.doc, page) : data.view;
            const beginIndex = page === snapshot.firstPage ? snapshot.beginIndex : 0;
            const endIndex = page === snapshot.lastPage ? snapshot.endIndex : items.length - 1;
            let range: SelectionTextRange | null = null;
            const flush = () => {
                if (!range) return;
                const text = this.lib.getSelectedText(items, range.beginIndex, range.beginOffset, range.endIndex, range.endOffset);
                if (text) {
                    const rects = layer
                        ? this.lib.highlight.geometry.computeMergedHighlightRects(layer, range.beginIndex, range.beginOffset, range.endIndex, range.endOffset).map(result => result.rect)
                        : items.slice(range.beginIndex, range.endIndex + 1).filter(item => item.str.trim()).map(itemRect);
                    if (rects.length) parts.push({ page, range, text, rects });
                }
                range = null;
            };
            for (let index = beginIndex; index <= endIndex; index++) {
                const item = items[index];
                if (!item) throw new Error('PDF selection text is no longer available. Select the text again.');
                const from = page === snapshot.firstPage && index === beginIndex ? snapshot.beginOffset : 0;
                const to = page === snapshot.lastPage && index === endIndex ? snapshot.endOffset : item.str.length;
                if (!inside(itemRect(item), content)) {
                    flush();
                    continue;
                }
                if (from >= to || !item.str.slice(from, to).trim()) continue;
                if (!range) range = { beginIndex: index, beginOffset: from, endIndex: index, endOffset: to };
                else { range.endIndex = index; range.endOffset = to; }
            }
            flush();
        }
        return parts;
    }
}
