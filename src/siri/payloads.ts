import { randomUUID } from "node:crypto";
import { Temporal } from "temporal-polyfill";

export const LINES_DISCOVERY = (requestorRef: string) =>
	`<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/" xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
    <S:Body>
      <sw:LinesDiscovery xmlns:sw="http://wsdl.siri.org.uk" xmlns:siri="http://www.siri.org.uk/siri">
        <Request>
          <siri:RequestTimestamp>${new Date().toISOString()}</siri:RequestTimestamp>
          <siri:RequestorRef>${requestorRef}</siri:RequestorRef>
          <siri:MessageIdentifier>BUS-TRACKER.FR::Message::${randomUUID()}</siri:MessageIdentifier>
        </Request>
        <RequestExtension/>
      </sw:LinesDiscovery>
    </S:Body>
  </S:Envelope>`;

export const GET_ESTIMATED_TIMETABLE = (requestorRef: string, lineRefs: string[]) => {
	const requestTimestamp = Temporal.Now.instant().toString();
	const messageIdentifier = `BUS-TRACKER.FR::Message::${randomUUID()}`;
	return `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/" xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
      <S:Body>
        <sw:GetEstimatedTimetable xmlns:sw="http://wsdl.siri.org.uk" xmlns:siri="http://www.siri.org.uk/siri">
          <ServiceRequestInfo>
            <siri:RequestTimestamp>${requestTimestamp}</siri:RequestTimestamp>
            <siri:RequestorRef>${requestorRef}</siri:RequestorRef>
            <siri:MessageIdentifier>${messageIdentifier}</siri:MessageIdentifier>
          </ServiceRequestInfo>
          <Request version="2.0:FR-IDF-2.4">
            <siri:RequestTimestamp>${requestTimestamp}</siri:RequestTimestamp>
            <siri:MessageIdentifier>${messageIdentifier}</siri:MessageIdentifier>
            <siri:Lines>
              ${lineRefs
								.map(
									(lineRef) => `<siri:LineDirection>
                <siri:LineRef>${lineRef}</siri:LineRef>
              </siri:LineDirection>`,
								)
								.join("\n")}
            </siri:Lines>
          </Request>
          <RequestExtension/>
        </sw:GetEstimatedTimetable>
      </S:Body>
    </S:Envelope>`;
};
