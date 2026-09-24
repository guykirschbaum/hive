// Pure helpers for scroll-tag anchoring in the virtualized message list.

export interface ScrollAnchor {
  itemKey: string
  offsetWithinItem: number
  fallbackScrollTop: number
  fallbackScrollHeight: number
}

export interface ItemMeasurement {
  key: string
  start: number
}

/**
 * Item keys that may disappear or be replaced: optimistic local messages,
 * streaming/queued messages, and transient banners/indicators. Tags must not
 * anchor to these.
 */
const EPHEMERAL_KEY_RE =
  /^(message:local-|streaming:|queued:|typing-indicator$|completion$|error-banner$|retry-banner$|revert-banner:)/

export function isEphemeralItemKey(key: string): boolean {
  return EPHEMERAL_KEY_RE.test(key)
}

/**
 * If the anchor points at an ephemeral item, walk backwards through the
 * measurements to the nearest stable item, recomputing the offset so the
 * absolute scroll position is preserved. Returns the anchor unchanged when it
 * is already stable or when no stable predecessor exists (fallback fields
 * still allow approximate restoration).
 */
export function stabilizeAnchor(
  anchor: ScrollAnchor,
  measurements: readonly ItemMeasurement[]
): ScrollAnchor {
  if (!isEphemeralItemKey(anchor.itemKey)) return anchor

  const idx = measurements.findIndex((m) => m.key === anchor.itemKey)
  for (let i = idx - 1; i >= 0; i--) {
    const m = measurements[i]
    if (!isEphemeralItemKey(m.key)) {
      return {
        ...anchor,
        itemKey: m.key,
        offsetWithinItem: Math.max(0, anchor.fallbackScrollTop - m.start)
      }
    }
  }
  return anchor
}

/**
 * Fraction (0..1) of the anchored position within the full virtualized
 * content, for positioning gutter markers. Null when the anchored item no
 * longer exists or the total size is not yet measured.
 */
export function computeAnchorFraction(
  anchor: ScrollAnchor,
  measurements: readonly ItemMeasurement[],
  totalSize: number
): number | null {
  if (totalSize <= 0) return null
  const m = measurements.find((mm) => mm.key === anchor.itemKey)
  if (!m) return null
  return Math.min(1, Math.max(0, (m.start + anchor.offsetWithinItem) / totalSize))
}
