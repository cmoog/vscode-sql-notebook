
# VS Code SQL Notebook

> ⚠️ This extension is under active development and is currently in an **alpha** state ⚠️

Execute SQL queries in the VS Code Notebook interface.
View query output and inspect errors interactively.

<img width="1282" alt="Screen Shot 2021-08-14 at 4 15 15 PM" src="https://user-images.githubusercontent.com/7585078/129460194-f894e71a-51d9-4911-b780-a87fcfe52f06.png">


## Usage

Open a blank `.sql-notebook` file with the `Open With` menu option. Then, select the `SQL Notebook` format.

<img width="801" alt="Screen Shot 2021-08-14 at 4 15 26 PM" src="https://user-images.githubusercontent.com/7585078/129460200-c34e2ff9-d48a-480d-ae4f-840ebc33ce2e.png">

<img width="946" alt="Screen Shot 2021-08-14 at 4 15 38 PM" src="https://user-images.githubusercontent.com/7585078/129460203-dd86257e-cfb1-47cb-b76f-b25ab16bb3a3.png">

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
