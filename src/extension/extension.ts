import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';
import * as mysql from 'mysql2/promise';
import * as yaml from 'yaml';
import { OkPacket, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

const notebookType = 'sql-notebook';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer(
      notebookType,
      new SQLSerializer()
    )
  );
  context.subscriptions.push(new SQLNotebookController());
}

export function deactivate() {}

class SQLSerializer implements vscode.NotebookSerializer {
  async deserializeNotebook(
    context: Uint8Array,
    _token: vscode.CancellationToken
  ): Promise<vscode.NotebookData> {
    const str = new TextDecoder().decode(context);
    let raw: RawNotebook;
    try {
      raw = JSON.parse(str);
    } catch {
      if (str.length > 0) {
        // if data exists in the sql file, we don't want to lose it,
        // so inject that existing sql into a new sql notebook cell
        raw = {
          cells: [
            new vscode.NotebookCellData(
              vscode.NotebookCellKind.Code,
              str,
              'sql'
            ),
          ],
        };
      } else {
        raw = {
          cells: [],
        };
      }
    }
    const cells = raw.cells.map((item) => {
      return new vscode.NotebookCellData(
        item.kind,
        item.value,
        item.languageId
      );
    });
    if (cells.length < 1) {
      cells.unshift(
        connectionCell({
          host: 'localhost',
          port: 3306,
          user: 'root',
          password: 'test',
          database: 'mysql',
        }),
        new vscode.NotebookCellData(
          vscode.NotebookCellKind.Code,
          'SELECT name FROM help_topic',
          'sql'
        )
      );
    }

    return new vscode.NotebookData(cells);
  }

  async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
  ): Promise<Uint8Array> {
    const cells: RawNotebookCell[] = data.cells.map(
      ({ value, kind, languageId }) => ({ kind, value, languageId })
    );
    const notebook: RawNotebook = {
      cells,
    };

    return new TextEncoder().encode(JSON.stringify(notebook));
  }
}

const connectionCell = (conn: RawConnectionConfig): vscode.NotebookCellData => {
  return new vscode.NotebookCellData(
    vscode.NotebookCellKind.Code,
    yaml.stringify(conn).trimEnd(),
    'yaml'
  );
};

interface RawNotebook {
  cells: RawNotebookCell[];
}

interface RawConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface RawNotebookCell {
  kind: vscode.NotebookCellKind;
  value: string;
  languageId: string;
}

class SQLNotebookController {
  readonly controllerId = 'sql-notebook-executor';
  readonly notebookType = notebookType;
  readonly label = 'SQL Notebook';
  readonly supportedLanguages = ['sql', 'yaml'];

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
    this.connPool = null;
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
    this.connPool?.end();
  }

  private connPool: mysql.Pool | null;
  private async createConnection({
    host,
    port,
    user,
    database,
    password,
  }: RawConnectionConfig) {
    this.connPool = mysql.createPool({
      host,
      port,
      user,
      database,
      password,
    });
  }

  private async doExecution(cell: vscode.NotebookCell): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now());

    // if the cell is json, attempt to connect with that spec
    if (cell.document.languageId === 'yaml') {
      const text = cell.document.getText();
      let spec: RawConnectionConfig;
      try {
        spec = yaml.parse(text);
        validateConnectionConfig(spec);
      } catch (err) {
        writeErr(execution, 'Invalid connection config: ' + err.message);
        return;
      }
      await this.createConnection(spec);
      try {
        const conn = await this.connPool?.getConnection();
        await conn?.ping();
      } catch (err) {
        this.connPool = null;
        writeErr(execution, err.message);
        return;
      }

      writeSuccess(execution, 'Connected to database');
      return;
    }

    // this is a sql block
    const rawQuery = cell.document.getText();
    if (!this.connPool) {
      writeErr(
        execution,
        'No active connection found. Connect to the database by executing a valid YAML config cell first.'
      );
      return;
    }
    const conn = await this.connPool.getConnection();
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

const validateConnectionConfig = (config: RawConnectionConfig) => {
  requireKey(config, 'database');
  requireKey(config, 'user');
  requireKey(config, 'password');
  requireKey(config, 'port');
  requireKey(config, 'host');
};

const requireKey = (obj: any, key: string) => {
  if (obj[key] === null || obj[key] === undefined) {
    throw new Error(`Missing required property "${key}"`);
  }
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
