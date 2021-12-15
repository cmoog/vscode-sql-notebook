import * as React from 'react';
import * as ReactDOM from 'react-dom';

function init() {
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  console.log('hello from tsx file');

  const formElement = document.getElementById(
    'connection-form'
  ) as HTMLFormElement;
  const createElement = document.getElementById(
    'create-btn'
  ) as HTMLButtonElement;
  const cancelElement = document.getElementById(
    'cancel-btn'
  ) as HTMLButtonElement;

  createElement.addEventListener('click', () => {
    // @ts-ignore
    const formData = Object.fromEntries(new FormData(formElement));
    vscode.postMessage({ type: 'create_connection', data: formData });
  });

  cancelElement.addEventListener('click', () => {
    formElement.reset();
    vscode.postMessage({ type: 'cancel_create' });
  });

  window.addEventListener('message', (event) => {
    const { data } = event;
    switch (data.type) {
      case 'clear_form':
        formElement.reset();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  ReactDOM.render(<p>testing</p>, root);
  try {
    init();
  } catch (e) {
    console.error('error from sqlnotebook', e);
  }
});
