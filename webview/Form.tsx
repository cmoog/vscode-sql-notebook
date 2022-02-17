import * as React from 'react';

const Form: React.FC<{ handleSubmit: (form: HTMLFormElement) => void }> = ({
  handleSubmit,
}) => {
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
        <label style={{ display: 'block', marginBottom: '3px' }}>
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

export default Form;

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

function showDriverConfig(driver: string) {
  switch (driver) {
    case 'mysql':
      return(
        <>
          <vscode-checkbox name="multipleStatements" checked>
            Multiple statements
          </vscode-checkbox>
        </>
      );
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
