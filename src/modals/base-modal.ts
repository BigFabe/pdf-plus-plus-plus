import { Component, Modal, Notice } from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusLib } from 'lib';


export class PDFPlusModal extends Modal {
    plugin: PDFPlus;
    lib: PDFPlusLib;
    component: Component;

    constructor(plugin: PDFPlus) {
        super(plugin.app);
        this.plugin = plugin;
        this.lib = plugin.lib;
        this.component = new Component();
        this.contentEl.addClass('pdf-plus-modal');
    }

    protected reportError = (error: unknown) => {
        console.error(`${this.plugin.manifest.name}: Modal operation failed`, error);
        new Notice(`${this.plugin.manifest.name}: ${error instanceof Error ? error.message : String(error)}`);
    };

    protected handleAsync<Args extends unknown[]>(callback: (...args: Args) => Promise<unknown>) {
        return (...args: Args): void => {
            callback(...args).catch(this.reportError);
        };
    }

    onOpen() {
        this.component.load();
    }

    onClose() {
        this.contentEl.empty();
        this.component.unload();
    }
}
