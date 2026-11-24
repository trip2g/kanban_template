import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
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

const mockUpdate = vi.mocked(updateNotes)

const SAMPLE = `---
kanban-plugin: basic
---

## To Do

- [ ] [[tasks/Проект/Задача один|Задача один]]
- [ ] Task 2


%% kanban:settings
\`\`\`
{"kanban-plugin":"basic"}
\`\`\`
%%`

const PATH = 'boards/demo.md'

function renderBoard() {
  return render(
    <Board
      path={PATH}
      content={SAMPLE}
      editable={true}
      links={{ 'tasks/Проект/Задача один': '/tasks/proekt/zadacha_odin' }}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mockUpdate.mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('undo delete', () => {
  test('a card link uses the server-resolved url', () => {
    renderBoard()
    const link = screen.getByText('Задача один') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/tasks/proekt/zadacha_odin')
  })

  test('delete hides the card, writes nothing until the window closes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderBoard()
    await user.click(screen.getAllByLabelText('Delete card')[1])

    expect(screen.queryByText('Task 2')).toBeNull()
    expect(screen.getByText('Card deleted')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(7000) })
    expect(mockUpdate).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const change = mockUpdate.mock.calls[0][0][0]
    expect(JSON.stringify(change)).toContain('Task 2')
    expect(screen.queryByText('Card deleted')).toBeNull()
    expect(screen.queryByText('Task 2')).toBeNull()
  })

  test('undo restores the card and never writes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderBoard()
    await user.click(screen.getAllByLabelText('Delete card')[1])
    await user.click(screen.getByText('Undo'))

    expect(screen.getByText('Task 2')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('a second delete commits the first one', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderBoard()
    await user.click(screen.getAllByLabelText('Delete card')[1])
    await user.click(screen.getAllByLabelText('Delete card')[0])
    await act(async () => { await vi.advanceTimersByTimeAsync(9000) })

    const sent = mockUpdate.mock.calls.map(c => JSON.stringify(c[0][0])).join('\n')
    expect(sent).toContain('Task 2')
    expect(sent).toContain('Задача один')
    expect(screen.queryByText('Task 2')).toBeNull()
    expect(screen.queryByText('Задача один')).toBeNull()
  })
})
