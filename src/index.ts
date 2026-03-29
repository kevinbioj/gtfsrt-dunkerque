import { setTimeout } from "node:timers/promises";
import { serve } from "@hono/node-server";
import GtfsRealtime from "gtfs-realtime-bindings";
import { Hono } from "hono";
import { Temporal } from "temporal-polyfill";

import { GTFS_RESOURCE_URL, PORT, REFRESH_INTERVAL, REQUESTOR_REF, SIRI_ENDPOINT, TOKYO_ENDPOINT } from "./config.js";
import type { StopTime, Trip } from "./gtfs/import-resource.js";
import { useGtfsResource } from "./gtfs/load-resource.js";
import { handleRequest } from "./gtfs-rt/handle-request.js";
import { useRealtimeStore } from "./gtfs-rt/use-realtime-store.js";
import { fetchEstimatedTimetable } from "./siri/fetch-estimated-timetable.js";
import { fetchMonitoredLines } from "./siri/fetch-monitored-lines.js";
import { fetchVehicles } from "./tokyo/fetch-vehicles.js";

console.log(` ,----.,--------.,------.,---.        ,------.,--------. ,------.                  ,--.                                        
'  .-./'--.  .--'|  .---'   .-',-----.|  .--. '--.  .--' |  .-.  \\ ,--.,--.,--,--, |  |,-. ,---. ,--.--. ,---. ,--.,--. ,---.  
|  | .---.|  |   |  \`--,\`.  \`-.'-----'|  '--'.'  |  |    |  |  \\  :|  ||  ||      \\|     /| .-. :|  .--'| .-. ||  ||  || .-. : 
'  '--'  ||  |   |  |\`  .-'    |      |  |\\  \\   |  |    |  '--'  /'  ''  '|  ||  ||  \\  \\\\   --.|  |   ' '-' |'  ''  '\\   --. 
 \`------' \`--'   \`--'   \`-----'       \`--' '--'  \`--'    \`-------'  \`----' \`--''--'\`--'\`--'\`----'\`--'    \`-|  | \`----'  \`----' 
                                                                                                           \`--'`);

const store = useRealtimeStore();

const hono = new Hono();
hono.get("/trip-updates", (c) => handleRequest(c, "protobuf", store.tripUpdates, null));
hono.get("/trip-updates.json", (c) => handleRequest(c, "json", store.tripUpdates, null));
hono.get("/vehicle-positions", (c) => handleRequest(c, "protobuf", null, store.vehiclePositions));
hono.get("/vehicle-positions.json", (c) => handleRequest(c, "json", null, store.vehiclePositions));
hono.get("/", (c) =>
	handleRequest(c, c.req.query("format") === "json" ? "json" : "protobuf", store.tripUpdates, store.vehiclePositions),
);
serve({ fetch: hono.fetch, port: PORT });
console.log(`➔ Listening on :${PORT}`);

const gtfsResource = await useGtfsResource(GTFS_RESOURCE_URL);

let monitoredLines = await fetchMonitoredLines(SIRI_ENDPOINT, REQUESTOR_REF);
setInterval(
	async () => {
		console.log("➔ Updating monitored lines list from SIRI");
		try {
			monitoredLines = await fetchMonitoredLines(SIRI_ENDPOINT, REQUESTOR_REF);
			console.log(`✓ ${monitoredLines.length} lines to be monitored have been registered`);
		} catch (cause) {
			console.error(`✘ Failed to update monitored lines`, cause);
		}
	},
	Temporal.Duration.from({ hours: 1 }).total("milliseconds"),
);

