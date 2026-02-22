import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cron } from "croner";
import { Temporal } from "temporal-polyfill";

import { getOperatingTripsByHeadsign } from "../utils/get-operating-trips.js";
import { resetServiceOperationCache } from "../utils/is-service-operating-on.js";

import { downloadResource } from "./download-resource.js";
import { importResource } from "./import-resource.js";

let currentInterval: NodeJS.Timeout | undefined;
let operatingTripsJob: Cron | undefined;

export async function useGtfsResource(resourceUrl: string) {
	const initialResource = await loadResource(resourceUrl);

	const resource = {
		gtfs: initialResource.resource,
		operatingTripsByHeadsign: getOperatingTripsByHeadsign(initialResource.resource),
		lastModified: initialResource.lastModified,
		importedAt: Temporal.Now.instant(),
	};

	if (currentInterval !== undefined) {
		clearInterval(currentInterval);
	}

	if (operatingTripsJob === undefined) {
		operatingTripsJob = new Cron("0 3 * * *", () => {
			resource.operatingTripsByHeadsign = getOperatingTripsByHeadsign(resource.gtfs);
		});
	}

	currentInterval = setInterval(
		async () => {
			console.log("➔ Checking for GTFS resource staleness.");

			try {
				const response = await fetch(resourceUrl, {
					method: "HEAD",
					signal: AbortSignal.timeout(30_000),
				});

				if (!response.ok) {
					console.error(`    ⛛ Got HTTP ${response.status}, aborting.`);
					return;
				}

				if (response.headers.get("last-modified") === resource.lastModified) {
					console.log("    ⛛ GTFS resource is up-to-date.");
					return;
				}

				console.log("    ⛛ GTFS resource is stale, requesting update.");

				const newResource = await loadResource(resourceUrl);
				resource.gtfs = newResource.resource;
				resource.lastModified = newResource.lastModified;
				resource.operatingTripsByHeadsign = getOperatingTripsByHeadsign(resource.gtfs);
				resource.importedAt = Temporal.Now.instant();
			} catch (cause) {
				console.error(`✘ GTFS update routine failed:`, cause);
			}
		},
		Temporal.Duration.from({ minutes: 5 }).total("milliseconds"),
	);

	return resource;
}

// --- loadResource

async function loadResource(resourceUrl: string) {
	console.log(`➔ Loading GTFS resource at '${resourceUrl}'.`);

	const workingDirectory = await mkdtemp(join(tmpdir(), "gtfsrt-dunkerque_"));
	console.log(`    ⛛ Generated working directory at '${workingDirectory}'.`);

	try {
		const { lastModified } = await downloadResource(resourceUrl, workingDirectory);
		const resource = await importResource(workingDirectory);
		resetServiceOperationCache();
		console.log("✓ Successfully loaded resource!");
		return { resource, lastModified };
	} catch (cause) {
		throw new Error("Failed to load GTFS resource", { cause });
		// console.log("✘ Failed to load resource!", error);
	} finally {
		await rm(workingDirectory, { recursive: true });
	}
}
