import { MarkdownRenderChild, RGB } from 'obsidian';

import PDFPlus from 'main';
import { ColorPalette } from 'color-palette';
import { hexToRgb, isHexString, rgbStringToObject } from 'utils';
import { PDFPlusComponent } from 'lib/component';


function cssRgbComponents(color: string) {
	const rgb = hexToRgb(color);
	return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : 'var(--text-highlight-bg-rgb)';
}

export class DomManager extends PDFPlusComponent {
	styleEl: HTMLStyleElement;
	private documentStyles = new Map<Document, HTMLStyleElement>();

	constructor(plugin: PDFPlus) {
		super(plugin);
		const doc = plugin.app.workspace.containerEl.ownerDocument;
		this.styleEl = plugin.registerEl(doc.head.createEl('style', { attr: { id: 'pdf-plus-style' } }));
	}

	update() {
		this.unload();
		// reload only if parent is loaded
		this.plugin.removeChild(this);
		this.plugin.addChild(this);
	}

	registerEl<HTMLElementType extends HTMLElement>(el: HTMLElementType) {
		this.register(() => el.remove());
		return el;
	}

	onload() {
		this.plugin.trigger('update-dom');

		this.updateStyleEl();

		this.registerDocument(this.styleEl.ownerDocument);
		this.app.workspace.iterateAllLeaves((leaf) => this.registerDocument(leaf.containerEl.ownerDocument));
		this.registerEvent(this.app.workspace.on('window-open', (_, win) => this.registerDocument(win.document)));
		this.registerEvent(this.app.workspace.on('window-close', (_, win) => this.documentStyles.delete(win.document)));
		this.register(() => {
			for (const [doc, style] of this.documentStyles) {
				if (style !== this.styleEl) style.remove();
				doc.body.removeClass('pdf-plus-click-embed-to-open-link', 'pdf-plus-backlink-selection-highlight', 'pdf-plus-backlink-selection-underline');
			}
			this.documentStyles.clear();
		});

		this.app.workspace.trigger('css-change');
	}

	private registerDocument(doc: Document) {
		if (this.documentStyles.has(doc)) return;
		const style = doc === this.styleEl.ownerDocument ? this.styleEl : doc.head.createEl('style');
		if (style !== this.styleEl) {
			style.id = this.styleEl.id;
			style.textContent = this.styleEl.textContent;
		}
		this.documentStyles.set(doc, style);
		doc.body.toggleClass('pdf-plus-click-embed-to-open-link', this.settings.dblclickEmbedToOpenLink);
		doc.body.toggleClass('pdf-plus-backlink-selection-highlight', this.settings.selectionBacklinkVisualizeStyle === 'highlight');
		doc.body.toggleClass('pdf-plus-backlink-selection-underline', this.settings.selectionBacklinkVisualizeStyle === 'underline');
	}

	updateStyleEl() {
		const settings = this.plugin.settings;

		this.styleEl.textContent = Object.entries(settings.colors).map(([name, color]) => {
			return isHexString(color) ? [
				`.pdf-plus-backlink-highlight-layer .pdf-plus-backlink:not(.hovered-highlight)[data-highlight-color="${name.toLowerCase()}"],`,
				`.pdf-embed[data-highlight-color="${name.toLowerCase()}"] .textLayer .mod-focused {`,
				`    --pdf-plus-color: ${color};`,
				`    --pdf-plus-color-rgb: ${cssRgbComponents(color)};`,
				`    --pdf-plus-backlink-icon-color: ${color};`,
				`    --pdf-plus-rect-color: ${color};`,
				`    --pdf-plus-rect-color-rgb: ${cssRgbComponents(color)};`,
				`}`
			].join('\n') : '';
		}).join('\n');

		let defaultColor = settings.colors[settings.defaultColor];
		if (!defaultColor || !isHexString(defaultColor)) {
			defaultColor = 'rgb(var(--text-highlight-bg-rgb))';
		}
		this.styleEl.textContent += [
			`\n.pdf-plus-backlink-highlight-layer .pdf-plus-backlink:not(.hovered-highlight) {`,
			`    --pdf-plus-color: ${defaultColor};`,
			`    --pdf-plus-color-rgb: ${cssRgbComponents(defaultColor)};`,
			`    --pdf-plus-backlink-icon-color: ${defaultColor};`,
			`    --pdf-plus-rect-color: ${defaultColor};`,
			`    --pdf-plus-rect-color-rgb: ${cssRgbComponents(defaultColor)};`,
			`}`
		].join('\n');

		let backlinkHoverColor = settings.colors[settings.backlinkHoverColor];
		if (!backlinkHoverColor || !isHexString(backlinkHoverColor)) backlinkHoverColor = '#008000';
		this.styleEl.textContent += [
			`\n.pdf-plus-backlink-highlight-layer .pdf-plus-backlink.hovered-highlight {`,
			`	--pdf-plus-color: ${backlinkHoverColor};`,
			`	--pdf-plus-backlink-icon-color: ${backlinkHoverColor};`,
			`   --pdf-plus-rect-color: ${backlinkHoverColor};`,
			`   --pdf-plus-color-rgb: ${cssRgbComponents(backlinkHoverColor)};`,
			`   --pdf-plus-rect-color-rgb: ${cssRgbComponents(backlinkHoverColor)};`,
			`}`
		].join('\n');

		for (const [name, color] of Object.entries(settings.colors)) {
			if (!isHexString(color)) continue;

			this.styleEl.textContent += [
				`\n.${ColorPalette.CLS}-item[data-highlight-color="${name.toLowerCase()}"] > .${ColorPalette.CLS}-item-inner {`,
				`    background-color: ${color};`,
				`}`
			].join('\n');
		}

		this.styleEl.textContent += [
			`\n.${ColorPalette.CLS}-item:not([data-highlight-color]) > .${ColorPalette.CLS}-item-inner {`,
			`    background-color: transparent;`,
			`}`
		].join('\n');

		this.styleEl.textContent += [
			`\n.workspace-leaf.pdf-plus-link-opened.is-highlighted::before {`,
			`	opacity: ${settings.existingTabHighlightOpacity};`,
			`}`
		].join('\n');

		this.setCSSColorVariables();
		this.updateCalloutStyle();
	}

