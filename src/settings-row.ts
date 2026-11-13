import type { Setting, SettingDefinitionRender } from 'obsidian';

/** Declare searchable metadata now; create controls only when Obsidian renders the row. */
export class PDFPlusSettingRow {
	name = '';
	desc?: string;
	aliases: string[] = [];
	visible?: () => boolean;
	rendered?: Setting;
	private callbacks: ((setting: Setting) => unknown)[] = [];

	setName(name: string): this {
		this.name = name;
		return this.then((setting) => setting.setName(name));
	}

	setDesc(desc: string | DocumentFragment): this {
		// Keep metadata separate: rendering a fragment consumes its child nodes.
		this.desc = typeof desc === 'string' ? desc : desc.textContent ?? '';
		const content = typeof desc === 'string' ? desc : Array.from(desc.childNodes);
		return this.then((setting) => {
			if (typeof content === 'string') setting.setDesc(content);
			else {
				const fragment = createFragment();
				fragment.append(...content);
				setting.setDesc(fragment);
			}
		});
	}

	setHeading(): this {
		return this.then((setting) => setting.setHeading());
	}

	setClass(cls: string): this {
		return this.then((setting) => setting.setClass(cls));
	}

	then(callback: (setting: Setting) => unknown): this {
		this.callbacks.push(callback);
		return this;
	}

	addText(callback: Parameters<Setting['addText']>[0]): this {
		return this.then((setting) => setting.addText(callback));
	}

	addTextArea(callback: Parameters<Setting['addTextArea']>[0]): this {
		return this.then((setting) => setting.addTextArea(callback));
	}

	addToggle(callback: Parameters<Setting['addToggle']>[0]): this {
		return this.then((setting) => setting.addToggle(callback));
	}

	addDropdown(callback: Parameters<Setting['addDropdown']>[0]): this {
		return this.then((setting) => setting.addDropdown(callback));
	}

	addSlider(callback: Parameters<Setting['addSlider']>[0]): this {
		return this.then((setting) => setting.addSlider(callback));
	}

	addColorPicker(callback: Parameters<Setting['addColorPicker']>[0]): this {
		return this.then((setting) => setting.addColorPicker(callback));
	}

	addButton(callback: Parameters<Setting['addButton']>[0]): this {
		return this.then((setting) => setting.addButton(callback));
	}

	addExtraButton(callback: Parameters<Setting['addExtraButton']>[0]): this {
		return this.then((setting) => setting.addExtraButton(callback));
	}

	getDefinition(): SettingDefinitionRender {
		return {
			name: this.name,
			desc: this.desc,
			aliases: this.aliases,
			searchable: Boolean(this.name || this.desc),
			visible: this.visible,
			render: (setting) => this.render(setting),
		};
	}

	render(setting: Setting): void {
		this.rendered = setting;
		for (const callback of this.callbacks) callback(setting);
	}
}
