import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import { DriverKey } from './driver';
import path = require('path');

export interface LspConfig {
  binPath: string;
  host: string;
  port: number;
  user: string;
  password?: string;
  database?: string;
  driver: SqlsDriver;
}

export type SqlsDriver = 'mysql' | 'postgresql' | 'mysql8' | 'sqlight3'; // TODO: complete

export const sqlsDriverFromDriver = (
  driverKey: DriverKey
): SqlsDriver | null => {
  switch (driverKey) {
    case 'mysql':
      return 'mysql';
    case 'postgres':
      return 'postgresql';
  }
  return null;
};

export function getCompiledLSPBinaryPath(): string | null {
  const { arch, platform } = process;
  const goarch = { arm64: 'arm64', x64: 'amd64' }[arch];
  const goos = { linux: 'linux', darwin: 'darwin', win32: 'windows' }[
    platform.toString()
  ];
  if (!goarch && !goos) {
    return null;
  }
  return path.join(
    __filename,
    '..',
    '..',
    '..',
    'sqls_bin',
    `sqls_${goarch}_${goos}`
  );
}

export class SqlLspClient {
  private client: LanguageClient | null;
  constructor() {
    this.client = null;
  }
  start(config: LspConfig) {
    let serverOptions: ServerOptions = {
      command: config.binPath,
      args: [],
    };

    let clientOptions: LanguageClientOptions = {
      documentSelector: [{ language: 'sql' }],
      initializationOptions: {
        disableCodeAction: true,
        connectionConfig: {
          driver: config.driver,
          user: config.user,
          passwd: config.password,

          host: config.host,
          port: config.port,

          dbName: config.database,

          proto: 'tcp',
        },
      },
      outputChannel: vscode.window.createOutputChannel('sqls'),
    };

    this.client = new LanguageClient('sqls', serverOptions, clientOptions);
    this.client.start();
  }
  async stop() {
    await this.client?.stop();
  }
}
