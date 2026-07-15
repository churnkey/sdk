import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RichText } from '../../src/components/rich-text'

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/cancel-flow.css'), 'utf8')

describe('RichText', () => {
  let style: HTMLStyleElement

  beforeAll(() => {
    style = document.createElement('style')
    style.textContent = stylesheet
    document.head.append(style)
  })

  afterAll(() => style.remove())

  it('marks authored HTML as rich text while preserving consumer classes', () => {
    render(<RichText as="div" html="<p>Copy</p>" className="merchant-copy" />)

    const copy = screen.getByText('Copy').parentElement
    expect(copy).toHaveClass('ck-rich-text', 'merchant-copy')
  })

  it('restores semantic formatting inside the scoped reset', () => {
    const { container } = render(
      <div className="ck-cancel-flow">
        <RichText
          as="div"
          html={`
            <ul>
              <li><p><em>Italic copy</em></p></li>
              <li><p><strong>Bold copy</strong></p></li>
            </ul>
            <p><a href="https://example.com">Linked copy</a></p>
          `}
        />
      </div>,
    )

    const italic = screen.getByText('Italic copy')
    const bold = screen.getByText('Bold copy')
    const link = screen.getByRole('link', { name: 'Linked copy' })
    const list = container.querySelector('ul')!
    const listItems = container.querySelectorAll('li')

    expect(getComputedStyle(italic).fontStyle).toBe('italic')
    expect(getComputedStyle(bold).fontWeight).toBe('700')
    expect(getComputedStyle(list).listStyleType).toBe('disc')
    expect(getComputedStyle(list).paddingInlineStart).toBe('1.1em')
    expect(getComputedStyle(list).marginTop).toBe('0px')
    expect(getComputedStyle(listItems[1]).marginTop).toBe('0px')
    expect(getComputedStyle(link).fontWeight).toBe('600')
    expect(getComputedStyle(link).textDecoration).toContain('underline')
  })
})
