import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firstSentence, summaryOf, priorityRank, sortByPriority, cardTarget, cardLabel } from './notes'

test('summary frontmatter wins over the body', () => {
  assert.equal(summaryOf({ summary: 'Send the price to Kate.', body: 'Other text. More.' }), 'Send the price to Kate.')
})

test('first sentence of the body, skipping frontmatter and headings', () => {
  const body = '---\ntitle: "X"\n---\n\n# X\n\n## Источник\n\nТема 4, 23.11, ответ агента: цена не согласована. Второе предложение.\n'
  assert.equal(firstSentence(body), 'Тема 4, 23.11, ответ агента: цена не согласована.')
})

test('wikilinks and emphasis are flattened, long text is clipped', () => {
  assert.equal(firstSentence('Ask [[a/b|Kate]] about **price**.'), 'Ask Kate about price.')
  const long = 'word '.repeat(80)
  const out = firstSentence(long)
  assert.ok(out.length <= 160)
  assert.ok(out.endsWith('…'))
})

test('no summary and no body gives nothing', () => {
  assert.equal(summaryOf({}), '')
  assert.equal(summaryOf(undefined), '')
})

test('priority ranks: high, medium, low, missing last', () => {
  assert.deepEqual(['высокий', 'средний', 'низкий', '', undefined, 'x'].map(priorityRank), [0, 1, 2, 3, 3, 3])
})

test('sortByPriority orders by priority, then due, then original order', () => {
  const cards = [
    { text: '[[none1]]' },
    { text: '[[low]]' },
    { text: '[[highLate]]' },
    { text: '[[highEarly]]' },
    { text: '[[highNoDue]]' },
    { text: '[[mid]]' },
    { text: 'plain card' },
    { text: '[[none2]]' },
  ]
  const notes = {
    low: { priority: 'низкий' },
    highLate: { priority: 'высокий', due: '2026-11-30' },
    highEarly: { priority: 'высокий', due: '2026-11-24 00:00:00 +0000 UTC' },
    highNoDue: { priority: 'высокий' },
    mid: { priority: 'средний' },
  }
  const order = sortByPriority(cards, notes).map(c => c.text)
  assert.deepEqual(order, ['[[highEarly]]', '[[highLate]]', '[[highNoDue]]', '[[mid]]', '[[low]]', '[[none1]]', 'plain card', '[[none2]]'])
  assert.equal(cards[0].text, '[[none1]]')
})

test('cardTarget and cardLabel read the wikilink', () => {
  assert.equal(cardTarget('[[tasks/P/T|Title]] · **P**'), 'tasks/P/T')
  assert.equal(cardTarget('no link'), null)
  assert.equal(cardLabel('[[tasks/P/T|Title]] · **P**'), 'Title')
})
