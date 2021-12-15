import * as React from 'react';
import * as ReactDOM from 'react-dom';

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

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  ReactDOM.render(<App />, root);
});

function useDropdownValue() {
  // warning, this is hacky
  // since the dropdown web component does not seem to respect
  // setting `value` as a controlled prop, this can easily get out of sync.
  //
  // so we have to manually ensure that during form resets
  // the value is in sync.
  const [value, setValue] = React.useState<string>('mysql');
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const { current } = ref;
    current?.addEventListener('change', (e) => {
      // @ts-ignore
      setValue(e.target?.value);
    });
  }, [ref.current]);
  return { ref, value, setValue };
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

const App: React.FC<{}> = () => {
  const {
    ref: dropdownRef,
    value: driver,
    setValue: setDriver,
  } = useDropdownValue();
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    window.addEventListener('message', (event) => {
      const { data } = event;
      switch (data.type) {
        case 'clear_form':
          formRef.current?.reset();
          setDriver('mysql');
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
        <vscode-dropdown name="driver" ref={dropdownRef}>
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

      {showDriverConfig(driver)}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <vscode-button
          appearance="secondary"
          onClick={() => {
            formRef.current?.reset();
            setDriver('mysql');
          }}
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

function showDriverConfig(driver: string) {
  switch (driver) {
    case 'mysql':
      return <></>;
    case 'postgres':
      return <></>;
    case 'mssql':
      return (
        <>
          <vscode-checkbox name="encrypt" checked>
            Encrypt
          </vscode-checkbox>
        </>
      );
  }
  return <></>;
}

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