while (true) {
	const startedAt = Date.now();
	let error: unknown | undefined;

	let timeDelta: number | undefined;

	console.log("➔ Fetching data from SIRI & Tokyo");

	const journeyInformation = new Map<
		number,
		{
			trip: Trip;
			currentStop?: StopTime;
			currentStopStatus?: GtfsRealtime.transit_realtime.VehiclePosition.VehicleStopStatus;
		}
	>();
	let tripUpdatesCount = 0;
	let vehiclePositionsCount = 0;

	try {
		const journeyVersionFrames = await fetchEstimatedTimetable(SIRI_ENDPOINT, REQUESTOR_REF, monitoredLines);

		for (const frame of journeyVersionFrames) {
			if (frame.EstimatedVehicleJourney === undefined) {
				continue;
			}

			const recordedAt = Math.floor(Temporal.Instant.from(frame.RecordedAtTime).epochMilliseconds / 1000);

			const journeys = Array.isArray(frame.EstimatedVehicleJourney)
				? frame.EstimatedVehicleJourney
				: [frame.EstimatedVehicleJourney];

			for (const journey of journeys) {
				const calls = Array.isArray(journey.EstimatedCalls.EstimatedCall)
					? journey.EstimatedCalls.EstimatedCall
					: [journey.EstimatedCalls.EstimatedCall];

				const nextCall = calls[0];
				const nextCallAimedArrival = Temporal.Instant.from(nextCall.AimedArrivalTime)
					.toZonedDateTimeISO("Europe/Paris")
					.toPlainTime();

				const tripsForHeadsign = gtfsResource.operatingTripsByHeadsign.get(journey.DestinationName);
				const trip = tripsForHeadsign?.find((trip) =>
					trip.stopTimes
						.values()
						.some(
							(stopTime) => stopTime.stop.code === nextCall.StopPointRef && stopTime.time.equals(nextCallAimedArrival),
						),
				);

				if (trip === undefined) {
					continue;
				}

				const currentCall = calls.find((call) => call.DepartureStatus !== "departed");
				const currentStop = currentCall ? trip.stopTimes.get(currentCall.StopPointRef) : undefined;
				const currentStopStatus = currentCall
					? GtfsRealtime.transit_realtime.VehiclePosition.VehicleStopStatus[
							currentCall.ArrivalStatus === "arrived" ? "STOPPED_AT" : "IN_TRANSIT_TO"
						]
					: undefined;

				journeyInformation.set(journey.DatedVehicleJourneyRef, {
					trip,
					currentStop,
					currentStopStatus,
				});

				store.tripUpdates.set(`ET:${trip.id}`, {
					stopTimeUpdate: calls.flatMap((call) => {
						const stopTime = trip.stopTimes.get(call.StopPointRef);
						if (stopTime === undefined) {
							return [];
						}

						if (timeDelta === undefined && (call.ExpectedArrivalTime ?? call.ExpectedDepartureTime)) {
							const aimedOffset = call.AimedArrivalTime.slice(-5, -3);
							const expectedOffset = (call.ExpectedArrivalTime ?? call.ExpectedDepartureTime ?? aimedOffset).slice(
								-5,
								-3,
							);
							timeDelta = +aimedOffset - +expectedOffset;
						}

						const expectedArrival = call.ExpectedArrivalTime
							? Temporal.Instant.from(call.ExpectedArrivalTime)
							: undefined;
						const expectedDeparture = call.ExpectedDepartureTime
							? Temporal.Instant.from(call.ExpectedDepartureTime)
							: undefined;

						return {
							arrival: expectedArrival
								? { time: Math.floor(expectedArrival.subtract({ hours: timeDelta }).epochMilliseconds / 1000) }
								: undefined,
							departure: expectedDeparture
								? { time: Math.floor(expectedDeparture.subtract({ hours: timeDelta }).epochMilliseconds / 1000) }
								: undefined,
							stopId: stopTime.stop.id,
							stopSequence: stopTime.sequence,
							scheduleRelationship:
								expectedArrival !== undefined || expectedDeparture !== undefined
									? GtfsRealtime.transit_realtime.TripUpdate.StopTimeUpdate.ScheduleRelationship.SCHEDULED
									: GtfsRealtime.transit_realtime.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED,
						};
					}),
					timestamp: recordedAt,
					trip: {
						tripId: trip.id,
						routeId: trip.routeId,
						directionId: trip.directionId,
						scheduleRelationship: journey.Cancellation
							? GtfsRealtime.transit_realtime.TripDescriptor.ScheduleRelationship.CANCELED
							: GtfsRealtime.transit_realtime.TripDescriptor.ScheduleRelationship.SCHEDULED,
					},
				});

				tripUpdatesCount += 1;
			}
		}
	} catch (cause) {
		error = cause;
	}

	try {
		const vehicles = await fetchVehicles(TOKYO_ENDPOINT);

		for (const vehicle of vehicles) {
			if (vehicle.course === 0 || +vehicle.ligne === 0) {
				continue;
			}

			const information = journeyInformation.get(vehicle.course);
			const vehicleRef = String(vehicle.numero);
			const recordedAt = Math.floor(
				Temporal.PlainDateTime.from(vehicle.jour).toZonedDateTime("Europe/Paris").epochMilliseconds / 1000,
			);

			const routeId = information?.trip.routeId ?? gtfsResource.gtfs.routes.get(vehicle.ligne)?.id;

			store.vehiclePositions.set(`VM:${vehicleRef}`, {
				currentStatus: information?.currentStopStatus,
				currentStopSequence: information?.currentStop?.sequence,
				occupancyStatus:
					vehicle.comptage > 60
						? GtfsRealtime.transit_realtime.VehiclePosition.OccupancyStatus.FULL
						: vehicle.comptage > 30
							? GtfsRealtime.transit_realtime.VehiclePosition.OccupancyStatus.FEW_SEATS_AVAILABLE
							: GtfsRealtime.transit_realtime.VehiclePosition.OccupancyStatus.MANY_SEATS_AVAILABLE,
				position: {
					latitude: +vehicle.lat,
					longitude: +vehicle.lng,
					bearing: vehicle.cap[0],
				},
				stopId: information?.currentStop?.stop.id,
				timestamp: recordedAt,
				trip: routeId
					? {
							tripId: information?.trip.id,
							routeId,
							directionId: information?.trip.directionId,
							scheduleRelationship: information?.trip
								? GtfsRealtime.transit_realtime.TripDescriptor.ScheduleRelationship.SCHEDULED
								: GtfsRealtime.transit_realtime.TripDescriptor.ScheduleRelationship.ADDED,
						}
					: undefined,
				vehicle: {
					id: vehicleRef,
					label: vehicleRef,
				},
			});

			vehiclePositionsCount += 1;
		}
	} catch (cause) {
		error = cause;
	}

	const waitingTime = Math.max(REFRESH_INTERVAL - (Date.now() - startedAt), 0);
	if (error !== undefined) {
		console.error(
			`✘ Something wrong occurred while computing trip updates and vehicle positions, retrying in ${waitingTime}ms`,
			error,
		);
	} else {
		console.log(
			`✓ Done processing ${tripUpdatesCount} trip updates and ${vehiclePositionsCount} vehicle positions, waiting for ${waitingTime}ms`,
		);
	}

	await setTimeout(waitingTime);
}
