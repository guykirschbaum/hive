import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Anchor for a scroll tag — structurally identical to
 * VirtualizedMessageListViewportAnchor so tags can be passed straight to
 * restoreViewportAnchor().
 */
export interface ScrollTagAnchor {
  itemKey: string
  offsetWithinItem: number
  fallbackScrollTop: number
  fallbackScrollHeight: number
}

export interface ScrollTag {
  id: string
  /** Hex color from SCROLL_TAG_COLORS, assigned at creation. */
  color: string
  anchor: ScrollTagAnchor
  /** 0..1 fraction of the conversation at creation time; render fallback when the anchor is unresolvable. */
  fractionHint: number
  createdAt: number
}

export const MAX_TAGS_PER_SESSION = 50

interface ScrollTagState {
  tagsBySession: Record<string, ScrollTag[]>
  addTag: (sessionId: string, tag: ScrollTag) => void
  removeTag: (sessionId: string, tagId: string) => void
}

export const useScrollTagStore = create<ScrollTagState>()(
  persist(
    (set) => ({
      tagsBySession: {},

      addTag: (sessionId, tag) =>
        set((state) => {
          const existing = state.tagsBySession[sessionId] ?? []
          const next = [...existing, tag]
          // Cap per session: drop oldest first.
          while (next.length > MAX_TAGS_PER_SESSION) next.shift()
          return { tagsBySession: { ...state.tagsBySession, [sessionId]: next } }
        }),

      removeTag: (sessionId, tagId) =>
        set((state) => {
          const existing = state.tagsBySession[sessionId]
          if (!existing) return state
          const next = existing.filter((t) => t.id !== tagId)
          const tagsBySession = { ...state.tagsBySession }
          if (next.length === 0) {
            delete tagsBySession[sessionId]
          } else {
            tagsBySession[sessionId] = next
          }
          return { tagsBySession }
        })
    }),
    {
      name: 'hive-scroll-tags',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ tagsBySession: state.tagsBySession })
    }
  )
)
