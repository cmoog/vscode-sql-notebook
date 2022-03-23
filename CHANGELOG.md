# Change Log

## [Unreleased 0.5.0]

- Package `sqls` language server into `vscode-sql-notebook`.
  - When running on a compatible arch/os, notebooks can now
    benefit from intelligent autocomplete and hover information
    when connected to a valid database connection. To enable this unstable
    feature, set `SQLNotebook.useLanguageServer: true` in settings.
- New configuration option for query timeout in milliseconds. Defaults to 30000.

```json
{
  "SQLNotebook.queryTimeout": 30000
}
```
