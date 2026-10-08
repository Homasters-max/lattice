// The types of scripts/paths.mjs for the tests that import it.
export type PathClass = "design" | "code" | "generated" | "tests" | "config" | "conventions" | "task" | "text";
export declare function classOf(path: string): PathClass;
export declare const ST_BY_CLASS: { readonly [cls: string]: readonly string[] };
export declare const FITNESS: readonly string[];
export declare function isTool(path: string): boolean;
export declare function testSetOf(path: string): string | null;
export declare function ownedRoots(set: string): readonly string[];
export declare function owns(set: string, path: string): boolean;
