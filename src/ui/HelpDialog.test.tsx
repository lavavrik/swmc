import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HelpDialog } from './HelpDialog'
import { headingId, renderGuide } from './helpGuide'

describe('renderGuide', () => {
  it('gives headings the anchors the table of contents links to', () => {
    const html = renderGuide(
      '- [Install: hosted editor](#install-hosted-editor)\n\n## Install: hosted editor\n',
    )
    expect(html).toContain('<h2 id="install-hosted-editor">')
    expect(html).toContain('href="#install-hosted-editor"')
  })

  it('opens outside links in a new tab', () => {
    expect(renderGuide('[MCP](https://modelcontextprotocol.io)')).toContain(
      'target="_blank" rel="noreferrer"',
    )
  })

  it('slugs like GitHub', () => {
    expect(headingId('Tokens and security')).toBe('tokens-and-security')
    expect(headingId('Install: from a checkout')).toBe('install-from-a-checkout')
  })
})

describe('HelpDialog', () => {
  it('shows docs/agents.md and closes', () => {
    const onClose = vi.fn()
    render(<HelpDialog onClose={onClose} />)
    expect(screen.getByRole('heading', { name: 'Using swmc with an AI agent (MCP)' })).toBeTruthy()
    expect(screen.getAllByText(/claude mcp add swmc/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('has a target for every link in its table of contents', () => {
    const { container } = render(<HelpDialog onClose={() => {}} />)
    const anchors = [...container.querySelectorAll('a[href^="#"]')].map((a) =>
      a.getAttribute('href')!.slice(1),
    )
    expect(anchors.length).toBeGreaterThan(5)
    for (const id of anchors) expect(container.querySelector(`[id="${id}"]`), id).not.toBeNull()
  })
})
