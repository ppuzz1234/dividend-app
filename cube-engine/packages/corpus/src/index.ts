export type {
  ArticleSnapshot,
  AuthorityType,
  CollectTarget,
  LifecycleStatus,
  SourceSnapshot,
} from "./types.js";

export type { LawIndexEntry } from "./lawApi.js";
export { fetchLawBody, resolveOc, searchLaw } from "./lawApi.js";

export { buildSnapshot, mapAuthorityType, mapLifecycle, parseArticles, toLocalDate } from "./parse.js";

export type { AdmRulIndexEntry } from "./admrul.js";
export {
  buildAdmRulSnapshot,
  fetchAdmRulBody,
  mapAdmRulAuthority,
  mapAdmRulLifecycle,
  parseAdmRulArticles,
  searchAdmRul,
} from "./admrul.js";
