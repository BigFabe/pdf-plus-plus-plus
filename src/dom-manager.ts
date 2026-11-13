import { MarkdownRenderChild, RGB, setIcon } from 'obsidian';

import PDFPlus from 'main';
import { hexToRgb, isHexString, rgbStringToObject } from 'utils';
import { PDFPlusComponent } from 'lib/component';


export class DomManager extends PDFPlusComponent {
	cssVariables: Record<string, string> = {};
	enabled = false;
	private colors = new Map<string, { color: string, rgb: string }>();
	private documentCleanups = new Map<Document, () => void>();
	private calloutIcons = new WeakMap<HTMLElement, { original: ChildNode[], applied: ChildNode | null }>();

	constructor(plugin: PDFPlus) {
		super(plugin);
	}

	update() {
		this.unload();
		this.plugin.removeChild(this);
		this.plugin.addChild(this);
	}

	onload() {
		this.enabled = true;
		this.setCSSColorVariables();
		this.registerDocument(this.app.workspace.containerEl.ownerDocument);
		this.app.workspace.iterateAllLeaves((leaf) => this.registerDocument(leaf.containerEl.ownerDocument));
		this.registerEvent(this.app.workspace.on('window-open', (_, win) => this.registerDocument(win.document)));
		this.registerEvent(this.app.workspace.on('window-close', (_, win) => {
			this.documentCleanups.get(win.document)?.();
			this.documentCleanups.delete(win.document);
		}));
		this.register(() => {
			this.enabled = false;
			for (const cleanup of this.documentCleanups.values()) cleanup();
			this.documentCleanups.clear();
		});

		this.plugin.trigger('update-dom');
		this.app.workspace.trigger('css-change');
	}

	private registerDocument(doc: Document) {
		if (this.documentCleanups.has(doc)) return;
		const previous = new Map<string, { value: string, priority: string }>();
		for (const [name, value] of Object.entries(this.cssVariables)) {
			previous.set(name, { value: doc.body.style.getPropertyValue(name), priority: doc.body.style.getPropertyPriority(name) });
			doc.body.style.setProperty(name, value);
		}
		doc.body.toggleClass('pdf-plus-click-embed-to-open-link', this.settings.dblclickEmbedToOpenLink);
		doc.body.toggleClass('pdf-plus-backlink-selection-highlight', this.settings.selectionBacklinkVisualizeStyle === 'highlight');
		doc.body.toggleClass('pdf-plus-backlink-selection-underline', this.settings.selectionBacklinkVisualizeStyle === 'underline');

		for (const el of doc.querySelectorAll<HTMLElement>('.pdf-plus-backlink[data-highlight-color], .pdf-embed[data-highlight-color]')) {
			this.applyHighlightColor(el);
		}
		for (const el of doc.querySelectorAll<HTMLElement>('.callout')) this.applyCalloutStyle(el);

		this.documentCleanups.set(doc, () => {
			for (const [name, { value, priority }] of previous) {
				if (value) doc.body.style.setProperty(name, value, priority);
				else doc.body.style.removeProperty(name);
			}
			doc.body.removeClass('pdf-plus-click-embed-to-open-link', 'pdf-plus-backlink-selection-highlight', 'pdf-plus-backlink-selection-underline');
			for (const el of doc.querySelectorAll<HTMLElement>('.pdf-plus-named-highlight')) this.clearHighlightColor(el);
			for (const el of doc.querySelectorAll<HTMLElement>('.pdf-plus-callout')) this.clearCalloutStyle(el);
		});
	}

	setCSSColorVariables() {
		this.colors.clear();
		this.cssVariables = {};
		for (const [name, color] of Object.entries(this.settings.colors)) {
			if (!isHexString(color)) continue;
			const rgb = hexToRgb(color);
			if (!rgb) continue;
			const components = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
			this.colors.set(name.toLowerCase(), { color, rgb: components });
			const variable = this.toCSSVariableName(name);
			if (variable) this.cssVariables[variable] = components;
		}
		const defaultColor = this.colors.get(this.settings.defaultColor.toLowerCase());
		const hoverColor = this.colors.get(this.settings.backlinkHoverColor.toLowerCase());
		Object.assign(this.cssVariables, {
			'--pdf-plus-default-color': defaultColor?.color ?? 'rgb(var(--text-highlight-bg-rgb))',
			'--pdf-plus-default-color-rgb': defaultColor?.rgb ?? 'var(--text-highlight-bg-rgb)',
			'--pdf-plus-hover-color': hoverColor?.color ?? '#008000',
			'--pdf-plus-hover-color-rgb': hoverColor?.rgb ?? '0, 128, 0',
			'--pdf-plus-existing-tab-highlight-opacity': String(this.settings.existingTabHighlightOpacity),
			'--pdf-plus-callout-icon': this.settings.calloutIcon ? `lucide-${this.settings.calloutIcon}` : 'none',
		});
	}

