import * as mysql from 'mysql2/promise';

export const supportedDrivers = ['mysql'] as const;

export type DriverKey = typeof supportedDrivers[number];

export interface Pool {
  getConnection: () => Promise<Conn>;
  end: () => void
}

export interface Conn {
  release: () => void;
  query: (q: string) => Promise<any[]>;
  destroy: () => void
  ping: () => Promise<void>
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

export const getDriver = (
  driverKey: DriverKey
): Driver => {
  switch (driverKey) {
    case 'mysql':
      return new MySQLDriver();
    default:
      throw new Error(`invalid driver key: ${driverKey}`);
  }
};

class MySQLDriver implements Driver {
  createPool({ host, port, user, password, database }: PoolConfig): Pool {
    return mysql.createPool({ host, port, user, password, database });
  }
}
