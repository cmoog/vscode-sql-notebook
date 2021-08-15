import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';
import * as mysql from 'mysql2/promise';
import { OkPacket, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  ConnData,
  ConnectionListItem,
  SQLNotebookConnections,
} from './connections';

const notebookType = 'sql-notebook';
export const storageKey = 'sqlnotebook-connections';

let connPool: mysql.Pool | null = null;

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
  context.subscriptions.push(new SQLNotebookController());

  vscode.commands.registerCommand(
    'sqlnotebook.deleteConnectionConfiguration',
    async (item: ConnectionListItem) => {
      const without = context.globalState
        .get<ConnData[]>(storageKey, [])
        .filter(({ name }) => name !== item.config.name);
      context.globalState.update(storageKey, without);
      connectionsSidepanel.refresh();
      vscode.window.showInformationMessage(
        `Successfully deleted connection configuration "${item.config.name}"`
      );
      connectionsSidepanel.refresh();
    }
  );

  vscode.commands.registerCommand(
    'sqlnotebook.addNewConnectionConfiguration',
    async () => {
      const displayName = await getUserInput('Database Display Name ', true);
      const host = await getUserInput('Database Host', true);
      const port = await getUserInput('Database Port', true);
      const user = await getUserInput('Database User', true);
      const password = await getUserInput('Database Password', false, {
        password: true,
      });
      const database = await getUserInput('Database Name', false);
      if (!displayName || !host || !port || !user) {
        vscode.window.showErrorMessage(
          `Invalid connection configuration: name, host, port, and user are required.`
        );
        return;
      }
      const config: ConnData = {
        name: displayName,
        database: database || '',
        host: host,
        user: user,
        passwordKey: password || '',
        port: parseInt(port),
      };
      const existing = context.globalState
        .get<ConnData[]>(storageKey, [])
        .filter(({ name }) => name !== displayName);
      existing.push(config);
      context.globalState.update(storageKey, existing);
      connectionsSidepanel.refresh();
    }
  );
  vscode.commands.registerCommand(
    'sqlnotebook.connect',
    async (item?: ConnectionListItem) => {
      let selectedName: string;
      if (!item) {
        const names = context.globalState
          .get(storageKey, [])
          .map(({ name }) => name);
        const namePicked = await vscode.window.showQuickPick(names, {
          ignoreFocusOut: true,
        });
        if (!namePicked) {
          vscode.window.showErrorMessage(`Invalid database connection name.`);
          return;
        }
        selectedName = namePicked;
      } else {
        selectedName = item.config.name;
      }
      const match = context.globalState
        .get<ConnData[]>(storageKey, [])
        .find(({ name }) => name === selectedName);
      if (!match) {
        vscode.window.showErrorMessage(
          `"${selectedName}" not found. Please add the connection config in the sidebar before connecting.`
        );
        return;
      }
      connPool = mysql.createPool({
        host: match.host,
        port: match.port,
        user: match.user,
        password: match.passwordKey,
        database: match.database,
      });
      try {
        const conn = await connPool.getConnection();
        await conn.ping();
        connectionsSidepanel.setActive(match.name);
        vscode.window.showInformationMessage(
          `Successfully connected to "${match.name}"`
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to connect to "${match.name}": ${err.message}`
        );
        connPool = null;
        connectionsSidepanel.setActive(null);
      }
    }
  );
}

export function deactivate() {}

class SQLSerializer implements vscode.NotebookSerializer {
  async deserializeNotebook(
    context: Uint8Array,
    _token: vscode.CancellationToken
  ): Promise<vscode.NotebookData> {
    const str = new TextDecoder().decode(context);
    const allBlocks = str.split('\n\n');
    const cells = allBlocks
      .filter((q) => q.trim().length > 0) // skip whitespace-only blocks
      .map((query) => {
        query = query.trim();
        const isMarkdown =
          query.startsWith('/*markdown') && query.endsWith('*/');
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
        'No active connection found. Configure database connections in the SQL Notebook sidepanel.'
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

const requiredValidator = (name: string) => (value: string) => {
  if (!value) {
    return `${name} is required`;
  }
  return undefined;
};

const getUserInput = async (
  name: string,
  required: boolean,
  options?: vscode.InputBoxOptions
) => {
  const value = await vscode.window.showInputBox({
    title: name,
    validateInput: required ? requiredValidator(name) : undefined,
    ignoreFocusOut: true,
    ...options,
  });
  return value;
};
