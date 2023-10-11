import * as vscode from 'vscode';
import { Row, TabularResult } from './driver';

export function resultToMarkdownTable(result: TabularResult): string {
  if (result.length < 1) {
    return '*Empty Results Table*';
  }

  const maxRows = getMaxRows();
  if (result.length > maxRows) {
    result = result.slice(0, maxRows);
    result.push(
      Object.fromEntries(Object.entries(result).map((pair) => [pair[0], '...']))
    );
  }
  return `${markdownHeader(result[0])}\n${result.map(markdownRow).join('\n')}`;
}

function getMaxRows(): number {
  const fallbackMaxRows = 25;
  const maxRows: number | undefined = vscode.workspace
    .getConfiguration('SQLNotebook')
    .get('maxResultRows');
  return maxRows ?? fallbackMaxRows;
}

function serializeCell(a: any): any {
  try {
    // serialize buffers as hex strings
    if (Buffer.isBuffer(a)) {
      return `0x${a.toString('hex')}`;
    }
    // attempt to serialize all remaining "object" values as JSON
    if (typeof a === 'object') {
      return JSON.stringify(a);
    }
    if (typeof a === 'string') {
      return a.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    }
    return a;
  } catch {
    return a;
  }
}

function markdownRow(row: Row): string {
  const middle = Object.entries(row)
    .map((pair) => pair[1])
    .map(serializeCell)
    .join(' | ');
  return `| ${middle} |`;
}

function markdownHeader(obj: Row): string {
  const keys = Object.keys(obj).join(' | ');
  const divider = Object.keys(obj)
    .map(() => '--')
    .join(' | ');
  return `| ${keys} |\n| ${divider} |`;
}
