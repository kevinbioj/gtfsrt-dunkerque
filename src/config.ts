import { Temporal } from "temporal-polyfill";

export const GTFS_RESOURCE_URL = "https://www.data.gouv.fr/api/1/datasets/r/f51fabfb-9d7a-44b7-bd03-d1032337fb80";
export const PORT = 3000;
export const REFRESH_INTERVAL = Temporal.Duration.from({ seconds: 15 }).total("milliseconds");
export const REQUESTOR_REF = "open-data";
export const SIRI_ENDPOINT = "https://ara-api.enroute.mobi/dkbus/siri";
export const SWEEP_THRESHOLD = Temporal.Duration.from({ minutes: 10 }).total("milliseconds");
export const TOKYO_ENDPOINT = atob("aHR0cHM6Ly93d3cuZGtidXMuY29tL3ZlaGljdWxlcy5waHA=");
