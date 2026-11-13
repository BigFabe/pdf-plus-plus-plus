import type { Rect } from 'typings';

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((item: unknown) => typeof item === 'number' && Number.isFinite(item));
}

export function isRect(value: unknown): value is Rect {
    return isNumberArray(value) && value.length === 4;
}

type QuadPoints = Float32Array | { x: number, y: number }[][];

function isQuadPoints(value: unknown): value is QuadPoints {
    return (value instanceof Float32Array && value.length % 8 === 0) || (Array.isArray(value) && value.every((quad: unknown) =>
        Array.isArray(quad) && quad.length === 4 && quad.every((point: unknown) =>
            isRecord(point) && typeof point.x === 'number' && Number.isFinite(point.x)
                && typeof point.y === 'number' && Number.isFinite(point.y)
        )
    ));
}

/** PDF.js exposes annotation payloads without types; validate the fields used by PDF++. */
export function readAnnotationData(value: unknown) {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.subtype !== 'string' || !isRect(value.rect)) {
        return null;
    }
    const color = value.color;
    const contentsObj = value.contentsObj;
    return {
        id: value.id,
        subtype: value.subtype,
        rect: value.rect,
        color: ((color instanceof Uint8ClampedArray || color instanceof Uint8Array || isNumberArray(color)) && color.length >= 3) ? color : null,
        quadPoints: isQuadPoints(value.quadPoints) ? value.quadPoints : null,
        contents: isRecord(contentsObj) && typeof contentsObj.str === 'string' ? contentsObj.str : undefined,
    };
}
