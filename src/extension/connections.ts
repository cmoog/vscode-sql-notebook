import * as vscode from 'vscode';
import * as path from 'path';
import { storageKey } from './extension';

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
    this.activeConn = null;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ConnectionListItem): vscode.TreeItem {
    return element;
  }

  public setActive(connName: string | null) {
    this.activeConn = connName;
    this.refresh();
  }
  private activeConn: string | null;

  getChildren(element?: ConnectionListItem): Thenable<vscode.TreeItem[]> {
    if (element) {
      return Promise.resolve([
        new vscode.TreeItem(
          `host: ${element.config.host}`,
          vscode.TreeItemCollapsibleState.None
        ),
        new vscode.TreeItem(
          `port: ${element.config.port}`,
          vscode.TreeItemCollapsibleState.None
        ),
        new vscode.TreeItem(
          `user: ${element.config.user}`,
          vscode.TreeItemCollapsibleState.None
        ),
        new vscode.TreeItem(
          `database: ${element.config.database}`,
          vscode.TreeItemCollapsibleState.None
        ),
      ]);
    }
    const connections =
      this.context.globalState.get<ConnData[] | null>(
		  storageKey,
      ) ?? [];

    return Promise.resolve(
      connections.map(
        (config) =>
          new ConnectionListItem(
            config,
            config.name === this.activeConn,
            vscode.TreeItemCollapsibleState.Expanded
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
    public readonly isActive: boolean,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(config.name, collapsibleState);
    if (isActive) {
      this.iconPath = {
        dark: path.join(mediaDir, 'checkbox.svg'),
        light: path.join(mediaDir, 'checkbox.svg'),
      };
    }
  }
}

export const mediaDir = path.join(__filename, '..', '..', '..', 'media');
