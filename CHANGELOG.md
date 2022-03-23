# Change Log

## [Unreleased 0.5.0]

- Package `sqls` language server into `vscode-sql-notebook`.
  - When running on a compatible arch/os, notebooks will now
    benefit from enhacned typed autocomplete and hover information
    when connected to a valid database connection.
- New configuration option for query timeout in milliseconds. Defaults to 30000.
