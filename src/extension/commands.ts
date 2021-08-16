import * as vscode from 'vscode';
import {
  ConnData,
  ConnectionListItem,
  SQLNotebookConnections,
} from './connections';
import { DriverKey, getDriver, supportedDrivers } from './driver';
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

export const addNewConnectionConfiguration =
  (
    context: vscode.ExtensionContext,
    connectionsSidepanel: SQLNotebookConnections
  ) =>
  async () => {
    const displayName = await getUserInput('Database Display Name ', true);
    if (!displayName) {
      vscode.window.showErrorMessage(`A valid display name is required.`);
      return;
    }
    const host = await getUserInput('Database Host', true);
    if (!host) {
      vscode.window.showErrorMessage(`A valid host is required.`);
      return;
    }
    const port = await getUserInput('Database Port', true);
    if (!port) {
      vscode.window.showErrorMessage(`A valid port is required.`);
      return;
    }
    const user = await getUserInput('Database User', true);
    if (!user) {
      vscode.window.showErrorMessage(`A valid database user is required.`);
      return;
    }
    const driver = await vscode.window.showQuickPick(supportedDrivers);
    if (!driver) {
      vscode.window.showErrorMessage(`A valid driver is required.`);
      return;
    }
    const password = await getUserInput('Database Password', false, {
      password: true,
    });
    const passwordKey = `sqlnotebook.${displayName}`;
    const database = await getUserInput('Database Name', false);
    await context.secrets.store(passwordKey, password || '');
    const config: ConnData = {
      name: displayName,
      database: database || '',
      host: host,
      user: user,
      passwordKey,
      port: parseInt(port),
      driver: driver as DriverKey,
    };
    const existing = context.globalState
      .get<ConnData[]>(storageKey, [])
      .filter(({ name }) => name !== displayName);
    existing.push(config);
    context.globalState.update(storageKey, existing);
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
      vscode.window.showErrorMessage(
        `Connection password not found in secret store.`
      );
      return;
    }
    const driver = getDriver(match.driver);
    globalConnPool.pool = driver.createPool({
      host: match.host,
      port: match.port,
      user: match.user,
      password,
      database: match.database,
    });
    try {
      const conn = await globalConnPool.pool.getConnection();
      await conn.ping();
      connectionsSidepanel.setActive(match.name);
      vscode.window.showInformationMessage(
        `Successfully connected to "${match.name}"`
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to connect to "${match.name}": ${err.message}`
      );
      globalConnPool.pool = null;
      connectionsSidepanel.setActive(null);
    }
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

const requiredValidator = (name: string) => (value: string) => {
  if (!value) {
    return `${name} is required`;
  }
  return undefined;
};
