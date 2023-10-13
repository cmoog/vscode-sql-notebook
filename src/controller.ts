import * as vscode from 'vscode';
import { ExecutionResult } from './driver';
import { globalConnPool, notebookType } from './main';
import { resultToMarkdownTable } from './markdown';

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
      writeSuccess(execution, [[text(result)]]);
      return;
    }

    if (
      result.length === 0 ||
      (result.length === 1 && result[0].length === 0)
    ) {
      writeSuccess(execution, [[text('Successfully executed query')]]);
      return;
    }

    writeSuccess(
      execution,
      result.map((item) => {
        const outputs = [text(resultToMarkdownTable(item), 'text/markdown')];
        if (outputJsonMimeType()) {
          outputs.push(json(item));
        }
        return outputs;
      })
    );
  }
}

function writeErr(execution: vscode.NotebookCellExecution, err: string) {
  execution.replaceOutput([
    new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(err)]),
  ]);
  execution.end(false, Date.now());
}

const { text, json } = vscode.NotebookCellOutputItem;

function writeSuccess(
  execution: vscode.NotebookCellExecution,
  outputs: vscode.NotebookCellOutputItem[][]
) {
  execution.replaceOutput(
    outputs.map((items) => new vscode.NotebookCellOutput(items))
  );
  execution.end(true, Date.now());
}

function outputJsonMimeType(): boolean {
  return (
    vscode.workspace.getConfiguration('SQLNotebook').get('outputJSON') ?? false
  );
}
