# Change Log

## v0.5.2

- When clicking `Run All`, cells now execute in series. Previously, cells executed in parallel.

- New configuration option for maximum number of result rows before truncating the result table.
  Defaults to `25`.

```json
{
  "SQLNotebook.maxResultRows": 25
}
```

## v0.5.1

- Fix for `mysql` driver result tables that caused each row to render with its own header.

## v0.5.0

- Bundle `sqls` language server into `vscode-sql-notebook`.
  - When running on a compatible arch/os, notebooks can now
    benefit from intelligent autocomplete and hover information
    when connected to a valid database connection. To enable this unstable
    feature, add the following to your `settings.json`.

```json
{
  "SQLNotebook.useLanguageServer": true
}
```

- New configuration option for query timeout in milliseconds. Defaults to 30000.

```json
{
  "SQLNotebook.queryTimeout": 30000
}
```
