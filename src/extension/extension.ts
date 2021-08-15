import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';
import * as mysql from 'mysql2/promise';
import { OkPacket, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

const notebookType = 'sql-notebook';

let connPool: mysql.Pool | null = null;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer(
      notebookType,
      new SQLSerializer()
    )
  );
  context.subscriptions.push(new SQLNotebookController());
  vscode.commands.registerCommand('sqlnotebook.connect', async () => {
    const host = await vscode.window.showInputBox({
      title: 'Database Host',
      ignoreFocusOut: true,
    });
    const port = await vscode.window.showInputBox({
      title: 'Database Port',
      ignoreFocusOut: true,
    });
    const user = await vscode.window.showInputBox({
      title: 'Database User',
      ignoreFocusOut: true,
    });
    const password = await vscode.window.showInputBox({
      title: 'Database Password',
      ignoreFocusOut: true,
      password: true,
    });
    const database = await vscode.window.showInputBox({
      title: 'Database Name',
      ignoreFocusOut: true,
    });
    connPool = mysql.createPool({
      host,
      port: parseInt(port!),
      user,
      password: password || "",
      database,
    });
  });
}

interface RawConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function deactivate() {}

class SQLSerializer implements vscode.NotebookSerializer {
  async deserializeNotebook(
    context: Uint8Array,
    _token: vscode.CancellationToken
  ): Promise<vscode.NotebookData> {
    const str = new TextDecoder().decode(context);
    const cells = str.split('\n\n').map((query) => {
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
      data.cells.map(({ value }) => value).join('\n')
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
    connPool?.end();
  }

  private async doExecution(cell: vscode.NotebookCell): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now());

    // this is a sql block
    const rawQuery = cell.document.getText();
    if (!connPool) {
      writeErr(
        execution,
        'No active connection found. Run the \"Connect to database\" command.'
      );
      return;
    }
    const conn = await connPool.getConnection();
    execution.token.onCancellationRequested(() => {
      console.debug('got cancellation request');
      (async () => {
        // TODO: verify that this works properly
        conn.release();
        conn.end();
        conn.destroy();
        writeErr(execution, 'Query cancelled');
      })();
    });

    console.debug('executing query', { query: rawQuery });
    let result:
      | RowDataPacket[][]
      | RowDataPacket[]
      | OkPacket
      | OkPacket[]
      | ResultSetHeader;
    try {
      [result] = (await conn.query(rawQuery)) as any;
      console.debug('sql query completed');
      conn.release();
    } catch (err) {
      console.debug('sql query failed', err);
      writeErr(execution, err.message);
      conn.release();
      return;
    }

    if (result.constructor.name === 'ResultSetHeader') {
      const header = result as ResultSetHeader;
      writeSuccess(
        execution,
        `${markdownHeader(header)}\n${markdownRow(header)}`,
        'text/markdown'
      );
      return;
    }
    writeSuccess(
      execution,
      resultToMarkdownTable(result as mysql.RowDataPacket[]),
      'text/markdown'
    );
  }
}

const resultToMarkdownTable = (result: mysql.RowDataPacket[]): string => {
  if (result.length > 20) {
    result = result.slice(0, 20);
    result.push(
      Object.fromEntries(
        Object.entries(result).map((pair) => [pair[0], '...'])
      ) as any
    );
  }
  return `${markdownHeader(result[0])}\n${result
    .map((r) => markdownRow(r))
    .join('\n')}`;
};

const markdownRow = (row: any): string => {
  const middle = Object.entries(row)
    .map((pair) => pair[1] as string)
    .join(' | ');
  return `| ${middle} |`;
};

const markdownHeader = (obj: any): string => {
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
