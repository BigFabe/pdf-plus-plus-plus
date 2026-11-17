/*!
Copyright (c) 2022 Tinted Theming (https://github.com/tinted-theming)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
// Source: https://github.com/tinted-theming/schemes/tree/spec-0.11/base16
// Palette roles: base00 paper, base05 text, base08–base0E chromatic accents.
export interface PDFReadingPalette {
    background: string;
    foreground: string;
    accents: string[];
}
export interface PDFReadingTheme {
    name: string;
    light?: PDFReadingPalette;
    dark?: PDFReadingPalette;
}

export const PDF_THEMES = {
    classic: { name: 'Classic', light: { background: '#ffffff', foreground: '#000000', accents: [] }, dark: { background: '#202020', foreground: '#ffffff', accents: [] } },
    solarized: { name: 'Solarized',
        // solarized-light.yaml
        light: {"background": "#fdf6e3", "foreground": "#586e75", "accents": ["#dc322f", "#cb4b16", "#b58900", "#859900", "#2aa198", "#268bd2", "#6c71c4"]},
        // solarized-dark.yaml
        dark: {"background": "#002b36", "foreground": "#93a1a1", "accents": ["#dc322f", "#cb4b16", "#b58900", "#859900", "#2aa198", "#268bd2", "#6c71c4"]},
    },
    gruvbox: { name: 'Gruvbox Soft',
        // gruvbox-light-soft.yaml
        light: {"background": "#f2e5bc", "foreground": "#504945", "accents": ["#9d0006", "#af3a03", "#b57614", "#79740e", "#427b58", "#076678", "#8f3f71"]},
        // gruvbox-dark-soft.yaml
        dark: {"background": "#32302f", "foreground": "#d5c4a1", "accents": ["#fb4934", "#fe8019", "#fabd2f", "#b8bb26", "#8ec07c", "#83a598", "#d3869b"]},
    },
    dracula: { name: 'Dracula',
        // dracula.yaml
        dark: {"background": "#282a36", "foreground": "#f8f8f2", "accents": ["#ff5555", "#FFB86C", "#f1fa8c", "#50fa7b", "#8be9fd", "#bd93f9", "#ff79c6"]},
    },
    nord: { name: 'Nord',
        // nord.yaml
        dark: {"background": "#2E3440", "foreground": "#E5E9F0", "accents": ["#BF616A", "#D08770", "#EBCB8B", "#A3BE8C", "#88C0D0", "#81A1C1", "#B48EAD"]},
    },
} satisfies Record<string, PDFReadingTheme>;

export type PDFTheme = keyof typeof PDF_THEMES;

export function resolvePDFTheme(id: string, mode: 'light' | 'dark'): PDFTheme {
    // Replace the earlier approximate palettes with their closest sourced family.
    if (id === 'logseq') id = 'solarized';
    if (id === 'sepia') id = 'gruvbox';
    return id in PDF_THEMES && (PDF_THEMES[id as PDFTheme] as PDFReadingTheme)[mode] ? id as PDFTheme : 'classic';
}

/** Only wraps this render's context; photos and other canvas users are untouched. */
export function themePDFContext(context: CanvasRenderingContext2D, palette: PDFReadingPalette): CanvasRenderingContext2D {
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const background = rgb(palette.background);
    const foreground = rgb(palette.foreground);
    const cache = new Map<string, string>();
    // PDF.js reads styles back when saving state; do not transform them twice.
    for (const color of [palette.background, palette.foreground, ...palette.accents]) cache.set(color.toLowerCase(), color);
    const mapColor = (color: string): string => {
        const key = color.toLowerCase();
        const cached = cache.get(key);
        if (cached) return cached;
        if (!/^#[0-9a-f]{6}$/.test(key)) return color;
        const channels = rgb(key);
        const high = Math.max(...channels), low = Math.min(...channels);
        let mapped: string;
        if (high - low < 24) {
            const weight = (channels[0] + channels[1] + channels[2]) / (3 * 255);
            mapped = '#' + foreground.map((value, i) => Math.round(value + weight * (background[i] - value)).toString(16).padStart(2, '0')).join('');
        } else {
            // Match color direction, independent of brightness, so dark blue links remain legible.
            const direction = channels.map((value) => (value - low) / (high - low));
            let distance = Infinity;
            mapped = palette.foreground;
            for (const accent of palette.accents) {
                const values = rgb(accent);
                const min = Math.min(...values), range = Math.max(...values) - min;
                const score = values.reduce((sum, value, i) => sum + ((value - min) / range - direction[i]) ** 2, 0);
                if (score < distance) { distance = score; mapped = accent; }
            }
        }
        cache.set(key, mapped);
        cache.set(mapped.toLowerCase(), mapped);
        return mapped;
    };
    const methods = new Map<PropertyKey, unknown>();
    return new Proxy(context, {
        get(target, key) {
            const value = Reflect.get(target, key, target);
            if (typeof value !== 'function') return value;
            if (!methods.has(key)) methods.set(key, value.bind(target));
            return methods.get(key);
        },
        set(target, key, value) {
            if ((key === 'fillStyle' || key === 'strokeStyle') && typeof value === 'string') value = mapColor(value);
            return Reflect.set(target, key, value, target);
        },
    });
}
