import * as mysql from 'mysql2/promise';
import * as pg from 'pg';
import * as mssql from 'mssql';

export const supportedDrivers = ['mysql', 'postgres', 'mssql'] as const;

export type DriverKey = typeof supportedDrivers[number];

export interface Pool {
  getConnection: () => Promise<Conn>;
  end: () => void;
}

export type QueryResult = ResultTable | string;

export type Row = { [key: string]: string | number | null };

export type ResultTable = Row[];

export interface Conn {
  release: () => void;
  query: (q: string) => Promise<QueryResult>;
  destroy: () => void;
}

interface PoolConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database?: string;
}

export interface Driver {
  createPool: (config: PoolConfig) => Promise<Pool>;
}

export const getDriver = (driverKey: DriverKey): Driver => {
  switch (driverKey) {
    case 'mysql':
      return new MySQLDriver();
    case 'postgres':
      return new PostgresDriver();
    case 'mssql':
      return mssqlDriver();
    default:
      throw new Error(`invalid driver key: ${driverKey}`);
  }
};

class MySQLDriver implements Driver {
  async createPool({
    host,
    port,
    user,
    password,
    database,
  }: PoolConfig): Promise<Pool> {
    return mysqlPool(
      mysql.createPool({ host, port, user, password, database })
    );
  }
}

function mysqlPool(pool: mysql.Pool): Pool {
  return {
    async getConnection(): Promise<Conn> {
      return mysqlConn(await pool.getConnection());
    },
    end() {
      pool.end();
    },
  };
}

function mysqlConn(conn: mysql.PoolConnection): Conn {
  return {
    destroy() {
      conn.destroy();
    },
    async query(q: string): Promise<ResultTable> {
      const [result] = (await conn.query(q)) as any;
      if (!result.length) {
        return [result] as ResultTable;
      }
      return result as ResultTable;
    },
    release() {
      conn.release();
    },
  };
}

class PostgresDriver implements Driver {
  async createPool({
    host,
    port,
    user,
    password,
    database,
  }: PoolConfig): Promise<Pool> {
    const pool = new pg.Pool({
      host,
      port,
      password,
      database,
      user,
    });
    return postgresPool(pool);
  }
}

function postgresPool(pool: pg.Pool): Pool {
  return {
    async getConnection(): Promise<Conn> {
      const conn = await pool.connect();
      return postgresConn(conn);
    },
    end() {
      pool.end();
    },
  };
}

function postgresConn(conn: pg.PoolClient): Conn {
  return {
    async query(q: string): Promise<ResultTable> {
      const response = await conn.query(q);
      return response.rows;
    },
    destroy() {
      // TODO: verify
      conn.release();
    },
    release() {
      conn.release();
    },
  };
}

function mssqlDriver(): Driver {
  return {
    async createPool(config: PoolConfig): Promise<Pool> {
      const conn = await mssql.connect({
        server: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      });
      return mssqlPool(conn);
    },
  };
}

function mssqlPool(pool: mssql.ConnectionPool): Pool {
  return {
    async getConnection(): Promise<Conn> {
      const req = new mssql.Request();
      return mssqlConn(req);
    },
    end() {
      pool.close();
    },
  };
}

function mssqlConn(req: mssql.Request): Conn {
  return {
    destroy() {
      req.cancel();
    },
    async query(q: string): Promise<QueryResult> {
      const res = await req.query(q);
      if (!res.recordsets.length) {
        throw new Error(
          `unexpected response from MSSQL driver: ${JSON.stringify(res)}`
        );
      }
      return res.recordsets[0];
    },
    release() {
      // TODO: verify correctness
    },
  };
}
