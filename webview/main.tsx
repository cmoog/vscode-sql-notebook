import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Form from './Form';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'vscode-button': any;
      'vscode-text-field': any;
      'vscode-dropdown': any;
      'vscode-option': any;
      'vscode-checkbox': any;
    }
  }
}

// @ts-ignore
const vscode = acquireVsCodeApi();

function createConnection(config: any) {
  // @ts-ignore
  vscode.postMessage({ type: 'create_connection', data: config });
}

function handleSubmit(form: HTMLFormElement) {
  // @ts-ignore
  const data = Object.fromEntries(new FormData(form));

  // now for some data cleanup
  if (data.encrypt) {
    // if "on", we want `true`, if nullish, we want false
    data.encrypt = !!data.encrypt;
  }
  createConnection(data);
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  ReactDOM.render(<Form handleSubmit={handleSubmit} />, root);
});
