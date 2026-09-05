/**
 * Minimal local types for the Actual Budget sidecar.
 *
 * Backend owns the HTTP contract and defines the canonical adapter shape in
 * apps/server/src/actualAdapter.ts (its PR). The `SnapshotPoint` /
 * `FlowTransaction` shapes below mirror that interface field-for-field; the
 * `ActualConnector` in connector.ts implements the same method names so the
 * two converge structurally. Any drift is noted in the PR description.
 */

export interface ActualAccount {
  id: string;
  name?: string | undefined;
  offbudget?: boolean | undefined;
  closed?: boolean | undefined;
}

export interface ActualTransaction {
  date: string;
  amount: number;
  transfer_id?: string | null | undefined;
  is_child?: boolean | undefined;
}

/** Backend snapshot point: daily closing spot balance in major currency units. */
export interface SnapshotPoint {
  /** YYYY-MM-DD (UTC). */
  date: string;
  spot: number;
}

/** Backend flow record: one transaction in major currency units. */
export interface FlowTransaction {
  /** YYYY-MM-DD (UTC). */
  date: string;
  amount: number;
  isTransfer: boolean;
}

/** Version probe result, mirroring @actual-app/api getServerVersion. */
export type ServerVersionProbe =
  | { version: string }
  | { error: string };

/** Budget preferences subset the connector reads (currency only). */
export interface BudgetPreferences {
  defaultCurrencyCode?: string | undefined;
}

/** Integer minor units (e.g. cents) to major units (e.g. dollars). */
export type MinorToMajor = (minor: number) => number;

export interface InitHandle {
  integerToAmount: MinorToMajor;
}

export interface InitArgs {
  serverURL: string;
  password: string | undefined;
  /** Maps to @actual-app/api `sessionToken`. */
  sessionToken: string | undefined;
  dataDir: string | undefined;
}

/**
 * Injectable Actual Budget surface. Production wiring lives in api.ts
 * (static @actual-app/api imports); tests inject fakes.
 */
export interface ActualDeps {
  init(args: InitArgs): Promise<InitHandle>;
  downloadBudget(syncId: string, opts: { password: string | undefined }): Promise<void>;
  sync(): Promise<void>;
  getAccounts(): Promise<ActualAccount[]>;
  getAccountBalance(id: string, cutoff: Date): Promise<number>;
  getTransactions(accountId: string, startDate: string, endDate: string): Promise<ActualTransaction[]>;
  getServerVersion(): Promise<ServerVersionProbe>;
  getPreferences(): Promise<BudgetPreferences>;
  shutdown(): Promise<void>;
}
