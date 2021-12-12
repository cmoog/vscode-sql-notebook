import * as vscode from 'vscode';
import { ConnData } from './connections';
import { storageKey } from './extension';

export function activateFormProvider(context: vscode.ExtensionContext) {
  const provider = new SQLConfigurationViewProvider(
    'sqlnotebook.connectionForm',
    context
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(provider.viewId, provider)
  );
}

class SQLConfigurationViewProvider implements vscode.WebviewViewProvider {
  public readonly viewId: string;
  private readonly context: vscode.ExtensionContext;
  constructor(viewId: string, context: vscode.ExtensionContext) {
    this.viewId = viewId;
    this.context = context;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext<unknown>,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      enableForms: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = getWebviewContent(
      webviewView.webview,
      this.context.extensionUri
    );
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'create_connection':
          const { displayName, database, driver, host, password, port, user } =
            message.data;

          const passwordKey = `sqlnotebook.${displayName}`;

          const newConfig: ConnData = {
            name: displayName,
            database,
            driver,
            host,
            passwordKey,
            port: parseInt(port),
            user,
          };
          if (!isValid(newConfig)) {
            return;
          }
          await this.context.secrets.store(passwordKey, password || '');

          const existing = this.context.globalState
            .get<ConnData[]>(storageKey, [])
            .filter(({ name }) => name !== displayName);
          existing.push(newConfig);
          this.context.globalState.update(storageKey, existing);
          await vscode.commands.executeCommand(
            'sqlnotebook.refreshConnectionPanel'
          );
          webviewView.webview.postMessage({ type: 'clear_form' });
      }
    });
  }
}

function isValid(config: ConnData): boolean {
  if (!config.name) {
    vscode.window.showErrorMessage(`invalid "Database Name", must be nonempty`);
    return false;
  }
  if (!config.host) {
    vscode.window.showErrorMessage(`invalid "host", must be nonempty`);
    return false;
  }
  if (!config.port && config.port !== 0) {
    vscode.window.showErrorMessage(
      `invalid "port", must be parsable as an integer`
    );
    return false;
  }
  return true;
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const toolkitUri = getUri(webview, extensionUri, [
    'node_modules',
    '@vscode',
    'webview-ui-toolkit',
    'dist',
    'toolkit.js',
  ]);
  const formJs = getUri(webview, extensionUri, ['media', 'webview', 'form.js']);

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <script type="module" src="${toolkitUri}"></script>
      <title>SQL Notebook New Connection</title>
      <style>

      .flex-between { display: flex; justify-content: space-between; }
      .label { color: var(--vscode-editor-foreground); }

      </style>
    </head>
    <body>
      <form id="connection-form" style="display: grid; grid-row-gap: 15px;">
        <vscode-text-field name="displayName"><span style="color: var(--vscode-editor-foreground);">Display Name</span></vscode-text-field>
        <div style="display: flex; flex-direction: column;">
          <label for="driver-dropdown" style="display:block; margin-bottom: 3px;">Database Driver</label>
          <vscode-dropdown name="driver" id="driver-dropdown">
            <vscode-option>mysql</vscode-option>
            <vscode-option>postgres</vscode-option>
            <vscode-option>mssql</vscode-option>
          </vscode-dropdown>
        </div>

        <vscode-text-field name="host"><span style="color: var(--vscode-editor-foreground);">Database Host</span></vscode-text-field>
        <vscode-text-field name="port"><span style="color: var(--vscode-editor-foreground);">Database Port</span></vscode-text-field>
        <vscode-text-field name="user"><span style="color: var(--vscode-editor-foreground);">Database User</span></vscode-text-field>
        <vscode-text-field name="password" type="password"><span style="color: var(--vscode-editor-foreground);">Database Password</span></vscode-text-field>
        <vscode-text-field name="database"><span style="color: var(--vscode-editor-foreground);">Database Name</span></vscode-text-field>

        <div id="config-body"></div>
        <div style="display: flex; justify-content: space-between;">
          <vscode-button appearance="secondary" id="cancel-btn">Cancel</vscode-button>
          <vscode-button id="create-btn">Create</vscode-button>
        </div>
      </form>
      <script type="module" src="${formJs}"></script>
    </body>
  </html>
`;
}

function getUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  pathList: string[]
) {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}
