import * as vscode from 'vscode';
import {
  ConnData,
  ConnectionListItem,
  SQLNotebookConnections,
} from './connections';
import { getPool, PoolConfig } from './driver';
import { storageKey, globalConnPool, globalLspClient } from './extension';
import { getCompiledLSPBinaryPath, sqlsDriverFromDriver } from './lsp';

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
      vscode.window.showWarningMessage(
        `Connection password not found in secret store. There may be a problem with the system keychain.`
      );
      // continue so that Linux users without a keychain can use empty password configurations
    }

    try {
      globalConnPool.pool = await getPool({
        ...match,
        password,
        queryTimeout: getQueryTimeoutConfiguration(),
      } as PoolConfig);
      const conn = await globalConnPool.pool.getConnection();
      await conn.query('SELECT 1'); // essentially a ping to see if the connection works
      connectionsSidepanel.setActive(match.name);
      if (shouldUseLanguageServer()) {
        startLanguageServer(match, password);
      }

      vscode.window.showInformationMessage(
        `Successfully connected to "${match.name}"`
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        // @ts-ignore
        `Failed to connect to "${match.name}": ${err.message}`
      );
      globalLspClient.stop();
      globalConnPool.pool = null;
      connectionsSidepanel.setActive(null);
    }
  };

function startLanguageServer(conn: ConnData, password?: string) {
  try {
    const driver = sqlsDriverFromDriver(conn.driver);
    const binPath = getCompiledLSPBinaryPath();
    if (!binPath)
      throw Error('Platform not supported, language server disabled.');
    if (driver) {
      globalLspClient.start({
        binPath,
        host: conn.host,
        port: conn.port,
        password: password,
        driver,
        database: conn.database,
        user: conn.user,
      });
    } else {
      vscode.window.showWarningMessage(
        `Driver ${conn.driver} not supported by language server. Completion support disabled.`
      );
    }
  } catch (e) {
    vscode.window.showWarningMessage(
      `Language server failed to initialize: ${e}`
    );
  }
}

function shouldUseLanguageServer(): boolean {
  return (
    vscode.workspace.getConfiguration('SQLNotebook').get('useLanguageServer') ||
    false
  );
}

function getQueryTimeoutConfiguration() {
  const defaultTimeout = 30000; // make this the same as the package.json-level configuration default
  return (
    vscode.workspace.getConfiguration('SQLNotebook').get('queryTimeout') ??
    defaultTimeout
  );
}
