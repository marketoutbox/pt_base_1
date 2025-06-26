/* tslint:disable */
/* eslint-disable */
export function get_adf_p_value_and_stationarity(test_statistic: number): AdfResult;
export class AdfResult {
  private constructor();
  free(): void;
  statistic: number;
  p_value: number;
  is_stationary: boolean;
  readonly critical_values: any;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_adfresult_free: (a: number, b: number) => void;
  readonly __wbg_get_adfresult_statistic: (a: number) => number;
  readonly __wbg_set_adfresult_statistic: (a: number, b: number) => void;
  readonly __wbg_get_adfresult_p_value: (a: number) => number;
  readonly __wbg_set_adfresult_p_value: (a: number, b: number) => void;
  readonly __wbg_get_adfresult_is_stationary: (a: number) => number;
  readonly __wbg_set_adfresult_is_stationary: (a: number, b: number) => void;
  readonly adfresult_critical_values: (a: number) => any;
  readonly get_adf_p_value_and_stationarity: (a: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
