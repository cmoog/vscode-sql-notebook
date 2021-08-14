import { TextDecoder, TextEncoder } from 'util';
import * as vscode from 'vscode';
import * as mysql from 'mysql2';
import * as yaml from 'yaml';
import { ResultSetHeader } from 'mysql2';

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
    if (cells.length < 1 || cells[0].languageId !== 'yaml') {
      cells.unshift(
        connectionCell({
          host: 'localhost',
          port: 3306,
          user: 'root',
          password: 'test',
          database: 'mysql',
        })
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
    yaml.stringify(conn),
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
    this.connection = null;
  }

  private _execute(
    cells: vscode.NotebookCell[],
    _notebook: vscode.NotebookDocument,
    _controller: vscode.NotebookController
  ): void {
    for (let cell of cells) {
      this._doExecution(cell);
    }
  }

  dispose() {}

  private connection: mysql.Connection | null;
  private createConnection({
    host,
    port,
    user,
    database,
    password,
  }: RawConnectionConfig) {
    this.connection = mysql.createConnection({
      host,
      port,
      user,
      database,
      password,
    });
  }

  private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
    const execution = this._controller.createNotebookCellExecution(cell);
    execution.executionOrder = ++this._executionOrder;
    execution.start(Date.now()); // Keep track of elapsed time to execute cell.

    // if the cell is json, attempt to connect with that spec
    if (cell.document.languageId === 'yaml') {
      const text = cell.document.getText();
      let spec: RawConnectionConfig;
      try {
        spec = yaml.parse(text);
        validateConnectionConfig(spec);
      } catch (err) {
        execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(
              'Invalid connection config: ' + err
            ),
          ]),
        ]);
        execution.end(false, Date.now());
        return;
      }
      this.createConnection(spec);
      this.connection?.ping((err) => {
        let msg: string;
        if (err) {
          msg = err.message;
          this.connection = null;
        } else {
          msg = 'Connected to database';
        }
        execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(msg),
          ]),
        ]);
        execution.end(!err, Date.now());
      });
      return;
    }

    // this is a sql block
    const rawQuery = cell.document.getText();
    if (!this.connection) {
      execution.replaceOutput([
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text(
            'No active connection found. Connect to the database by executing a valid YAML config cell first.'
          ),
        ]),
      ]);
      execution.end(false, Date.now());
      return;
    }
    this.connection!.query(rawQuery, (err, result) => {
      if (err) {
        execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(
              `Query failed\nMessage: ${err.message}\nCode: ${err.code}`
            ),
          ]),
        ]);
        execution.end(false, Date.now());
        return;
      }
      // for update/insert/create queries where no data is returned
      if (result.constructor.name === 'ResultSetHeader') {
        const header = result as ResultSetHeader;
        execution.replaceOutput([
          new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(
              '```yaml\n' + yaml.stringify(header) + '\n```',
              'text/markdown'
            ),
          ]),
        ]);
        execution.end(true, Date.now());
        return;
      }
      execution.replaceOutput([
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.text(
            resultToMarkdownTable(result as mysql.RowDataPacket[]),
            'text/markdown'
          ),
        ]),
      ]);
      execution.end(true, Date.now());
    });
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
  requireKey(config, "database");
  requireKey(config, "user");
  requireKey(config, "password");
  requireKey(config, "port");
  requireKey(config, "host");
};

const requireKey = (obj: any, key: string) => {
  if (!obj[key]) {
    throw new Error(`Missing required property "${key}"`);
  };
};
