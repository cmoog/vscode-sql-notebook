import * as React from 'react';
import * as ReactDOM from 'react-dom';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'vscode-button': any;
      'vscode-text-field': any;
      'vscode-dropdown': any;
      'vscode-option': any;
    }
  }
}

function createConnection(config: any) {
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  vscode.postMessage({ type: 'create_connection', data: config });
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  ReactDOM.render(<App />, root);
});

function useDropdownValue() {
  // TODO: this will cause problems... if only the web component could be controlled
  const [value, setValue] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const { current } = ref;
    current?.addEventListener('change', (e) => {
      // @ts-ignore
      setValue(e.target?.value);
    });
  }, [ref.current]);
  return { ref, value };
}

function handleSubmit(form: HTMLFormElement) {
  // @ts-ignore
  const data = Object.fromEntries(new FormData(form));
  createConnection(data);
}

const App: React.FC<{}> = () => {
  const { ref: dropdownRef, value } = useDropdownValue();
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    window.addEventListener('message', (event) => {
      const { data } = event;
      switch (data.type) {
        case 'clear_form':
          formRef.current?.reset();
      }
    });
  }, []);

  return (
    <form ref={formRef} style={{ display: 'grid', gridRowGap: '15px' }}>
      <TextOption label="Display Name" objectKey="displayName" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label
          htmlFor="driver-dropdown"
          style={{ display: 'block', marginBottom: '3px' }}
        >
          Database Driver
        </label>
        <vscode-dropdown name="driver" id="driver-dropdown" ref={dropdownRef}>
          <vscode-option>mysql</vscode-option>
          <vscode-option>postgres</vscode-option>
          <vscode-option>mssql</vscode-option>
        </vscode-dropdown>
      </div>
      <TextOption label="Database Host" objectKey="host" />
      <TextOption label="Database Port" objectKey="port" />
      <TextOption label="Database User" objectKey="user" />
      <TextOption
        label="Database Password"
        objectKey="password"
        type="password"
      />
      <TextOption label="Database Name" objectKey="database" />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <vscode-button
          appearance="secondary"
          onClick={() => formRef.current?.reset()}
        >
          Clear
        </vscode-button>
        <vscode-button
          type="submit"
          onClick={() => handleSubmit(formRef.current!)}
        >
          Create
        </vscode-button>
      </div>
    </form>
  );
};

const TextOption: React.FC<{
  label: string;
  objectKey: string;
  type?: string;
}> = ({ objectKey, label, type }) => {
  return (
    <vscode-text-field name={objectKey} type={type}>
      <span style={{ color: 'var(--vscode-editor-foreground)' }}>{label}</span>
    </vscode-text-field>
  );
};
