function init() {
  const vscode = acquireVsCodeApi();

  const formElement = document.getElementById('connection-form');
  const createElement = document.getElementById('create-btn');
  const cancelElement = document.getElementById('cancel-btn');

  createElement.addEventListener('click', () => {
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
  try {
    init();
  } catch (e) {
    console.error('error from sqlnotebook', e);
  }
});
