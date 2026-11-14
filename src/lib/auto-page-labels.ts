/*
 * Page-label detection adapted from Zotero's PDF.js fork (Apache-2.0):
 * https://github.com/zotero/pdf.js/blob/f57fc80d1c07e4cdc50a767ae0b500b5272123b4/src/core/module/page-label.js
 * Modified for Obsidian: PDF.js text/character adapter, bounded page sampling,
 * corrected longest-sequence comparison, and cached, read-only integration.
 * See THIRD_PARTY_LICENSES for the license.
 */
import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { Rect, TextContentItem } from 'typings';

interface Word {
    text: string;
    rect: Rect;
}

interface Candidate extends Word {
    pageIndex: number;
    type: 'arabic' | 'roman';
    integer: number;
    relativeX: number;
    relativeY: number;
}

type Coordinate = 'relativeX' | 'relativeY';
const EPSILON = 5;
const MAX_PAGES = 25;
const NEIGHBORS = 2;

function boundingRect(rects: Rect[]): Rect {
    return rects.reduce<Rect>((bounds, rect) => [
        Math.min(bounds[0], rect[0]), Math.min(bounds[1], rect[1]),
        Math.max(bounds[2], rect[2]), Math.max(bounds[3], rect[3]),
    ], [Infinity, Infinity, -Infinity, -Infinity]);
}

function romanToInteger(text: string): number | null {
    if (!text || (text !== text.toUpperCase() && text !== text.toLowerCase())) return null;
    const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    let previous = 0;
    for (const char of text.toUpperCase()) {
        const value = values[char];
        if (value === undefined) return null;
        total += value > previous ? value - 2 * previous : value;
        previous = value;
    }
    return total;
}

// Zotero supplies structured words. Obsidian supplies text runs with optional
// character rectangles instead, so reconstruct words before running its matcher.
async function getPageCandidates(page: PDFPageProxy, pageIndex: number): Promise<Candidate[]> {
    const options: NonNullable<Parameters<PDFPageProxy['getTextContent']>[0]> & { includeChars: boolean } = { includeChars: true };
    const { items } = await page.getTextContent(options);
    const viewport = page.getViewport({ scale: 1 });
    const words: Word[] = [];
    let text = '';
    let rects: Rect[] = [];
    let previousRect: Rect | null = null;
    const flush = () => {
        if (text) words.push({ text, rect: boundingRect(rects) });
        text = '';
        rects = [];
        previousRect = null;
    };
    const append = (str: string, rect: Rect) => {
        const converted = viewport.convertToViewportRectangle(rect) as number[];
        const box: Rect = [
            Math.min(converted[0], converted[2]), Math.min(converted[1], converted[3]),
            Math.max(converted[0], converted[2]), Math.max(converted[1], converted[3]),
        ];
        if (box[2] < 0 || box[0] > viewport.width || box[3] < 0 || box[1] > viewport.height) return;
        if (!str.trim()) {
            flush();
            return;
        }
        if (previousRect) {
            const height = Math.max(1, previousRect[3] - previousRect[1], box[3] - box[1]);
            const gap = Math.max(box[0] - previousRect[2], previousRect[0] - box[2]);
            if (Math.abs(box[3] - previousRect[3]) > height / 2 || gap > height / 4) flush();
        }
        text += str;
        rects.push(box);
        previousRect = box;
    };

    for (const item of items.filter((item): item is TextContentItem => 'str' in item)) {
        if (item.chars?.length) {
            for (const char of item.chars) append(char.u || char.c, char.r);
        } else {
            // Standard PDF.js does not expose character rectangles. Approximate
            // each word's extent from the text run, not from the rendered DOM.
            flush();
            const [a, b, c, d, x, y] = item.transform;
            const length = Math.hypot(a, b) || 1;
            const height = Math.hypot(c, d) || item.height;
            const normalLength = Math.hypot(c, d) || 1;
            for (const match of item.str.matchAll(/\S+/g)) {
                const start = match.index / item.str.length * item.width;
                const end = (match.index + match[0].length) / item.str.length * item.width;
                const x1 = x + a / length * start;
                const y1 = y + b / length * start;
                const x2 = x + a / length * end + c / normalLength * height;
                const y2 = y + b / length * end + d / normalLength * height;
                append(match[0], [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]);
                flush();
            }
        }
        if (item.hasEOL) flush();
    }
    flush();
    if (!words.length) return [];

    const content = boundingRect(words.map(word => word.rect));
    const candidates: Candidate[] = [];
    for (const word of words) {
        const lastInteger = word.text.match(/\d+(?!.*\d)/)?.[0];
        const arabic = lastInteger ? parseInt(lastInteger, 10) : 0;
        const integer = arabic || romanToInteger(word.text);
        if (!integer) continue;
        const centerX = (word.rect[0] + word.rect[2]) / 2;
        const centerY = (word.rect[1] + word.rect[3]) / 2;
        const deltaX = centerX - viewport.width / 2;
        candidates.push({
            ...word,
            pageIndex,
            type: arabic ? 'arabic' : 'roman',
            integer,
            relativeX: Math.abs(deltaX) < EPSILON ? deltaX
                : deltaX < 0 ? word.rect[0] - content[0] : content[2] - word.rect[2],
            relativeY: centerY < viewport.height / 2 ? word.rect[1] - content[1] : content[3] - word.rect[3],
        });
    }
    return candidates;
}

