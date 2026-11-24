import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

vi.mock('./api', async (importActual) => {
  const actual = await importActual<typeof import('./api')>()
  return {
    ...actual,
    sha256Base64: vi.fn(async () => 'TEST_HASH'),
    updateNotes: vi.fn(async () => ({ ok: true })),
    fetchNoteContent: vi.fn(async () => ({ error: 'fetchNoteContent not mocked' })),
    fetchLatestVersionId: vi.fn(async () => null),
    subscribeNoteChanges: vi.fn(),
  }
})

import Board from './Board'
import { updateNotes } from './api'
import { SORT_STORAGE_KEY } from './notes'

const mockUpdate = vi.mocked(updateNotes)

const SAMPLE = `---
kanban-plugin: basic
---

## To Do

- [ ] [[tasks/low|Low task]]
- [ ] [[tasks/none|No priority task]]
- [ ] [[tasks/high|High task]]
- [ ] [[tasks/mid|Mid task]]

## Done

- [ ] Plain card


%% kanban:settings
\`\`\`
{"kanban-plugin":"basic"}
\`\`\`
%%`

const LINKS = {
  'tasks/low': '/tasks/low',
  'tasks/none': '/tasks/none',
  'tasks/high': '/tasks/high',
  'tasks/mid': '/tasks/mid',
}

const NOTES = {
  'tasks/low': { summary: 'Low summary.', priority: 'низкий' },
  'tasks/none': { body: '---\ntitle: x\n---\n\n# x\n\nBody sentence here. Second one.' },
  'tasks/high': { summary: 'High summary.', priority: 'высокий', due: '2026-11-24' },
  'tasks/mid': { summary: 'Mid summary.', priority: 'средний' },
}

function renderBoard() {
  return render(<Board path="boards/demo.md" content={SAMPLE} editable={true} links={LINKS} notes={NOTES} />)
}

function titles(): string[] {
  return Array.from(document.querySelectorAll('.kanban-column:first-of-type .kanban-card-text')).map(
    el => el.textContent ?? '',
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  try { window.localStorage.clear() } catch (e) { /* storage unavailable */ }
})

afterEach(() => {
  cleanup()
})

describe('card summary', () => {
  test('summary frontmatter and first body sentence show under the title', () => {
    renderBoard()
    expect(screen.getByText('High summary.')).toBeTruthy()
    expect(screen.getByText('Body sentence here.')).toBeTruthy()
    expect(screen.queryByText('Second one.')).toBeNull()
  })

  test('priority label shows on the card', () => {
    renderBoard()
    expect(screen.getByText('высокий')).toBeTruthy()
  })
})

describe('note overlay', () => {
  test('a click on the card link opens the note in an iframe instead of navigating', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(screen.getByText('High task'))

    const frame = document.querySelector('iframe.kanban-overlay-frame') as HTMLIFrameElement
    expect(frame.getAttribute('src')).toBe('/tasks/high')
    const newTab = screen.getByText('Open in new tab') as HTMLAnchorElement
    expect(newTab.getAttribute('href')).toBe('/tasks/high')
    expect(newTab.getAttribute('target')).toBe('_blank')
  })

  test('a click on the summary opens the note too', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(screen.getByText('Mid summary.'))
    expect(document.querySelector('iframe.kanban-overlay-frame')?.getAttribute('src')).toBe('/tasks/mid')
  })

  test('ctrl-click keeps the browser default and opens no overlay', () => {
    renderBoard()
    const link = screen.getByText('High task')
    const notPrevented = fireEvent.click(link, { ctrlKey: true })
    expect(notPrevented).toBe(true)
    expect(document.querySelector('.kanban-overlay')).toBeNull()
  })

  test('close button and Escape close it', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(screen.getByText('High task'))
    await user.click(screen.getByLabelText('Close'))
    expect(document.querySelector('.kanban-overlay')).toBeNull()

    await user.click(screen.getByText('High task'))
    expect(document.querySelector('.kanban-overlay')).not.toBeNull()
    await user.keyboard('{Escape}')
    expect(document.querySelector('.kanban-overlay')).toBeNull()
  })
})

describe('sort by priority', () => {
  test('order is the default and the toggle sorts without writing', async () => {
    const user = userEvent.setup()
    renderBoard()
    expect(titles()[0]).toContain('Low task')

    await user.click(screen.getByText('By priority'))
    expect(titles().map(t => t.replace(/\s.*$/, '')).length).toBe(4)
    const order = titles().join('|')
    expect(order.indexOf('High task')).toBeLessThan(order.indexOf('Mid task'))
    expect(order.indexOf('Mid task')).toBeLessThan(order.indexOf('Low task'))
    expect(order.indexOf('Low task')).toBeLessThan(order.indexOf('No priority task'))
    expect(mockUpdate).not.toHaveBeenCalled()

    await user.click(screen.getByText('By order'))
    expect(titles()[0]).toContain('Low task')
  })

  test('the choice is remembered per viewer', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(screen.getByText('By priority'))
    expect(window.localStorage.getItem(SORT_STORAGE_KEY)).toBe('priority')

    cleanup()
    renderBoard()
    expect(titles()[0]).toContain('High task')
  })

  test('works when localStorage throws', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    renderBoard()
    await user.click(screen.getByText('By priority'))
    expect(titles()[0]).toContain('High task')
    spy.mockRestore()
    getSpy.mockRestore()
  })

  test('toggling a card while sorted patches the right card', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(screen.getByText('By priority'))
    const boxes = Array.from(document.querySelectorAll('.kanban-column:first-of-type .kanban-card-check'))
    await user.click(boxes[0] as HTMLElement)
    await new Promise(r => setTimeout(r, 700))
    expect(JSON.stringify(mockUpdate.mock.calls[0][0][0])).toContain('tasks/high')
  })
})
