import { join } from "node:path";
import { Temporal } from "temporal-polyfill";

import { parseCsv } from "../utils/parse-csv.js";
import { getPlainTime } from "../utils/temporal-cache.js";

export async function importResource(directory: string) {
	const routes = await importRoutes(directory);
	const services = await importServices(directory);
	const stops = await importStops(directory);
	const trips = await importTrips(directory, services, stops);
	return { routes, services, trips };
}

export type GtfsResource = Awaited<ReturnType<typeof importResource>>;

// --- importRoutes

type RouteRecord = { route_id: string; route_short_name: string };

type Route = { id: string; name: string };

async function importRoutes(directory: string) {
	const routes = new Map<string, Route>();

	const routesPath = join(directory, "routes.txt");
	await parseCsv<RouteRecord>(routesPath, (routeRecord) => {
		routes.set(routeRecord.route_short_name, {
			id: routeRecord.route_id,
			name: routeRecord.route_short_name,
		});
	});

	return routes;
}

// --- importServices

type CalendarRecord = {
	service_id: string;
	monday: "0" | "1";
	tuesday: "0" | "1";
	wednesday: "0" | "1";
	thursday: "0" | "1";
	friday: "0" | "1";
	saturday: "0" | "1";
	sunday: "0" | "1";
	start_date: string;
	end_date: string;
};

type CalendarDatesRecord = {
	service_id: string;
	date: string;
	exception_type: "1" | "2";
};

export type Service = {
	id: string;
	days: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
	startDate: Temporal.PlainDate;
	endDate: Temporal.PlainDate;
	includedDays: Temporal.PlainDate[];
	excludedDays: Temporal.PlainDate[];
};

async function importServices(directory: string) {
	const services = new Map<string, Service>();

	const calendarPath = join(directory, "calendar.txt");
	await parseCsv<CalendarRecord>(calendarPath, (calendarRecord) => {
		services.set(calendarRecord.service_id, {
			id: calendarRecord.service_id,
			days: [
				Boolean(+calendarRecord.monday),
				Boolean(+calendarRecord.tuesday),
				Boolean(+calendarRecord.wednesday),
				Boolean(+calendarRecord.thursday),
				Boolean(+calendarRecord.friday),
				Boolean(+calendarRecord.saturday),
				Boolean(+calendarRecord.sunday),
			],
			startDate: Temporal.PlainDate.from(calendarRecord.start_date),
			endDate: Temporal.PlainDate.from(calendarRecord.end_date),
			excludedDays: [],
			includedDays: [],
		});
	});

	const calendarDatesPath = join(directory, "calendar_dates.txt");
	await parseCsv<CalendarDatesRecord>(calendarDatesPath, (calendarDatesRecord) => {
		let service = services.get(calendarDatesRecord.service_id);

		if (service === undefined) {
			service = {
				id: calendarDatesRecord.service_id,
				days: [false, false, false, false, false, false, false],
				startDate: Temporal.PlainDate.from("20000101"),
				endDate: Temporal.PlainDate.from("20991231"),
				excludedDays: [],
				includedDays: [],
			};

			services.set(service.id, service);
		}

		const date = Temporal.PlainDate.from(calendarDatesRecord.date);

		if (calendarDatesRecord.exception_type === "1") {
			service.includedDays.push(date);
		} else {
			service.excludedDays.push(date);
		}
	});

	return services;
}

// --- importStops

type StopRecord = { stop_id: string; stop_code: string; stop_name: string; location_type?: "0" | string };

type Stop = { id: string; code: string; name: string };

async function importStops(directory: string) {
	const stops = new Map<string, Stop>();

	const stopsPath = join(directory, "stops.txt");
	await parseCsv<StopRecord>(stopsPath, (stopRecord) => {
		if (stopRecord.location_type !== undefined && stopRecord.location_type !== "" && stopRecord.location_type !== "0") {
			return;
		}

		stops.set(stopRecord.stop_id, {
			id: stopRecord.stop_id,
			code: stopRecord.stop_code,
			name: stopRecord.stop_name,
		});
	});

	return stops;
}

// --- importTrips

type TripRecord = {
	trip_id: string;
	service_id: string;
	route_id: string;
	direction_id: "0" | "1";
	trip_headsign: string;
};

type StopTimeRecord = { trip_id: string; stop_sequence: string; stop_id: string; departure_time: string };

export type StopTime = { sequence: number; stop: Stop; time: Temporal.PlainTime; dayShift?: number };

export type Trip = {
	id: string;
	service: Service;
	routeId: string;
	directionId: number;
	headsign: string;
	stopTimes: Map<string, StopTime>;
};

async function importTrips(directory: string, services: Map<string, Service>, stops: Map<string, Stop>) {
	const trips = new Map<string, Trip>();

	const tripsPath = join(directory, "trips.txt");
	await parseCsv<TripRecord>(tripsPath, (tripRecord) => {
		const service = services.get(tripRecord.service_id);
		if (service === undefined) {
			return;
		}

		trips.set(tripRecord.trip_id, {
			id: tripRecord.trip_id,
			service,
			routeId: tripRecord.route_id,
			directionId: +tripRecord.direction_id,
			headsign: tripRecord.trip_headsign,
			stopTimes: new Map<string, StopTime>(),
		});
	});

	const stopTimesPath = join(directory, "stop_times.txt");
	await parseCsv<StopTimeRecord>(stopTimesPath, (stopTimeRecord) => {
		const trip = trips.get(stopTimeRecord.trip_id);
		if (trip === undefined) {
			return;
		}

		const stop = stops.get(stopTimeRecord.stop_id);
		if (stop === undefined) {
			return;
		}

		const [hour, minute, second] = stopTimeRecord.departure_time.split(":").map(Number);
		const dayShift = hour % 24;

		trip.stopTimes.set(stop.code, {
			sequence: +stopTimeRecord.stop_sequence,
			stop,
			time: getPlainTime(
				`${String(hour % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`,
			),
			dayShift: dayShift || undefined,
		});
	});

	return trips;
}
