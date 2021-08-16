import * as mysql from 'mysql2/promise';
import * as pg from 'pg';

export const supportedDrivers = ['mysql', 'postgres'] as const;

export type DriverKey = typeof supportedDrivers[number];

export interface Pool {
  getConnection: () => Promise<Conn>;
  end: () => void;
}

export interface Conn {
  release: () => void;
  query: (q: string) => Promise<any[]>;
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
  createPool: (config: PoolConfig) => Pool;
}

export const getDriver = (driverKey: DriverKey): Driver => {
  switch (driverKey) {
    case 'mysql':
      return new MySQLDriver();
    case 'postgres':
      return new PostgresDriver();
    default:
      throw new Error(`invalid driver key: ${driverKey}`);
  }
};

class MySQLDriver implements Driver {
  createPool({ host, port, user, password, database }: PoolConfig): Pool {
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
    async query(q: string): Promise<any[]> {
      const [result] = await conn.query(q);
      return result as any[];
    },
    release() {
      conn.release();
    },
  };
}

class PostgresDriver implements Driver {
  createPool({ host, port, user, password, database }: PoolConfig): Pool {
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
    async query(q: string): Promise<any[]> {
      const response = (await conn.query(q)) as any;
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
