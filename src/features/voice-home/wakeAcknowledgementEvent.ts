export const WAKE_ACKNOWLEDGEMENT_REQUEST = "flow:wake-acknowledgement-request";
export const WAKE_ACKNOWLEDGEMENT_CANCEL = "flow:wake-acknowledgement-cancel";

export interface WakeAcknowledgementRequest {
  identifier: string;
  text: string;
}

export function cancelWakeAcknowledgement(identifier: string) {
  window.dispatchEvent(new CustomEvent(WAKE_ACKNOWLEDGEMENT_CANCEL, { detail: { identifier } }));
}

export function requestWakeAcknowledgement(identifier: string, text = "Hi there!") {
  window.dispatchEvent(new CustomEvent<WakeAcknowledgementRequest>(WAKE_ACKNOWLEDGEMENT_REQUEST, {
    detail: { identifier, text },
  }));
}
