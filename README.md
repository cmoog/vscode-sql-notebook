# VS Code SQL Notebook

> ⚠️ This extension is under active development and is currently in an **alpha** state ⚠️

Execute SQL queries in the VS Code Notebook interface.
View query output and inspect errors interactively.

<img width="1404" alt="Screen Shot 2021-08-14 at 4 39 47 PM" src="https://user-images.githubusercontent.com/7585078/129460710-11ae842c-6a9f-4d2a-9f67-c68bac00c64f.png">

## Progress

- [x] MySQL support
- [x] Support `query` and `exec` responses
- [ ] Automatically configure typed autocomplete (with an LSP)
- [ ] Improve result rendering
- [ ] Postgres support
- [ ] Improve credential experience (store password in VS Code secret store)

## Usage

Open a blank `.sql-notebook` file with the `Open With` menu option. Then, select the `SQL Notebook` format.
<img width="718" alt="Screen Shot 2021-08-14 at 4 39 23 PM" src="https://user-images.githubusercontent.com/7585078/129460717-92487c4f-c121-4d80-85f1-ac8ca0834e7a.png">

<img width="798" alt="Screen Shot 2021-08-14 at 4 39 34 PM" src="https://user-images.githubusercontent.com/7585078/129460721-c07c1c9e-6309-4290-9383-9d8955aac44f.png">

### Connection Config

Currently, the SQL Notebooks require you to execute a YAML cell specifying the
connection configuration with the following schema:

```yaml
host: string
port: number
user: string
password: string
database: string
```

After executing this cell, executing SQL cells will use the associated connection.
