import { Temporal } from "temporal-polyfill";

const plainDateCache = new Map<string, Temporal.PlainDate>();

export function getPlainDate(input: string) {
	let value = plainDateCache.get(input);
	if (value === undefined) {
		value = Temporal.PlainDate.from(input);
		plainDateCache.set(input, value);
	}

	return value;
}

const plainTimeCache = new Map<string, Temporal.PlainTime>();

export function getPlainTime(input: string) {
	let value = plainTimeCache.get(input);
	if (value === undefined) {
		value = Temporal.PlainTime.from(input);
		plainTimeCache.set(input, value);
	}

	return value;
}
