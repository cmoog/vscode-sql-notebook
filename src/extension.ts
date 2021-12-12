import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';
import { SQLNotebookConnections } from './connections';
import { connectToDatabase, deleteConnectionConfiguration } from './commands';
import { Pool, QueryResult, ResultTable, Row } from './driver';
import { activateFormProvider } from './form';

const notebookType = 'sql-notebook';
export const storageKey = 'sqlnotebook-connections';

export const globalConnPool: { pool: Pool | null } = {
  pool: null,
};

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer(
      notebookType,
      new SQLSerializer()
    )
  );
  const connectionsSidepanel = new SQLNotebookConnections(context);
  vscode.window.registerTreeDataProvider(
    'sqlnotebook-connections',
    connectionsSidepanel
  );

  activateFormProvider(context);

  context.subscriptions.push(new SQLNotebookController());

  vscode.commands.registerCommand(
    'sqlnotebook.deleteConnectionConfiguration',
    deleteConnectionConfiguration(context, connectionsSidepanel)
  );

  vscode.commands.registerCommand('sqlnotebook.refreshConnectionPanel', () => {
    connectionsSidepanel.refresh();
  });
  vscode.commands.registerCommand(
    'sqlnotebook.connect',
    connectToDatabase(context, connectionsSidepanel)
  );
}

export function deactivate() {}

class SQLSerializer implements vscode.NotebookSerializer {
  async deserializeNotebook(
    context: Uint8Array,
    _token: vscode.CancellationToken
  ): Promise<vscode.NotebookData> {
    const str = new TextDecoder().decode(context);
    const blocks = splitSqlBlocks(str);

    const cells = blocks.map((query) => {
      const isMarkdown = query.startsWith('/*markdown') && query.endsWith('*/');
      if (isMarkdown) {
        const lines = query.split('\n');
        const innerMarkdown =
          lines.length > 2 ? lines.slice(1, lines.length - 1).join('\n') : '';
        return new vscode.NotebookCellData(
          vscode.NotebookCellKind.Markup,
          innerMarkdown,
          'markdown'
        );
      }

      return new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        query,
        'sql'
      );
    });
    return new vscode.NotebookData(cells);
  }

  async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Promise<Uint8Array> {
    return new TextEncoder().encode(
      data.cells
        .map(({ value, kind }) =>
          kind === vscode.NotebookCellKind.Code
            ? value
            : `/*markdown\n${value}\n*/`
        )
        .join('\n\n')
    );
  }
}

class SQLNotebookController {
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

  private _execute(
    cells: vscode.NotebookCell[],
    _notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController
  ): void {
    for (let cell of cells) {
      this.doExecution(cell);
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
    let result: QueryResult;
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

    if (!result.length) {
      writeSuccess(execution, 'Successfully executed query');
      return;
    }
    if (typeof result === 'string') {
      writeSuccess(execution, result);
      return;
    }
    writeSuccess(
      execution,
      resultToMarkdownTable(result),
      'text/markdown'
    );
  }
}

const resultToMarkdownTable = (result: ResultTable): string => {
  if (result.length > 20) {
    result = result.slice(0, 20);
    result.push(
      Object.fromEntries(Object.entries(result).map((pair) => [pair[0], '...']))
    );
  }
  return `${markdownHeader(result[0])}\n${result
    .map((r) => markdownRow(r))
    .join('\n')}`;
};

const escapeNewline = (a: string | number | null): string | number | null => {
  if (typeof a === 'string') {
    return a.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }
  return a;
};

const markdownRow = (row: Row): string => {
  const middle = Object.entries(row)
    .map((pair) => pair[1])
    .map(escapeNewline)
    .join(' | ');
  return `| ${middle} |`;
};

const markdownHeader = (obj: Row): string => {
  const keys = Object.keys(obj).join(' | ');
  const divider = Object.keys(obj)
    .map(() => '--')
    .join(' | ');
  return `| ${keys} |\n| ${divider} |`;
};

const writeErr = (execution: vscode.NotebookCellExecution, err: string) => {
  execution.replaceOutput([
    new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(err)]),
  ]);
  execution.end(false, Date.now());
};

const writeSuccess = (
  execution: vscode.NotebookCellExecution,
  text: string,
  mimeType?: string
) => {
  execution.replaceOutput([
    new vscode.NotebookCellOutput([
      vscode.NotebookCellOutputItem.text(text, mimeType),
    ]),
  ]);
  execution.end(true, Date.now());
};

const splitSqlBlocks = (raw: string): string[] => {
  const blocks = [];
  for (const block of raw.split('\n\n')) {
    if (block.trim().length > 0) {
      blocks.push(block);
      continue;
    }
    if (blocks.length < 1) {
      continue;
    }
    blocks[blocks.length - 1] += '\n\n';
  }
  return blocks;
};
