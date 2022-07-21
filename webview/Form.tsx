import * as React from 'react';
import {
  VSCodeButton,
  VSCodeTextField,
  VSCodeDropdown,
  VSCodeOption,
  VSCodeCheckbox,
} from '@vscode/webview-ui-toolkit/react';

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
        <VSCodeDropdown name="driver" ref={dropdownRef}>
          <VSCodeOption>mysql</VSCodeOption>
          <VSCodeOption>postgres</VSCodeOption>
          <VSCodeOption>mssql</VSCodeOption>
          <VSCodeOption>sqlite</VSCodeOption>
        </VSCodeDropdown>
      </div>
      {/* special case for sqlite, don't need default options */}
      {driver !== 'sqlite' && (
        <>
          <TextOption label="Database Host" objectKey="host" />
          <TextOption label="Database Port" objectKey="port" />
          <TextOption label="Database User" objectKey="user" />
          <TextOption
            label="Database Password"
            objectKey="password"
            type="password"
          />
          <TextOption label="Database Name" objectKey="database" />
        </>
      )}

      {showDriverConfig(driver)}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <VSCodeButton
          appearance="secondary"
          onClick={() => {
            formRef.current?.reset();
            setDriver('mysql');
          }}
        >
          Clear
        </VSCodeButton>
        <VSCodeButton onClick={() => handleSubmit(formRef.current!)}>
          Create
        </VSCodeButton>
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
      setValue((e.target as HTMLInputElement)?.value);
    });
  }, [ref.current]);
  return { ref, value, setValue };
}

function showDriverConfig(driver: string) {
  switch (driver) {
    case 'mysql':
      return (
        <>
          <VSCodeCheckbox name="multipleStatements" checked>
            Multiple statements
          </VSCodeCheckbox>
        </>
      );
    case 'postgres':
      return <></>;
    case 'mssql':
      return (
        <>
          <VSCodeCheckbox name="encrypt" checked>
            Encrypt
          </VSCodeCheckbox>
          <VSCodeCheckbox name="trustServerCertificate" checked>
            Trust Server Certificate
          </VSCodeCheckbox>
        </>
      );
    case 'sqlite':
      return <TextOption objectKey="path" label="Path" />;
  }
  return <></>;
}

const TextOption: React.FC<{
  label: string;
  objectKey: string;
  type?: string;
}> = ({ objectKey, label, type }) => {
  return (
    <VSCodeTextField name={objectKey} type={type}>
      <span style={{ color: 'var(--vscode-editor-foreground)' }}>{label}</span>
    </VSCodeTextField>
  );
};
