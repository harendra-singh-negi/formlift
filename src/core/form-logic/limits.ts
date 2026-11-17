// Size limits the checks enforce, with their defaults.

/**
 * Size limits the validators enforce. Every one has a default; pass your own (all or some) to
 * validateFields / validateLayout / validateAnswers / checkAnswer and to FormEditor / FormFiller's `limits`.
 * Use the same values in the browser and on your server.
 */
export interface Limits {
  /** Fields in one form. Default 5000. */
  maxFields: number
  /** Pages in a layout. Default 1000. */
  maxPages: number
  /** Text / box / line items in a layout. Default 5000. */
  maxElements: number
  /** Characters in one text answer. Default 10000. */
  maxAnswerLength: number
  /** Characters of a signature saved as a PNG data URL. Default 300000. */
  maxSignatureChars: number
  /** Characters in one layout text item. Default 5000. */
  maxElementText: number
  /** Comments on one field. Default 200. */
  maxComments: number
}

export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  maxFields: 5000,
  maxPages: 1000,
  maxElements: 5000,
  maxAnswerLength: 10_000,
  maxSignatureChars: 300_000,
  maxElementText: 5000,
  maxComments: 200,
});

/** The defaults with your overrides applied. */
export const resolveLimits = (limits?: Partial<Limits>): Limits => ({ ...DEFAULT_LIMITS, ...limits });

/** @deprecated Use DEFAULT_LIMITS.maxFields; pass `limits` to change it. */
export const MAX_FIELDS = DEFAULT_LIMITS.maxFields;
/** @deprecated Use DEFAULT_LIMITS.maxSignatureChars; pass `limits` to change it. */
export const MAX_SIGNATURE_CHARS = DEFAULT_LIMITS.maxSignatureChars;
/** @deprecated Use DEFAULT_LIMITS.maxPages; pass `limits` to change it. */
export const MAX_PAGES = DEFAULT_LIMITS.maxPages;
/** @deprecated Use DEFAULT_LIMITS.maxElements; pass `limits` to change it. */
export const MAX_ELEMENTS = DEFAULT_LIMITS.maxElements;
