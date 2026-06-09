declare module 'sql.js' {
	export interface Statement {
		bind(values?: Record<string, unknown>): void;
		step(): boolean;
		getAsObject(): Record<string, unknown>;
		reset(): void;
		free(): void;
		run(values?: Record<string, unknown>): void;
	}

	export interface Database {
		prepare(sql: string): Statement;
		exec(sql: string): void;
		close(): void;
		export(): Uint8Array;
	}

	export interface SqlJsStatic {
		Database: new (data?: Uint8Array) => Database;
	}

	type InitSqlJs = (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;

	const initSqlJs: InitSqlJs;
	export default initSqlJs;
}
