export function refineDraftTone(body: string, tone: string, recipient: string) {
  if (tone === "warmer") return /^(?:hi|hello|hey)\b/i.test(body) ? body : `Hi ${recipient}, ${body}`;
  return body.replace(/!+/g, ".").replace(/\b(?:absolutely|totally|literally)\s+/gi, "");
}
