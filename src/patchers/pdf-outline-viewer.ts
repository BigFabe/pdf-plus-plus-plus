import { Notice } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { onOutlineItemContextMenu } from 'context-menu';
import { PDFOutlineTreeNode, PDFOutlineViewer } from 'typings';


export const patchPDFOutlineViewer = (plugin: PDFPlus, pdfOutlineViewer: PDFOutlineViewer) => {
    plugin.register(around(pdfOutlineViewer.constructor.prototype, {
        onItemContextMenu(old) {
            return async function (this: PDFOutlineViewer, item: PDFOutlineTreeNode, evt: MouseEvent) {
                try {
                    const child = this.viewer;
                    const file = child.file;

                    if (!plugin.settings.outlineContextMenu || !file) {
                        return await old.call(this, item, evt);
                    }

                    onOutlineItemContextMenu(plugin, child, file, item, evt);
                } catch (error) {
                    new Notice(`${plugin.manifest.name}: Failed to show the PDF outline context menu.`);
                    console.error(error);
                }
            };
        }
    }));

    return true;
};
