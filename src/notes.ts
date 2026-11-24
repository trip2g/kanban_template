import type { KanbanCard } from './format'

export interface NoteInfo {
  summary?: string
  priority?: string
  due?: string
  body?: string
}

export type NoteMap = Record<string, NoteInfo>

export type SortMode = 'order' | 'priority'

export const SORT_STORAGE_KEY = 'kanban-sort-mode'

const SUMMARY_LIMIT = 160

const PRIORITY_RANK: Record<string, number> = {
  высокий: 0,
  high: 0,
  средний: 1,
  medium: 1,
  низкий: 2,
  low: 2,
}

const NO_PRIORITY_RANK = 3

export function priorityRank(priority: string | undefined): number {
  const rank = PRIORITY_RANK[(priority ?? '').trim().toLowerCase()]
  return rank === undefined ? NO_PRIORITY_RANK : rank
}

export function priorityClass(priority: string | undefined): string {
  return ['high', 'medium', 'low', ''][priorityRank(priority)]
}

export function dueKey(due: string | undefined): string {
  const match = /\d{4}-\d{2}-\d{2}/.exec(due ?? '')
  return match ? match[0] : ''
}

function plainText(line: string): string {
  return line
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/^\s*(?:[-+*]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripFrontmatter(text: string): string {
  const match = /^\s*---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  return match ? text.slice(match[0].length) : text
}

function clip(text: string): string {
  if (text.length <= SUMMARY_LIMIT) return text
  return text.slice(0, SUMMARY_LIMIT - 1).replace(/\s+\S*$/, '') + '…'
}

export function firstSentence(body: string): string {
  const lines = stripFrontmatter(body).split(/\r?\n/)
  let paragraph = ''
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '' || /^#{1,6}\s/.test(line) || /^(?:---|\*\*\*|___)$/.test(line)) {
      if (paragraph) break
      continue
    }
    paragraph += (paragraph ? ' ' : '') + plainText(line)
  }
  const sentence = /^(.+?[.!?…])(?:\s|$)/.exec(paragraph)
  return clip(sentence ? sentence[1] : paragraph)
}

export function summaryOf(info: NoteInfo | undefined): string {
  if (!info) return ''
  const summary = (info.summary ?? '').trim()
  if (summary) return clip(summary)
  return firstSentence(info.body ?? '')
}

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/

export function cardTarget(text: string): string | null {
  const match = WIKILINK.exec(text)
  return match ? match[1] : null
}

export function cardLabel(text: string): string {
  const alias = /\[\[[^\]|]+\|([^\]]+)\]\]/.exec(text)
  if (alias) return alias[1]
  return plainText(text)
}

export function sortByPriority<T extends Pick<KanbanCard, 'text'>>(cards: T[], notes: NoteMap): T[] {
  const keyed = cards.map((card, index) => {
    const target = cardTarget(card.text)
    const info = target ? notes[target] : undefined
    return { card, index, rank: priorityRank(info?.priority), due: dueKey(info?.due) }
  })
  keyed.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.due !== b.due) {
      if (a.due === '') return 1
      if (b.due === '') return -1
      return a.due < b.due ? -1 : 1
    }
    return a.index - b.index
  })
  return keyed.map(item => item.card)
}

export function readSortMode(): SortMode {
  try {
    return window.localStorage.getItem(SORT_STORAGE_KEY) === 'priority' ? 'priority' : 'order'
  } catch (e) {
    return 'order'
  }
}

export function writeSortMode(mode: SortMode): void {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, mode)
  } catch (e) {
    return
  }
}
