import { TextDecoder } from 'util';
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
// testing

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
      <style>
      </style>
    </head>
    <body>
    <div id="root"></div>
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

        ${schemaToFields([
          { key: 'host', label: 'Database Host', type: 'string' },
          { key: 'port', label: 'Database Port', type: 'string' },
          { key: 'user', label: 'Database User', type: 'string' },
          { key: 'password', label: 'Database Password', type: 'password' },
          { key: 'database', label: 'Database Name', type: 'string' },
        ])}

        <div id="driver-specific-configuration"></div>
        <script type="module">
        function setConfig(html) {
          document.getElementById("driver-specific-configuration").innerHTML = html
        }
        document.getElementById("driver-dropdown").addEventListener("change", (e) => {
          console.log("CHANGE", e)
          // postgres, mysql, mssql
          switch(e.target.value) {
            case 'mysql': 
              setConfig(\`${schemaToFields([])}\`)
              break
            case 'postgres':
              setConfig(\`${schemaToFields([])}\`)
              break
            case 'mssql':
              setConfig(\`${schemaToFields([
                { type: 'boolean', key: 'encrypt', label: 'Encrypt' },
              ])}\`)
              break
          }
        })
        </script>

        <div style="display: flex; justify-content: space-between;">
          <vscode-button appearance="secondary" id="cancel-btn">Clear</vscode-button>
          <vscode-button id="create-btn">Create</vscode-button>
        </div>
      </form>
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

type Field = { key: string; label: string } & (
  | { type: 'string' }
  | { type: 'password' }
  | { type: 'number' }
  | { type: 'boolean' }
  | {
      type: 'option';
      options: string[];
    }
);

// schemaToFields accepts a schema describing the
// desired configuration data. Then, it returns an html string
// containing the necessary form elements that will allow the user to enter
// data of this shape.
function schemaToFields(fields: Field[]): string {
  return fields
    .map((field) => {
      switch (field.type) {
        case 'string':
          return `<vscode-text-field name="${field.key}"><span style="color: var(--vscode-editor-foreground);">${field.label}</span></vscode-text-field>`;
        case 'password':
          return `<vscode-text-field name="${field.key}" type="password"><span style="color: var(--vscode-editor-foreground);">${field.label}</span></vscode-text-field>`;
        case 'boolean':
          return `<vscode-checkbox value="false" name="${field.key}">${field.label}</vscode-checkbox>`;
        default:
          throw Error(`unknown field: ${field}`);
      }
    })
    .join('\n');
}