	updateCalloutStyle() {
		if (!this.plugin.settings.useCallout) return;

		const calloutType = this.plugin.settings.calloutType.toLowerCase();

		for (const colorName of Object.keys(this.plugin.settings.colors)) {
			const varName = this.toCSSVariableName(colorName) ?? '--pdf-plus-default-color-rgb';

			this.styleEl.textContent += [
				`\n.callout[data-callout="${calloutType}"][data-callout-metadata="${colorName.toLowerCase()}"] {`,
				`	--callout-color: var(${varName});`,
				`   background-color: rgba(var(--callout-color), var(--pdf-plus-highlight-opacity, 0.2))`,
				`}`
			].join('\n');
		}

		this.styleEl.textContent += [
			`\n.callout[data-callout="${calloutType}"] {`,
			`	--callout-color: var(--pdf-plus-default-color-rgb);`,
			`   background-color: rgba(var(--callout-color), var(--pdf-plus-highlight-opacity, 0.2))`,
			`}`
		].join('\n');

		const iconName = this.plugin.settings.calloutIcon;
		if (iconName) {
			this.styleEl.textContent += [
				`\n.callout[data-callout="${calloutType}"] {`,
				`   --callout-icon: lucide-${iconName};`,
				`}`
			].join('\n');
		} else {
			this.styleEl.textContent += [
				`\n.callout[data-callout="${calloutType}"] .callout-icon {`,
				`   display: none;`,
				`}`
			].join('\n');
		}
	}

	registerCalloutRenderer() {
		const calloutType = this.plugin.settings.calloutType.toLowerCase();

		this.plugin.registerMarkdownPostProcessor((el, ctx) => {
			for (const calloutEl of el.querySelectorAll<HTMLElement>(`.callout[data-callout="${calloutType}"][data-callout-metadata*=","]`)) {
				ctx.addChild(new PDFPlusCalloutRenderer(calloutEl));
			}
		});
	}

	setCSSColorVariables() {
		const settings = this.plugin.settings;

		for (const [colorName, hexColor] of Object.entries(settings.colors)) {
			const varName = this.toCSSVariableName(colorName);
			const rgbColor = hexToRgb(hexColor);
			if (varName !== null) {
				if (rgbColor !== null) {
					const { r, g, b } = rgbColor;
					this.styleEl.textContent += [
						`\nbody {`,
						`    ${varName}: ${r}, ${g}, ${b}`,
						`}`
					].join('\n');
				}
			}
		}

		let defaultColorSet = false;
		if (settings.defaultColor in settings.colors) {
			const varName = this.toCSSVariableName(settings.defaultColor);
			if (varName !== null) {
				this.styleEl.textContent += [
					`\nbody {`,
					`    --pdf-plus-default-color-rgb: var(${varName})`,
					`}`
				].join('\n');
				defaultColorSet = true;
			}
		}
		if (!defaultColorSet) {
			this.styleEl.textContent += [
				`\nbody {`,
				`    --pdf-plus-default-color-rgb: var(--text-highlight-bg-rgb)`,
				`}`
			].join('\n');
		}

		// let defaultColor = settings.colors[settings.defaultColor];
		// if (!defaultColor || !isHexString(defaultColor)) {
		// 	defaultColor = 'rgb(var(--text-highlight-bg-rgb))';
		// }
		// this.styleEl.textContent += [
		// 	`\n.pdf-plus-backlink-highlight-layer .pdf-plus-backlink:not(.hovered-highlight) {`,
		// 	`    background-color: ${defaultColor};`,
		// 	`}`
		// ].join('\n');
	}

	toCSSVariableName(colorName: string): string | null {
		// extract alphanumeric parts from colorName, and then concatenate them with '-'
		let encoded = colorName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
		// strip leading and trailing '-'
		encoded = encoded.replace(/^-+|-+$/g, '');
		return encoded ? '--pdf-plus-' + encoded + '-rgb' : null;
	}

	getRgb(colorName?: string): RGB {
		let colorVarName = '--pdf-plus-default-color-rgb';
		if (colorName) {
			const specificColorVarName = this.toCSSVariableName(colorName);
			if (specificColorVarName) {
				colorVarName = specificColorVarName;
			}
		}
		const rgbString = activeDocument.win.getComputedStyle(activeDocument.body).getPropertyValue(colorVarName); // "R, G, B"
		const rgbColor = rgbStringToObject(rgbString);
		return rgbColor;
	}
}

class PDFPlusCalloutRenderer extends MarkdownRenderChild {
	onload() {
		const metadata = this.containerEl.dataset.calloutMetadata;
		if (metadata) {
			const rgb = metadata.split(',').map((val) => parseInt(val));
			const isRgb = rgb.length === 3 && rgb.every((val) => 0 <= val && val <= 255);

			if (isRgb) {
				this.containerEl.style.setProperty('--callout-color', rgb.join(', '));
			}
		}
	}
}
