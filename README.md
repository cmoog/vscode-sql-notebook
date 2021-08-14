# VS Code SQL Notebook

> ⚠️ This extension is under active development and is currently in an **alpha** state ⚠️

Execute SQL queries in the VS Code Notebook interface.
View query output and inspect errors interactively.

<img width="1009" alt="Screen Shot 2021-08-14 at 2 51 30 PM" src="https://user-images.githubusercontent.com/7585078/129458651-270070d2-32fe-46b7-a2f2-4ee9c611d876.png">

## Usage

Open a blank SQL file with the `Open With` menu option. Then, select the `SQL Notebook` format.

<img width="585" alt="Screen Shot 2021-08-14 at 2 51 57 PM" src="https://user-images.githubusercontent.com/7585078/129458647-d9015433-f879-4ac3-a1ad-3a8380617e82.png">

<img width="788" alt="Screen Shot 2021-08-14 at 2 52 09 PM" src="https://user-images.githubusercontent.com/7585078/129458646-fcc0139a-a9b0-4fa4-af0e-a4b872f10176.png">

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
