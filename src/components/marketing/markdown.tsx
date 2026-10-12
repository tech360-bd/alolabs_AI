'use client'

/**
 * Markdown — a small, dependency-free renderer for playbook content.
 *
 * Supports the subset the marketing playbooks actually use: h1–h4, paragraphs,
 * bullet and numbered lists, fenced code, blockquotes, tables, horizontal
 * rules, inline code, bold, italics and links. No HTML is ever injected.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-i${i++}`
    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('*')) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      )
    } else {
      const link = token.match(/\[([^\]]+)\]\(([^)]+)\)/)
      if (link) {
        nodes.push(
          <a
            key={key}
            href={link[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-600"
          >
            {link[1]}
          </a>,
        )
      }
    }
    last = pattern.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const blocks = React.useMemo(() => parse(content), [content])
  return <div className={cn('space-y-3 text-sm leading-relaxed text-slate-700', className)}>{blocks}</div>
}

function parse(src: string): React.ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    // Fenced code
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3)
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      i++
      out.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800"
        >
          <code data-lang={lang}>{buf.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // Headings
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const text = heading[2]
      const cls =
        level === 1
          ? 'mt-2 font-serif text-xl font-normal text-slate-900'
          : level === 2
            ? 'mt-6 border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-900'
            : 'mt-4 text-sm font-semibold text-slate-900'
      out.push(
        React.createElement(
          `h${Math.min(level + 1, 6)}`,
          { key: key++, className: cls },
          inline(text, `h${key}`),
        ),
      )
      i++
      continue
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push(<hr key={key++} className="border-slate-200" />)
      i++
      continue
    }

    // Table
    if (line.trim().startsWith('|') && lines[i + 1]?.includes('---')) {
      const header = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim())
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(
          lines[i]
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim()),
        )
        i++
      }
      out.push(
        <div key={key++} className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-50">
              <tr>
                {header.map((h, hi) => (
                  <th key={hi} className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                    {inline(h, `th${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="even:bg-slate-50/60">
                  {row.map((cell, ci) => (
                    <td key={ci} className="border-b border-slate-100 px-3 py-2 align-top text-slate-600">
                      {inline(cell, `td${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      out.push(
        <blockquote key={key++} className="border-l-2 border-slate-300 pl-3 italic text-slate-600">
          {inline(buf.join(' '), `bq${key}`)}
        </blockquote>,
      )
      continue
    }

    // Lists
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''))
        i++
        // continuation / nested lines are folded into the item text
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          items[items.length - 1] += ` ${lines[i].trim()}`
          i++
        }
      }
      const List = ordered ? 'ol' : 'ul'
      out.push(
        React.createElement(
          List,
          {
            key: key++,
            className: ordered
              ? 'ml-5 list-decimal space-y-1 marker:text-slate-400'
              : 'ml-5 list-disc space-y-1 marker:text-slate-400',
          },
          items.map((item, ii) => <li key={ii}>{inline(item, `li${key}-${ii}`)}</li>),
        ),
      )
      continue
    }

    // Paragraph
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|>|\s*([-*]|\d+\.)\s|\||\s*(-{3,}|\*{3,})\s*$)/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    out.push(
      <p key={key++} className="text-slate-700">
        {inline(buf.join(' '), `p${key}`)}
      </p>,
    )
  }

  return out
}

export default Markdown
