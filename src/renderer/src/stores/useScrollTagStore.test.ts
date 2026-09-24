import { describe, it, expect, beforeEach } from 'vitest'
import {
  useScrollTagStore,
  MAX_TAGS_PER_SESSION,
  type ScrollTag
} from './useScrollTagStore'

function makeTag(overrides: Partial<ScrollTag> = {}): ScrollTag {
  return {
    id: overrides.id ?? `tag-${Math.random().toString(36).slice(2)}`,
    color: overrides.color ?? '#ef4444',
    anchor: overrides.anchor ?? {
      itemKey: 'message:msg_1',
      offsetWithinItem: 42,
      fallbackScrollTop: 1000,
      fallbackScrollHeight: 5000
    },
    fractionHint: overrides.fractionHint ?? 0.2,
    createdAt: overrides.createdAt ?? 1
  }
}

describe('useScrollTagStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useScrollTagStore.setState({ tagsBySession: {} })
  })

  it('adds a tag for a session', () => {
    const tag = makeTag()
    useScrollTagStore.getState().addTag('session-a', tag)
    expect(useScrollTagStore.getState().tagsBySession['session-a']).toEqual([tag])
  })

  it('keeps tags isolated per session', () => {
    const a = makeTag({ id: 'a' })
    const b = makeTag({ id: 'b' })
    useScrollTagStore.getState().addTag('session-a', a)
    useScrollTagStore.getState().addTag('session-b', b)
    expect(useScrollTagStore.getState().tagsBySession['session-a']).toEqual([a])
    expect(useScrollTagStore.getState().tagsBySession['session-b']).toEqual([b])
  })

  it('removes a tag by id', () => {
    const a = makeTag({ id: 'a' })
    const b = makeTag({ id: 'b' })
    useScrollTagStore.getState().addTag('session-a', a)
    useScrollTagStore.getState().addTag('session-a', b)
    useScrollTagStore.getState().removeTag('session-a', 'a')
    expect(useScrollTagStore.getState().tagsBySession['session-a']).toEqual([b])
  })

  it('deletes the session key when the last tag is removed', () => {
    const a = makeTag({ id: 'a' })
    useScrollTagStore.getState().addTag('session-a', a)
    useScrollTagStore.getState().removeTag('session-a', 'a')
    expect('session-a' in useScrollTagStore.getState().tagsBySession).toBe(false)
  })

  it('drops the oldest tag when exceeding the per-session cap', () => {
    for (let i = 0; i < MAX_TAGS_PER_SESSION; i++) {
      useScrollTagStore.getState().addTag('session-a', makeTag({ id: `t${i}`, createdAt: i }))
    }
    useScrollTagStore.getState().addTag('session-a', makeTag({ id: 'newest', createdAt: 999 }))
    const tags = useScrollTagStore.getState().tagsBySession['session-a']
    expect(tags).toHaveLength(MAX_TAGS_PER_SESSION)
    expect(tags.find((t) => t.id === 't0')).toBeUndefined()
    expect(tags[tags.length - 1].id).toBe('newest')
  })

  it('persists only tagsBySession under the hive-scroll-tags key', () => {
    useScrollTagStore.getState().addTag('session-a', makeTag({ id: 'a' }))
    const raw = localStorage.getItem('hive-scroll-tags')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    expect(Object.keys(parsed.state)).toEqual(['tagsBySession'])
    expect(parsed.state.tagsBySession['session-a'][0].id).toBe('a')
  })
})
