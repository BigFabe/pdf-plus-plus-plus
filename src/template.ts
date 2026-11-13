import { App, FileView, getLinkpath, TFile } from 'obsidian';
import * as obsidian from 'obsidian';

import PDFPlus from 'main';
import { PDFPlusLib } from 'lib';


function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

interface DataviewAPI {
    pages(): unknown;
    array(value: unknown): unknown;
}

function isDataviewAPI(value: unknown): value is DataviewAPI {
    return isRecord(value) && typeof value.pages === 'function' && typeof value.array === 'function';
}

function isIterable(value: unknown): value is Iterable<unknown> {
    return typeof value === 'object' && value !== null
        && Symbol.iterator in value && typeof value[Symbol.iterator] === 'function';
}

function hasPathIncludes(value: unknown): value is { includes(path: string): boolean } {
    return isRecord(value) && typeof value.includes === 'function';
}

export class TemplateProcessor {
    constructor(public plugin: PDFPlus, public variables: Record<string, unknown>) { }

    setVariable(name: string, value: unknown) {
        this.variables[name] = value;
    }

    evalPart(expr: string): unknown {
        // User-configured templates intentionally support JavaScript and Obsidian APIs.
        // The generated function accepts the supplied variables; its result is untrusted until displayed.
        // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Trusted local templates are an explicitly documented scripting feature, not a sandbox.
        const evaluate = new Function(...Object.keys(this.variables), `return ${expr};`) as (...values: unknown[]) => unknown;
        const evaluated = evaluate(...Object.values(this.variables));
        if (evaluated === undefined) {
            throw Error(`The expression "${expr}" cannot be evaluated.`);
        }
        return evaluated;
    }

    evalTemplate(template: string): string {
        return template.replace(/{{(.*?)}}/g, (match: string, expr: string) => String(this.evalPart(expr)));
    }
}

export class PDFPlusTemplateProcessor extends TemplateProcessor {
    app: App;
    lib: PDFPlusLib;

    constructor(plugin: PDFPlus, variables: {
        file: TFile,
        page: number,
        pageLabel: string,
        pageCount: number,
        text: string,
        [key: string]: unknown,
    }) {
        const { app } = plugin;

        // colorName is an alias for color
        if ('colorName' in variables) {
            variables.color = variables.colorName;
        }

        super(plugin, {
            ...variables,
            app,
            obsidian,
            pdf: variables.file,
            folder: variables.file.parent,
            selection: variables.text,
        });

        this.app = app;
        this.lib = plugin.lib;

        const md = this.findMarkdownFileAssociatedToPDF(variables.file);
        const properties: unknown = (md && app.metadataCache.getFileCache(md)?.frontmatter) ?? {};
        this.setVariable('md', md);
        this.setVariable('properties', properties);

        const linkedFile = this.findLinkedFile(variables.file);
        const linkedFileProperties: unknown = (linkedFile && app.metadataCache.getFileCache(linkedFile)?.frontmatter) ?? {};
        this.setVariable('linkedFile', linkedFile);
        this.setVariable('linkedFileProperties', linkedFileProperties);

        const dv: unknown = app.plugins.plugins.dataview?.api;
        const quickAddApi: unknown = app.plugins.plugins.quickadd?.api;
        if (dv) this.setVariable('dv', dv);
        if (quickAddApi) this.setVariable('quickAddApi', quickAddApi);
    }

    findMarkdownFileAssociatedToPDF(pdf: TFile) {
        const app = this.plugin.app;
        const proxyMDs: TFile[] = [];

        const dv: unknown = app.plugins.plugins.dataview?.api;
        if (isDataviewAPI(dv)) {
            const pages = dv.pages();
            if (!isIterable(pages)) throw Error('Dataview returned an invalid page collection.');
            for (const page of pages) {
                if (!isRecord(page)) continue;
                const links = dv.array(page[this.plugin.settings.proxyMDProperty] ?? []);
                if (!isRecord(links) || !hasPathIncludes(links.path) || !links.path.includes(pdf.path)) continue;
                if (!isRecord(page.file) || typeof page.file.path !== 'string') continue;
                const file = app.vault.getAbstractFileByPath(page.file.path);
                if (file instanceof TFile) proxyMDs.push(file);
            }
        } else {
            const backlinks = app.metadataCache.getBacklinksForFile(pdf);
            for (const sourcePath of backlinks.keys()) {
                const cache = app.metadataCache.getCache(sourcePath);
                if (cache) {
                    const isProxyMD = cache.frontmatterLinks?.some((link) => {
                        if (link.key !== this.plugin.settings.proxyMDProperty
                            && !(new RegExp(`${this.plugin.settings.proxyMDProperty}.\\d+`).test(link.key))) {
                            return false;
                        }
                        const linkpath = getLinkpath(link.link);
                        const targetFile = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
                        return targetFile && targetFile.path === pdf.path;
                    });
                    if (isProxyMD) {
                        const proxyMD = app.vault.getAbstractFileByPath(sourcePath);
                        if (proxyMD instanceof TFile) proxyMDs.push(proxyMD);
                    }
                }
            }
        }

        if (proxyMDs.length > 1) {
            const msg = `Multiple markdown files are associated with this PDF file:\n${proxyMDs.map(file => '- ' + file.path).join('\n')}\nAborting.`;
            throw Error(msg);
        }

        return proxyMDs.first() ?? null;
    }

    findLinkedFile(pdf: TFile) {
        // find a file opened in a linked tab
        let linkedFile: TFile | null = null;
        const groupLeaves = this.lib.workspace.getActiveGroupLeaves();
        if (groupLeaves) {
            for (const leaf of groupLeaves) {
                if (leaf.view instanceof FileView && leaf.view.file && leaf.view.file !== pdf) {
                    linkedFile = leaf.view.file;
                    break;
                }
            }
        }
        return linkedFile;
    }
}
