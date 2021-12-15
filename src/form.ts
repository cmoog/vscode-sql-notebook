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

async function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
) {
  const toolkitUri = getUri(webview, extensionUri, [
    'node_modules',
    '@vscode',
    'webview-ui-toolkit',
    'dist',
    'toolkit.js',
  ]);
  const bundlePath = getUri(webview, extensionUri, [
    'out',
    'webview',
    'main-bundle.js',
  ]);

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <script type="module" src="${toolkitUri}"></script>
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
