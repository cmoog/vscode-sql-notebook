import * as vscode from 'vscode';

export class SQLNotebookConnections
  implements vscode.TreeDataProvider<ConnectionListItem | vscode.TreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    ConnectionListItem | undefined | void
  > = new vscode.EventEmitter<ConnectionListItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    ConnectionListItem | undefined | void
  > = this._onDidChangeTreeData.event;

  constructor(public readonly context: vscode.ExtensionContext) {
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ConnectionListItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ConnectionListItem): Thenable<vscode.TreeItem[]> {
    if (element) {
      return Promise.resolve([
        new vscode.TreeItem(`host: ${element.config.host}`, vscode.TreeItemCollapsibleState.None),
        new vscode.TreeItem(`port: ${element.config.port}`, vscode.TreeItemCollapsibleState.None),
        new vscode.TreeItem(`user: ${element.config.user}`, vscode.TreeItemCollapsibleState.None),
        new vscode.TreeItem(`database: ${element.config.database}`, vscode.TreeItemCollapsibleState.None),
      ]);
    }
    const connections =
      this.context.globalState.get<ConnData[] | null>(
        'sqlnotebook-connections'
      ) ?? [];

    return Promise.resolve(
      connections.map(
        (config) =>
          new ConnectionListItem(
            config,
            vscode.TreeItemCollapsibleState.Collapsed
          )
      )
    );
  }
}

export interface ConnData {
  name: string;
  host: string;
  port: number;
  user: string;
  passwordKey: string;
  database: string;
}

export class ConnectionListItem extends vscode.TreeItem {
  constructor(
    public readonly config: ConnData,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(config.name, collapsibleState);
  }
}
