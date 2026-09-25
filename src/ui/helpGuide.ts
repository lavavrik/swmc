/** Rendering `docs/agents.md` for the in-editor Help dialog. */
import { Marked } from 'marked'

export const HELP_PARAM = 'help'
export const HELP_AGENTS = 'agents'

/** GitHub's heading anchors: lowercase, punctuation dropped, spaces to hyphens. */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

export function renderGuide(markdown: string): string {
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }) {
        return `<h${depth} id="${headingId(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
      link({ href, title, tokens }) {
        const body = this.parser.parseInline(tokens)
        const titled = title ? ` title="${title}"` : ''
        if (href.startsWith('#')) return `<a href="${href}"${titled}>${body}</a>`
        return `<a href="${href}"${titled} target="_blank" rel="noreferrer">${body}</a>`
      },
    },
  })
  return marked.parse(markdown, { async: false })
}