	applyHighlightColor(el: HTMLElement) {
		const color = this.colors.get(el.dataset.highlightColor?.toLowerCase() ?? '');
		if (!color) {
			this.clearHighlightColor(el);
			return;
		}
		el.addClass('pdf-plus-named-highlight');
		el.setCssProps({ '--pdf-plus-named-color': color.color, '--pdf-plus-named-color-rgb': color.rgb });
	}

	private clearHighlightColor(el: HTMLElement) {
		el.removeClass('pdf-plus-named-highlight');
		el.style.removeProperty('--pdf-plus-named-color');
		el.style.removeProperty('--pdf-plus-named-color-rgb');
	}

	applyCalloutStyle(el: HTMLElement) {
		if (!this.enabled) return;
		if (!this.settings.useCallout || el.dataset.callout !== this.settings.calloutType.toLowerCase()) {
			if (el.hasClass('pdf-plus-callout')) this.clearCalloutStyle(el);
			return;
		}
		el.addClass('pdf-plus-callout');
		el.toggleClass('pdf-plus-callout-no-icon', !this.settings.calloutIcon);
		const metadata = el.dataset.calloutMetadata ?? '';
		const namedColor = this.colors.get(metadata.toLowerCase());
		const colorVariable = this.toCSSVariableName(metadata);
		const components = metadata.split(',').map((value) => parseInt(value));
		const isRgb = components.length === 3 && components.every((value) => value >= 0 && value <= 255);
		el.style.setProperty('--pdf-plus-callout-color-rgb', isRgb ? components.join(', ')
			: namedColor && colorVariable ? `var(${colorVariable})` : 'var(--pdf-plus-default-color-rgb)');

		const iconEl = el.querySelector<HTMLElement>(':scope > .callout-title > .callout-icon');
		if (iconEl && this.settings.calloutIcon) {
			const previous = this.calloutIcons.get(iconEl);
			const original = previous && previous.applied === iconEl.firstChild ? previous.original : Array.from(iconEl.childNodes);
			setIcon(iconEl, `lucide-${this.settings.calloutIcon}`);
			this.calloutIcons.set(iconEl, { original, applied: iconEl.firstChild });
		}
	}

	clearCalloutStyle(el: HTMLElement) {
		el.removeClass('pdf-plus-callout', 'pdf-plus-callout-no-icon');
		el.style.removeProperty('--pdf-plus-callout-color-rgb');
		const iconEl = el.querySelector<HTMLElement>(':scope > .callout-title > .callout-icon');
		if (iconEl) {
			const previous = this.calloutIcons.get(iconEl);
			if (previous?.applied === iconEl.firstChild) iconEl.replaceChildren(...previous.original);
			this.calloutIcons.delete(iconEl);
		}
	}

	registerCalloutRenderer() {
		this.plugin.registerMarkdownPostProcessor((el, ctx) => {
			const callouts = Array.from(el.querySelectorAll<HTMLElement>('.callout'));
			if (el.matches('.callout')) callouts.unshift(el);
			for (const calloutEl of callouts) ctx.addChild(new PDFPlusCalloutRenderer(calloutEl, this));
		});
	}

	toCSSVariableName(colorName: string): string | null {
		const encoded = colorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
		return encoded ? '--pdf-plus-' + encoded + '-rgb' : null;
	}

	getRgb(colorName?: string): RGB {
		const colorVarName = (colorName && this.toCSSVariableName(colorName)) || '--pdf-plus-default-color-rgb';
		const rgbString = activeDocument.win.getComputedStyle(activeDocument.body).getPropertyValue(colorVarName);
		return rgbStringToObject(rgbString);
	}
}

class PDFPlusCalloutRenderer extends MarkdownRenderChild {
	constructor(el: HTMLElement, private manager: DomManager) {
		super(el);
	}

	onload() {
		const update = () => this.manager.applyCalloutStyle(this.containerEl);
		update();
		this.registerEvent(this.manager.plugin.on('update-dom', update));
		const observer = new MutationObserver(update);
		observer.observe(this.containerEl, { attributes: true, attributeFilter: ['data-callout', 'data-callout-metadata'] });
		this.register(() => {
			observer.disconnect();
			if (this.manager.enabled) this.manager.clearCalloutStyle(this.containerEl);
		});
	}
}
