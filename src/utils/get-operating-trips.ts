import { Temporal } from "temporal-polyfill";

import type { GtfsResource, Trip } from "../gtfs/import-resource.js";

import { isServiceOperatingOn } from "./is-service-operating-on.js";

export function getOperatingTripsByHeadsign(gtfs: GtfsResource) {
	const now = Temporal.Now.zonedDateTimeISO("Europe/Paris");
	const today = now.toPlainDate().subtract({ days: now.hour < 3 ? 1 : 0 });

	const tripsByHeadsign = new Map<string, Trip[]>();

	for (const trip of gtfs.trips.values()) {
		if (!isServiceOperatingOn(trip.service, today)) {
			continue;
		}

		const key = trip.headsign;
		let list = tripsByHeadsign.get(key);
		if (list === undefined) {
			list = [];
			tripsByHeadsign.set(key, list);
		}

		list.push(trip);
	}

	return tripsByHeadsign;
}
