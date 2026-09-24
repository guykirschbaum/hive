import { describe, it, expect } from 'vitest'
import {
  isEphemeralItemKey,
  stabilizeAnchor,
  computeAnchorFraction
} from '../scroll-tag-anchors'

const measurements = [
  { key: 'message:msg_1', start: 0 },
  { key: 'message:msg_2', start: 200 },
  { key: 'message:local-abc', start: 500 },
  { key: 'streaming:s1', start: 700 }
]

describe('isEphemeralItemKey', () => {
  it('flags optimistic and transient keys', () => {
    expect(isEphemeralItemKey('message:local-abc')).toBe(true)
    expect(isEphemeralItemKey('streaming:s1')).toBe(true)
    expect(isEphemeralItemKey('queued:q1')).toBe(true)
    expect(isEphemeralItemKey('typing-indicator')).toBe(true)
    expect(isEphemeralItemKey('completion')).toBe(true)
    expect(isEphemeralItemKey('error-banner')).toBe(true)
    expect(isEphemeralItemKey('retry-banner')).toBe(true)
    expect(isEphemeralItemKey('revert-banner:m1')).toBe(true)
  })

  it('accepts stable message keys', () => {
    expect(isEphemeralItemKey('message:msg_123')).toBe(false)
    expect(isEphemeralItemKey('bash-run1')).toBe(false)
  })
})

describe('stabilizeAnchor', () => {
  it('returns the anchor unchanged when already stable', () => {
    const anchor = {
      itemKey: 'message:msg_2',
      offsetWithinItem: 50,
      fallbackScrollTop: 250,
      fallbackScrollHeight: 1000
    }
    expect(stabilizeAnchor(anchor, measurements)).toEqual(anchor)
  })

  it('walks back to the nearest stable key, recomputing offset', () => {
    const anchor = {
      itemKey: 'message:local-abc',
      offsetWithinItem: 30,
      fallbackScrollTop: 530,
      fallbackScrollHeight: 1000
    }
    const stabilized = stabilizeAnchor(anchor, measurements)
    expect(stabilized.itemKey).toBe('message:msg_2')
    // scroll position 530, msg_2 starts at 200 → offset 330
    expect(stabilized.offsetWithinItem).toBe(330)
    expect(stabilized.fallbackScrollTop).toBe(530)
  })

  it('returns the anchor unchanged when no stable predecessor exists', () => {
    const allEphemeral = [
      { key: 'streaming:s1', start: 0 },
      { key: 'queued:q1', start: 100 }
    ]
    const anchor = {
      itemKey: 'queued:q1',
      offsetWithinItem: 10,
      fallbackScrollTop: 110,
      fallbackScrollHeight: 500
    }
    expect(stabilizeAnchor(anchor, allEphemeral)).toEqual(anchor)
  })
})

describe('computeAnchorFraction', () => {
  const anchor = {
    itemKey: 'message:msg_2',
    offsetWithinItem: 100,
    fallbackScrollTop: 300,
    fallbackScrollHeight: 1000
  }

  it('computes (start + offset) / totalSize', () => {
    expect(computeAnchorFraction(anchor, measurements, 1000)).toBe(0.3)
  })

  it('returns null when the key is missing', () => {
    expect(computeAnchorFraction({ ...anchor, itemKey: 'message:gone' }, measurements, 1000)).toBeNull()
  })

  it('returns null when total size is zero or negative', () => {
    expect(computeAnchorFraction(anchor, measurements, 0)).toBeNull()
  })

  it('clamps to [0, 1]', () => {
    expect(computeAnchorFraction({ ...anchor, offsetWithinItem: 5000 }, measurements, 1000)).toBe(1)
  })
})
