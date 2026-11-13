//////////////////////////
// Typescript utilities //
//////////////////////////

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Inspired by https://stackoverflow.com/a/50851710/13613783
export type KeysOfType<Obj, Type> = NonNullable<{ [k in keyof Obj]: Obj[k] extends Type ? k : never }[keyof Obj]>;

/** Similar to Required<T>, but only makes the specified properties (Prop) required */
export type PropRequired<T, Prop extends keyof T> = T & Pick<Required<T>, Prop>;

/** 
 * Parameters<T> but for functions with multiple overloads
 * Thanks @derekrjones (https://github.com/microsoft/TypeScript/issues/32164#issuecomment-890824817)
 */
export type OverloadParameters<T extends FN> = TupleArrayUnion<filterUnknowns<_Params<T>>>;

type FN = (...args: unknown[]) => unknown;

// current typescript version infers 'unknown[]' for any additional overloads
// we can filter them out to get the correct result
type _Params<T> = T extends {
    (...args: infer A1): unknown;
    (...args: infer A2): unknown;
    (...args: infer A3): unknown;
    (...args: infer A4): unknown;
    (...args: infer A5): unknown;
    (...args: infer A6): unknown;
    (...args: infer A7): unknown;
    (...args: infer A8): unknown;
    (...args: infer A9): unknown;
    (...args: infer A10): unknown;
    (...args: infer A11): unknown;
    (...args: infer A12): unknown;
    (...args: infer A13): unknown;
    (...args: infer A14): unknown;
    (...args: infer A15): unknown;
    (...args: infer A16): unknown;
    (...args: infer A17): unknown;
    (...args: infer A18): unknown;
    (...args: infer A19): unknown;
    (...args: infer A20): unknown;
}
    ? [A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12, A13, A14, A15, A16, A17, A18, A19, A20]
    : never;

// type T1 = filterUnknowns<[unknown[], string[]]>; // [string[]]
type filterUnknowns<T> = T extends [infer A, ...infer Rest]
    ? unknown[] extends A
    ? filterUnknowns<Rest>
    : [A, ...filterUnknowns<Rest>]
    : T;

// type T1 = TupleArrayUnion<[[], [string], [string, number]]>; // [] | [string] | [string, number]
type TupleArrayUnion<A extends readonly unknown[][]> = A extends (infer T)[]
    ? T extends unknown[]
    ? T
    : []
    : [];
