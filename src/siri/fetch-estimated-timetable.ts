import { GET_ESTIMATED_TIMETABLE } from "./payloads.js";
import { requestSiri } from "./request-siri.js";

export type EstimatedJourneyVersionFrame = {
	RecordedAtTime: string;
	EstimatedVehicleJourney: EstimatedVehicleJourney | EstimatedVehicleJourney[];
};

export type EstimatedVehicleJourney = {
	LineRef: string;
	DatedVehicleJourneyRef: number;
	Cancellation: boolean;
	DestinationName: string;
	EstimatedCalls: {
		EstimatedCall: EstimatedCall | EstimatedCall[];
	};
};

export type EstimatedCall = {
	StopPointRef: string;
	ArrivalStatus: "onTime" | "arrived";
	AimedArrivalTime: string;
	ExpectedArrivalTime?: string;
	DepartureStatus: "onTime" | "departed";
	ExpectedDepartureTime?: string;
};

export async function fetchEstimatedTimetable(siriEndpoint: string, requestorRef: string, lineRefs: string[]) {
	const payload = await requestSiri(siriEndpoint, GET_ESTIMATED_TIMETABLE(requestorRef, lineRefs));

	let frames = payload.Envelope.Body.GetEstimatedTimetableResponse.Answer.EstimatedTimetableDelivery
		?.EstimatedJourneyVersionFrame as EstimatedJourneyVersionFrame | EstimatedJourneyVersionFrame[] | undefined;
	if (frames === undefined) {
		return [];
	} else if (!Array.isArray(frames)) {
		frames = [frames];
	}

	return frames;
}
