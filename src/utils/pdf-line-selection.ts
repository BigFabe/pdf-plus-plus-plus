import { Component } from 'obsidian';
import { isTargetHTMLElement } from './events';


type TextLine = {
    start: Text;
    end: Text;
    left: number;
    right: number;
    top: number;
    bottom: number;
};

/** Dragging from the horizontal PDF margin selects whole visual text lines. */
export function registerPDFLineSelection(component: Component, viewerEl: HTMLElement) {
    const doc = viewerEl.ownerDocument;
    const linesByPage = new Map<HTMLElement, TextLine[]>();
    let anchor: TextLine | null = null;
    let pointerId: number | null = null;

    const getLine = (pageEl: HTMLElement, clientX: number, clientY: number) => {
        const pageRect = pageEl.getBoundingClientRect();
        let lines = linesByPage.get(pageEl);
        if (!lines) {
            lines = [];
            for (const el of pageEl.querySelectorAll<HTMLElement>('.textLayerNode')) {
                if (!el.textContent?.trim()) continue;
                const rect = el.getBoundingClientRect();
                if (!rect.width || !rect.height) continue;

                const iterator = doc.createNodeIterator(el, NodeFilter.SHOW_TEXT);
                const start = iterator.nextNode() as Text | null;
                if (!start) continue;
                let end = start;
                let node: Node | null;
                while ((node = iterator.nextNode())) end = node as Text;

                const top = rect.top - pageRect.top;
                const bottom = rect.bottom - pageRect.top;
                const left = rect.left - pageRect.left;
                const right = rect.right - pageRect.left;
                // Only join consecutive text fragments; columns can share a vertical position.
                const line = lines.at(-1);
                const overlap = line ? Math.min(line.bottom, bottom) - Math.max(line.top, top) : 0;
                if (line && overlap > Math.min(line.bottom - line.top, rect.height) / 2) {
                    line.end = end;
                    line.left = Math.min(line.left, left);
                    line.right = Math.max(line.right, right);
                    line.top = Math.min(line.top, top);
                    line.bottom = Math.max(line.bottom, bottom);
                } else {
                    lines.push({ start, end, left, right, top, bottom });
                }
            }
            linesByPage.set(pageEl, lines);
        }

        const x = clientX - pageRect.left;
        const y = clientY - pageRect.top;
        let closest: TextLine | null = null;
        let distance = Infinity;
        let horizontalDistance = Infinity;
        for (const line of lines) {
            const nextDistance = Math.max(line.top - y, y - line.bottom, 0);
            const nextHorizontalDistance = Math.max(line.left - x, x - line.right, 0);
            if (nextDistance < distance || (nextDistance === distance && nextHorizontalDistance < horizontalDistance)) {
                closest = line;
                distance = nextDistance;
                horizontalDistance = nextHorizontalDistance;
            }
        }
        return closest;
    };

    const selectThrough = (line: TextLine) => {
        if (!anchor) return;
        const backwards = !!(anchor.start.compareDocumentPosition(line.start) & Node.DOCUMENT_POSITION_PRECEDING);
        doc.getSelection()?.setBaseAndExtent(
            backwards ? anchor.end : anchor.start,
            backwards ? anchor.end.length : 0,
            backwards ? line.start : line.end,
            backwards ? 0 : line.end.length
        );
    };

    const update = (evt: PointerEvent) => {
        const pageEl = doc.elementFromPoint(evt.clientX, evt.clientY)?.closest<HTMLElement>('.page');
        if (!pageEl || !viewerEl.contains(pageEl)) return;
        const line = getLine(pageEl, evt.clientX, evt.clientY);
        if (line) selectThrough(line);
    };

    const stop = () => {
        anchor = null;
        pointerId = null;
        linesByPage.clear();
    };
    component.register(stop);

    component.registerDomEvent(viewerEl, 'pointerdown', (evt) => {
        stop();
        if (evt.defaultPrevented || evt.pointerType !== 'mouse' || evt.button !== 0
            || evt.shiftKey || evt.ctrlKey || evt.metaKey || evt.altKey
            || viewerEl.hasClass('pdf-plus-selecting')) return;
        if (!isTargetHTMLElement(evt, evt.target)) return;
        if (evt.target.closest('a, button, input, textarea, [data-annotation-id]')) return;

        const pageEl = evt.target.closest<HTMLElement>('.page');
        if (!pageEl) return;
        const line = getLine(pageEl, evt.clientX, evt.clientY);
        if (!line) return;
        const x = evt.clientX - pageEl.getBoundingClientRect().left;
        if (x >= line.left && x <= line.right) return;

        // Suppress native character selection only for a drag starting beside a line.
        evt.preventDefault();
        anchor = line;
        pointerId = evt.pointerId;
        selectThrough(line);
    }, { capture: true });

    component.registerDomEvent(doc, 'pointermove', (evt) => {
        if (evt.pointerId !== pointerId) return;
        if (!(evt.buttons & 1)) {
            stop();
            return;
        }
        evt.preventDefault();
        update(evt);
    }, { capture: true });

    component.registerDomEvent(doc, 'pointerup', (evt) => {
        if (evt.pointerId !== pointerId) return;
        update(evt);
        stop();
    }, { capture: true });
    component.registerDomEvent(doc, 'pointercancel', stop);
}
