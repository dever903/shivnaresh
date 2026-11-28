import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export interface MarkdownRendererProps {
  content: string;
  isLight?: boolean;
  className?: string;
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  );
}

function CodeBlock({
  code,
  language,
  isLight,
}: {
  code: string;
  language: string;
  isLight: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable in non-HTTPS contexts
    }
  };

  return (
    <div
      className={`my-3 overflow-hidden rounded-xl border ${
        isLight
          ? 'border-stone-200 bg-stone-50 text-stone-800'
          : 'border-white/10 bg-[#0b0d10] text-zinc-100'
      }`}
    >
      <div
        className={`flex items-center justify-between border-b px-3.5 py-1.5 text-xs ${
          isLight
            ? 'border-stone-200 bg-stone-100/80 text-stone-600'
            : 'border-white/10 bg-white/[0.03] text-zinc-400'
        }`}
      >
        <span className="font-mono text-[11px] uppercase tracking-wider">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
            isLight
              ? 'hover:bg-stone-200/80 text-stone-700'
              : 'hover:bg-white/10 text-zinc-300'
          }`}
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-[13px] leading-relaxed">
        <code className="font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string, isLight: boolean, keyPrefix: string): React.ReactNode[] {
  // Tokenizes inline code, links, bold+italic, bold, italic, and bare URLs
  const pattern =
    /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|https?:\/\/[^\s<)]+)/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${idx++}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={key}
          className={`rounded px-1.5 py-0.5 font-mono text-[0.875em] ${
            isLight
              ? 'bg-stone-200/80 text-stone-900'
              : 'bg-white/10 text-amber-200'
          }`}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch && isSafeUrl(linkMatch[2])) {
        nodes.push(
          <a
            key={key}
            href={linkMatch[2].trim()}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline underline-offset-2 transition-colors ${
              isLight
                ? 'text-amber-700 hover:text-amber-900'
                : 'text-amber-300 hover:text-amber-200'
            }`}
          >
            {renderInline(linkMatch[1], isLight, `${key}-lnk`)}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('***') && token.endsWith('***')) {
      nodes.push(
        <strong key={key} className="font-semibold italic">
          {renderInline(token.slice(3, -3), isLight, `${key}-bi`)}
        </strong>,
      );
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {renderInline(token.slice(2, -2), isLight, `${key}-b`)}
        </strong>,
      );
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      nodes.push(
        <em key={key} className="italic">
          {renderInline(token.slice(1, -1), isLight, `${key}-i`)}
        </em>,
      );
    } else if (/^https?:\/\//.test(token)) {
      nodes.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className={`break-all underline underline-offset-2 transition-colors ${
            isLight
              ? 'text-amber-700 hover:text-amber-900'
              : 'text-amber-300 hover:text-amber-200'
          }`}
        >
          {token}
        </a>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  const cells = parseTableRow(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isLight = false,
  className = '',
}) => {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  const headingColor = isLight ? 'text-stone-900' : 'text-zinc-50';
  const bodyColor = isLight ? 'text-stone-800' : 'text-zinc-200';
  const mutedColor = isLight ? 'text-stone-600' : 'text-zinc-400';

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    const fenceMatch = /^```([^\s`]*)\s*$/.exec(line.trim());
    if (fenceMatch) {
      const lang = fenceMatch[1] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing ```
      blocks.push(
        <CodeBlock
          key={`code-${i}`}
          code={codeLines.join('\n')}
          language={lang}
          isLight={isLight}
        />,
      );
      continue;
    }

    // Headings (#, ##, ###, ####)
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const key = `h-${i}`;
      if (level === 1) {
        blocks.push(
          <h1 key={key} className={`mt-4 mb-2 text-xl font-bold tracking-tight ${headingColor}`}>
            {renderInline(text, isLight, key)}
          </h1>,
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={key} className={`mt-3.5 mb-1.5 text-lg font-semibold tracking-tight ${headingColor}`}>
            {renderInline(text, isLight, key)}
          </h2>,
        );
      } else if (level === 3) {
        blocks.push(
          <h3 key={key} className={`mt-3 mb-1 text-base font-semibold ${headingColor}`}>
            {renderInline(text, isLight, key)}
          </h3>,
        );
      } else {
        blocks.push(
          <h4 key={key} className={`mt-2.5 mb-1 text-sm font-semibold ${headingColor}`}>
            {renderInline(text, isLight, key)}
          </h4>,
        );
      }
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(
        <hr
          key={`hr-${i}`}
          className={`my-3 border-t ${isLight ? 'border-stone-200' : 'border-white/10'}`}
        />,
      );
      i++;
      continue;
    }

    // Markdown table
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push(
        <div
          key={`tbl-${i}`}
          className={`my-3 overflow-x-auto rounded-xl border ${
            isLight ? 'border-stone-200' : 'border-white/10'
          }`}
        >
          <table className="w-full border-collapse text-left text-sm">
            <thead
              className={
                isLight ? 'bg-stone-100 text-stone-800' : 'bg-white/[0.04] text-zinc-200'
              }
            >
              <tr>
                {headers.map((h, colIdx) => (
                  <th
                    key={colIdx}
                    className={`border-b px-3 py-2 font-semibold ${
                      isLight ? 'border-stone-200' : 'border-white/10'
                    }`}
                  >
                    {renderInline(h, isLight, `th-${i}-${colIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={bodyColor}>
              {rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={
                    isLight
                      ? 'border-b border-stone-100 last:border-b-0 odd:bg-white even:bg-stone-50/50'
                      : 'border-b border-white/5 last:border-b-0 odd:bg-transparent even:bg-white/[0.015]'
                  }
                >
                  {headers.map((_, colIdx) => (
                    <td key={colIdx} className="px-3 py-2 align-top">
                      {renderInline(row[colIdx] ?? '', isLight, `td-${i}-${rowIdx}-${colIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className={`my-2.5 border-l-2 pl-3.5 italic ${
            isLight
              ? 'border-amber-600/60 text-stone-700'
              : 'border-amber-400/60 text-zinc-300'
          }`}
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx} className="leading-relaxed">
              {renderInline(ql, isLight, `bq-${i}-${qIdx}`)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className={`my-2 list-disc space-y-1 pl-5 ${bodyColor}`}>
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item, isLight, `ul-${i}-${idx}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} className={`my-2 list-decimal space-y-1 pl-5 ${bodyColor}`}>
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item, isLight, `ol-${i}-${idx}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph (collect consecutive non-block lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^#{1,4}\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith('>') &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    blocks.push(
      <p key={`p-${i}`} className={`my-2 leading-relaxed ${bodyColor}`}>
        {renderInline(paraLines.join(' '), isLight, `p-${i}`)}
      </p>,
    );
  }

  return (
    <div className={`text-sm leading-relaxed break-words ${mutedColor} ${className}`}>
      {blocks}
    </div>
  );
};

export default MarkdownRenderer;
