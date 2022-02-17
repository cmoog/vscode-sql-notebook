import * as vscode from 'vscode';
import {
  ConnData,
  ConnectionListItem,
  SQLNotebookConnections,
} from './connections';
import { getPool, PoolConfig } from './driver';
import { storageKey, globalConnPool } from './extension';

export const deleteConnectionConfiguration =
  (
    context: vscode.ExtensionContext,
    connectionsSidepanel: SQLNotebookConnections
  ) =>
  async (item: ConnectionListItem) => {
    const without = context.globalState
      .get<ConnData[]>(storageKey, [])
      .filter(({ name }) => name !== item.config.name);
    context.globalState.update(storageKey, without);
    await context.secrets.delete(item.config.name);

    connectionsSidepanel.refresh();
    vscode.window.showInformationMessage(
      `Successfully deleted connection configuration "${item.config.name}"`
    );
    connectionsSidepanel.refresh();
  };

export const connectToDatabase =
  (
    context: vscode.ExtensionContext,
    connectionsSidepanel: SQLNotebookConnections
  ) =>
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
    const password = await context.secrets.get(match.passwordKey);
    if (password === undefined) {
      // can also mean that the platform doesn't work with `keytar`, see #18
      vscode.window.showErrorMessage(
        `Connection password not found in secret store. There may be a problem with the system keychain.`
      );
      return;
    }

    globalConnPool.pool = await getPool({ ...match, password } as PoolConfig);
    try {
      const conn = await globalConnPool.pool.getConnection();
      await conn.query('SELECT 1'); // essentially a ping to see if the connection works
      connectionsSidepanel.setActive(match.name);
      vscode.window.showInformationMessage(
        `Successfully connected to "${match.name}"`
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        // @ts-ignore
        `Failed to connect to "${match.name}": ${err.message}`
      );
      globalConnPool.pool = null;
      connectionsSidepanel.setActive(null);
    }
  };
