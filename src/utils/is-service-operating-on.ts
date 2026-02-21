import { Temporal } from "temporal-polyfill";

import type { Service } from "../gtfs/import-resource.js";

const cache = new Map<string, { date: Temporal.PlainDate; operating: boolean }>();

export const resetServiceOperationCache = () => cache.clear();

export function isServiceOperatingOn(service: Service, date: Temporal.PlainDate) {
	const cached = cache.get(service.id);
	if (cached?.date.equals(date)) {
		return cached;
	}

	cache.delete(service.id);

	if (service.includedDays.some((d) => d.equals(date))) {
		cache.set(service.id, { date, operating: true });
		return true;
	}

	if (service.excludedDays.some((d) => d.equals(date))) {
		cache.set(service.id, { date, operating: false });
		return false;
	}

	if (
		Temporal.PlainDate.compare(date, service.startDate) < 0 ||
		Temporal.PlainDate.compare(date, service.endDate) > 0
	) {
		cache.set(service.id, { date, operating: false });
		return false;
	}

	const workingOnDay = service.days[date.dayOfWeek];
	cache.set(service.id, { date, operating: workingOnDay });
	return workingOnDay;
}
