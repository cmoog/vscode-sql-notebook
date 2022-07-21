import * as vscode from 'vscode';
import { ConnData } from './connections';
import { storageKey } from './main';

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

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext<unknown>,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewView.webview.options = {
      enableScripts: true,
      enableForms: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = await getWebviewContent(
      webviewView.webview,
      this.context.extensionUri
    );
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'create_connection':
          const { displayName, password, port, ...rest } = message.data;

          const passwordKey = `sqlnotebook.${displayName}`;

          const newConfig = {
            ...rest,
            name: displayName,
            passwordKey,
            port: parseInt(port),
          };

          if (!isValid(newConfig)) {
            return;
          }
          await this.context.secrets.store(passwordKey, password || '');

          // this ensures we don't store the password in plain text
          delete newConfig.password;

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
  if (config.driver === 'sqlite') {
    if (config.path) {
      return true;
    }
    vscode.window.showErrorMessage(
      `invalid "Path", must be nonempty. Use ":memory:" for an in-memory database.`
    );
    return false;
  }
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

async function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
) {
  const bundlePath = getUri(webview, extensionUri, [
    'dist',
    'webview',
    'main-bundle.js',
  ]);

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>SQL Notebook New Connection</title>
    </head>
    <body>
    <div id="root"></div>
    <script src="${bundlePath}"></script>
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
