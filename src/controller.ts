import * as vscode from 'vscode';
import { ExecutionResult, Row, TabularResult } from './driver';
import { globalConnPool, notebookType } from './main';

export class SQLNotebookController {
  readonly controllerId = 'sql-notebook-executor';
  readonly notebookType = notebookType;
  readonly label = 'SQL Notebook';
  readonly supportedLanguages = ['sql'];

  private readonly _controller: vscode.NotebookController;
  private _executionOrder = 0;

  constructor() {
    this._controller = vscode.notebooks.createNotebookController(
      this.controllerId,
      this.notebookType,
      this.label
    );

    this._controller.supportedLanguages = this.supportedLanguages;
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this._execute.bind(this);
  }

  private async _execute(
    cells: vscode.NotebookCell[],
    _notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController
  ): Promise<void> {
    for (let cell of cells) {
      // run each cell sequentially, awaiting its completion
      await this.doExecution(cell);
    }
  }

  dispose() {
    globalConnPool.pool?.end();
  }

  private async doExecution(cell: vscode.NotebookCell): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now());

    // this is a sql block
    const rawQuery = cell.document.getText();
    if (!globalConnPool.pool) {
      writeErr(
        execution,
        'No active connection found. Configure database connections in the SQL Notebook sidepanel.'
      );
      return;
    }
    const conn = await globalConnPool.pool.getConnection();
    execution.token.onCancellationRequested(() => {
      console.debug('got cancellation request');
      (async () => {
        conn.release();
        conn.destroy();
        writeErr(execution, 'Query cancelled');
      })();
    });

    console.debug('executing query', { query: rawQuery });
    let result: ExecutionResult;
    try {
      result = await conn.query(rawQuery);
      console.debug('sql query completed', result);
      conn.release();
    } catch (err) {
      console.debug('sql query failed', err);
      // @ts-ignore
      writeErr(execution, err.message);
      conn.release();
      return;
    }

    if (typeof result === 'string') {
      writeSuccess(execution, result);
      return;
    }

    if (
      result.length === 0 ||
      (result.length === 1 && result[0].length === 0)
    ) {
      writeSuccess(execution, 'Successfully executed query');
      return;
    }
    const tables = result.map(resultToMarkdownTable);
    writeSuccess(execution, tables, 'text/markdown');
  }
}

function writeErr(execution: vscode.NotebookCellExecution, err: string) {
  execution.replaceOutput([
    new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(err)]),
  ]);
  execution.end(false, Date.now());
}

function writeSuccess(
  execution: vscode.NotebookCellExecution,
  text: string | string[],
  mimeType?: string
) {
  const items = typeof text === 'string' ? [text] : text;
  execution.replaceOutput(
    items.map(
      (item) =>
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text(item, mimeType),
        ])
    )
  );
  execution.end(true, Date.now());
}

function resultToMarkdownTable(result: TabularResult): string {
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

function escapeNewline(a: string | number | null): string | number | null {
  if (typeof a === 'string') {
    return a.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }
  return a;
}

// attempt to serialize all remaining "object" values as JSON
function serializeNestedObjects(a: any): any {
  try {
    if (typeof a === 'object') {
      return JSON.stringify(a);
    }
  } finally {
    return a;
  }
}

// serialize buffers as hex strings
function serializeBinaryAsHex(a: any): any {
  try {
    if (Buffer.isBuffer(a)) {
      return `0x${a.toString('hex')}`;
    }
  } finally {
    return a;
  }
}

function markdownRow(row: Row): string {
  const middle = Object.entries(row)
    .map((pair) => pair[1])
    .map(serializeBinaryAsHex)
    .map(serializeNestedObjects)
    .map(escapeNewline)
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