function getClusters(candidates: Candidate[], property: Coordinate): Candidate[][] {
    const sorted = [...candidates].sort((a, b) => a[property] - b[property]);
    const clusters: Candidate[][] = [];
    let current: Candidate[] = [];
    const finish = () => {
        if (new Set(current.map(word => word.pageIndex)).size >= 3) clusters.push(current);
        current = [];
    };
    for (const word of sorted) {
        if (current.length && word[property] - current[current.length - 1][property] > EPSILON) finish();
        current.push(word);
    }
    finish();
    return clusters;
}

function getLabelSequence(candidates: Candidate[]): Candidate[] {
    const sorted = [...candidates].sort((a, b) => a.integer - b.integer);
    let best: Candidate[] = [];
    for (let i = 0; i < sorted.length; i++) {
        const sequence = [sorted[i]];
        for (let j = i + 1; j < sorted.length; j++) {
            const previous = sequence[sequence.length - 1];
            const word = sorted[j];
            if (word.type === previous.type && word.pageIndex > previous.pageIndex
                && word.pageIndex - previous.pageIndex === word.integer - previous.integer) {
                sequence.push(word);
            }
        }
        if (sequence.length >= 3 && sequence.length > best.length) best = sequence;
    }
    return best;
}

function maxDistance(sequence: Candidate[], property: Coordinate): number {
    const values = sequence.map(word => word[property]);
    return Math.max(...values) - Math.min(...values);
}

function getPageLabel(pages: Candidate[][], pageIndex: number): Candidate | undefined {
    const from = Math.max(0, pageIndex - NEIGHBORS);
    const to = Math.min(pages.length, Math.max(pageIndex + NEIGHBORS + 1, NEIGHBORS * 2 + 1));
    const words = pages.slice(from, to).flat();
    let best: Candidate[] = [];
    for (const yCluster of getClusters(words, 'relativeY')) {
        for (const cluster of getClusters(yCluster, 'relativeX')) {
            if (cluster.length > EPSILON * 5) continue;
            const sequence = getLabelSequence(cluster);
            if (sequence.length > best.length
                && maxDistance(sequence, 'relativeX') <= EPSILON
                && maxDistance(sequence, 'relativeY') <= EPSILON) {
                best = sequence;
            }
        }
    }
    return best.find(word => word.pageIndex === pageIndex);
}

/** Read-only detection, using Zotero's 25-page sample and sequence validation. */
export async function detectPageLabels(doc: PDFDocumentProxy, catalogLabels: string[] | null): Promise<string[] | null> {
    const pages: Candidate[][] = [];
    for (let i = 0; i < Math.min(doc.numPages, MAX_PAGES + NEIGHBORS); i++) {
        pages.push(await getPageCandidates(await doc.getPage(i + 1), i));
    }
    let extracted: Candidate[] = [];
    for (let i = 0; i < Math.min(doc.numPages, MAX_PAGES); i++) {
        const label = getPageLabel(pages, i);
        if (label) extracted.push(label);
    }
    if (extracted.length < 2 || extracted.some((label, i) => {
        const previous = extracted[i - 1];
        return previous && previous.type === label.type
            && label.pageIndex - previous.pageIndex !== label.integer - previous.integer;
    })) extracted = [];

    const firstArabic = extracted.find(label => label.type === 'arabic');
    const hasRoman = extracted.some(label => label.type === 'roman');
    // Like Zotero, retain catalog labels if confirmed by text, or if the text
    // doesn't provide a consistent Arabic sequence to replace them.
    if (catalogLabels?.length === doc.numPages
        && (!firstArabic || hasRoman || extracted.some(label => catalogLabels[label.pageIndex] === label.text))) {
        return catalogLabels;
    }
    if (!firstArabic) return catalogLabels;

    const start = firstArabic.integer - firstArabic.pageIndex;
    return Array.from({ length: doc.numPages }, (_, i) => start + i >= 1 ? String(start + i) : '-');
}
