import GtfsRealtime from "gtfs-realtime-bindings";

export function createFeed(tripUpdates: Map<string, GtfsRealtime.transit_realtime.ITripUpdate>) {
	return GtfsRealtime.transit_realtime.FeedMessage.create({
		header: {
			gtfsRealtimeVersion: "2.0",
			incrementality: GtfsRealtime.transit_realtime.FeedHeader.Incrementality.FULL_DATASET,
			timestamp: Math.floor(Temporal.Now.instant().epochMilliseconds / 1000),
		},
		entity: tripUpdates
			.entries()
			.flatMap(([id, tripUpdate]) => (tripUpdate.stopTimeUpdate?.length ? [{ id, tripUpdate }] : []))
			.toArray(),
	});
}
