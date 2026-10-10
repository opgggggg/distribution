import { OPEN_EXTENSIONS } from "./open-formats.generated";

/** Extensions supported by the registered native formats and import converters. */
export const OPEN_ACCEPT = OPEN_EXTENSIONS.map((extension) => `.${extension}`).join(",");
