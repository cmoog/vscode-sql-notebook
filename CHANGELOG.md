# Change Log

## Unreleased v0.6.0

- Support for OracleDB driver.

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
