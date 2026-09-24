import { useCallback, useRef } from 'react'
import { BookmarkPlus, Bookmark, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
  /** The message scroller; wheel events over the gutter are forwarded to it. */
  scrollElement: HTMLDivElement | null
  /** Rerender signal: markers reposition when the virtualized content size changes. */
  totalSize: number
}

/**
 * Thin interactive strip along the right edge of the message list (a minimap
 * of the conversation). Right-click a spot on the strip → tag that point in
 * the conversation (randomly colored). Markers render proportionally to
 * their location; click jumps back; right-click a marker → go to / delete.
 *
 * Sits at right-[12px] to stay clear of the 12px scrollbar hit area
 * (globals.css), and forwards wheel events to the scroller since it overlays
 * it as a sibling.
 */
export function ScrollTagGutter({
  sessionId,
  listRef,
  scrollElement,
  totalSize: _totalSize
}: ScrollTagGutterProps): React.JSX.Element {
  const tags = useScrollTagStore((s) => s.tagsBySession[sessionId]) ?? EMPTY_TAGS
  const addTag = useScrollTagStore((s) => s.addTag)
  const removeTag = useScrollTagStore((s) => s.removeTag)

  const containerRef = useRef<HTMLDivElement>(null)
  // Fraction of the gutter height where the user right-clicked, captured
  // before Radix opens the context menu.
  const pendingFractionRef = useRef(0)

  const handleStripContextMenu = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.height <= 0) return
    pendingFractionRef.current = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
  }, [])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      scrollElement?.scrollBy({ top: e.deltaY, left: e.deltaX })
    },
    [scrollElement]
  )

  const handleAddTag = useCallback(() => {
    const anchor = listRef.current?.captureAnchorAtFraction(pendingFractionRef.current)
    if (!anchor) {
      toast.error('Could not tag this spot')
      return
    }
    addTag(sessionId, {
      id: crypto.randomUUID(),
      color: generateScrollTagColor(new Set(tags.map((t) => t.color))),
      anchor,
      fractionHint: listRef.current?.getAnchorFraction(anchor) ?? pendingFractionRef.current,
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
      ref={containerRef}
      className="absolute top-0 bottom-0 right-[12px] w-2.5 z-10"
      onWheel={handleWheel}
      data-testid="scroll-tag-gutter"
    >
      {/* Strip: right-click a spot to tag that point in the conversation */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="h-full w-full" onContextMenu={handleStripContextMenu} />
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
                  'absolute left-0 right-0 h-1.5 -translate-y-1/2 rounded-sm transition-opacity',
                  stale
                    ? 'opacity-40 cursor-default'
                    : 'opacity-70 hover:opacity-100 cursor-pointer'
                )}
                style={{
                  top: `${((fraction ?? tag.fractionHint) * 100).toFixed(2)}%`,
                  backgroundColor: tag.color
                }}
                onClick={() => {
                  if (!stale) jumpTo(tag)
                }}
                aria-label={stale ? 'Scroll tag (unavailable)' : 'Scroll tag'}
                data-testid="scroll-tag-marker"
              />
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => jumpTo(tag)} disabled={stale} className="gap-2">
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
