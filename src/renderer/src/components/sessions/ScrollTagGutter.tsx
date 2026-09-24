import { useCallback } from 'react'
import { BookmarkPlus, Bookmark, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem
} from '@/components/ui/context-menu'
import { useScrollTagStore, type ScrollTag } from '@/stores/useScrollTagStore'
import { generateScrollTagColor } from '@/lib/scroll-tag-colors'
import type { VirtualizedMessageListHandle } from './VirtualizedMessageList'

const EMPTY_TAGS: ScrollTag[] = []

interface ScrollTagGutterProps {
  sessionId: string
  listRef: React.RefObject<VirtualizedMessageListHandle | null>
  /** Rerender signal: markers reposition when the virtualized content size changes. */
  totalSize: number
}

/**
 * Thin interactive strip along the right edge of the message list.
 * Right-click empty strip → tag the current scroll position (randomly
 * colored). Markers render proportionally to their location; click jumps
 * back; right-click a marker → go to / delete.
 */
export function ScrollTagGutter({
  sessionId,
  listRef,
  totalSize: _totalSize
}: ScrollTagGutterProps): React.JSX.Element {
  const tags = useScrollTagStore((s) => s.tagsBySession[sessionId]) ?? EMPTY_TAGS
  const addTag = useScrollTagStore((s) => s.addTag)
  const removeTag = useScrollTagStore((s) => s.removeTag)

  const handleAddTag = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const anchor = list.captureStableViewportAnchor()
    if (!anchor) return
    addTag(sessionId, {
      id: crypto.randomUUID(),
      color: generateScrollTagColor(new Set(tags.map((t) => t.color))),
      anchor,
      fractionHint: list.getAnchorFraction(anchor) ?? 0,
      createdAt: Date.now()
    })
  }, [listRef, sessionId, tags, addTag])

  const jumpTo = useCallback(
    (tag: ScrollTag) => {
      listRef.current?.restoreViewportAnchor(tag.anchor)
    },
    [listRef]
  )

  return (
    <div
      className="absolute top-0 bottom-0 right-[6px] w-2.5 z-10"
      data-testid="scroll-tag-gutter"
    >
      {/* Strip: right-click empty area to add a tag at the current position */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="h-full w-full" />
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={handleAddTag} className="gap-2">
            <BookmarkPlus className="h-3.5 w-3.5" />
            Tag this spot
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Markers overlay the strip (siblings of the strip trigger, not children) */}
      {tags.map((tag) => {
        const fraction = listRef.current?.getAnchorFraction(tag.anchor) ?? null
        const stale = fraction == null
        return (
          <ContextMenu key={tag.id}>
            <ContextMenuTrigger asChild>
              <button
                className={cn(
                  'absolute left-0 right-0 h-1.5 -translate-y-1/2 rounded-sm cursor-pointer transition-opacity',
                  stale ? 'opacity-40 hover:opacity-60' : 'opacity-70 hover:opacity-100'
                )}
                style={{
                  top: `${((fraction ?? tag.fractionHint) * 100).toFixed(2)}%`,
                  backgroundColor: tag.color
                }}
                onClick={() => jumpTo(tag)}
                aria-label="Scroll tag"
                data-testid="scroll-tag-marker"
              />
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => jumpTo(tag)} className="gap-2">
                <Bookmark className="h-3.5 w-3.5" />
                Go to tag
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => removeTag(sessionId, tag.id)}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete tag
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </div>
  )
}
