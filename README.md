# VS Code SQL Notebook

<img align="right" src="media/logo.png" width="100px">

[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/cmoog.sqlnotebook)](https://marketplace.visualstudio.com/items?itemName=cmoog.sqlnotebook)
[![GitHub Release](https://img.shields.io/github/v/release/cmoog/vscode-sql-notebook?color=6b9ded&include_prerelease=false)](https://github.com/cmoog/vscode-sql-notebook/releases)

Open SQL files in the VS Code Notebook interface. Execute query blocks
and view output interactively.

![Screen Shot 2021-12-30 at 1 34 19 PM](https://user-images.githubusercontent.com/7585078/147782832-1d281462-9567-4a58-a022-815e36941547.png)

## Features

- Open any `.sql` file as a Notebook.
- Execute query blocks in the Notebook UI and view output.
- Configure database connections in the SQL Notebook side-panel.
- Supports MySQL, PostgreSQL, SQLite, and MSSQL (OracleDB support coming soon).
- (unstable) Built-in typed auto-complete with an embedded language server.

## Usage

Open any `.sql` file with the `Open With` menu option. Then, select the `SQL Notebook` format. Configure database connections in the SQL Notebook side-panel.

![Screen Shot 2021-12-30 at 1 30 29 PM](https://user-images.githubusercontent.com/7585078/147782921-78dca657-6737-4055-af46-c019e9df4ea3.png)

![Screen Shot 2021-12-30 at 1 30 39 PM](https://user-images.githubusercontent.com/7585078/147782929-f9b7846b-6911-45ed-8354-ff0130a912b1.png)

![Screen Shot 2021-12-30 at 1 34 32 PM](https://user-images.githubusercontent.com/7585078/147782853-c0ea8ecb-e5f7-410f-83c2-af3d0562302e.png)

## FAQ

**If the file is stored as a regular `.sql` file, how are cell boundaries detected?**

Cell boundaries are inferred from the presence of two consecutive empty lines.

Note: this can pose issues with certain code formatting tools. You will need to
configure them to respect consecutive newlines.
