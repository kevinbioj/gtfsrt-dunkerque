import { XMLParser } from "fast-xml-parser";

export type VehiclesResponse = {
	liste: {
		vehicule?: Vehicle | Vehicle[];
	};
};

export type Vehicle = {
	cap: [number];
	comptage: number;
	course: number;
	jour: string;
	lat: number | string;
	lng: number | string;
	ligne: string;
	numero: string;
};

const parser = new XMLParser({
	htmlEntities: true,
	removeNSPrefix: true,
});

export async function fetchVehicles(TOKYO_ENDPOINT: string) {
	const response = await fetch(TOKYO_ENDPOINT);

	if (!response.ok) {
		throw new Error(`Failed to fetch vehicles from Tokyo endpoint (http status ${response.status}).`);
	}

	const rawXml = await response.text();
	const payload = parser.parse(rawXml) as VehiclesResponse;
	if (payload.liste.vehicule === undefined) {
		return [];
	}

	return Array.isArray(payload.liste.vehicule) ? payload.liste.vehicule : [payload.liste.vehicule];
}
