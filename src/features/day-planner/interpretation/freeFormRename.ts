import { normalizeTranscript } from "./normalize";
import { parseStandaloneClockExpression, parseDurationExpression, parseDateExpression } from "./temporal";
import { commandBoundary } from "./sourceClauses";
import { leadingQuotedValue, literalValue } from "../../../shared/command/literalValue";
import { protectCreationValue } from "./creationValue";

function protectLeadingLabel(source: string) {
  const role = source.trim().match(/^for\s+(.+?),\s*add the label\s+([\s\S]+)$/i);
  if (role) {
    const quoted = leadingQuotedValue(role[2]!);
    if (quoted) return { head: `label ${role[1]} with`, value: quoted.value, suffix: /^rather than changing its name[.!?]?$/i.test(quoted.suffix.trim()) ? "; keep its title unchanged" : quoted.suffix.replace(/^[.!?]$/, "") };
  }
  const match = source.trim().match(/^tag\s+((?:this|that|the selected|the current)(?:\s+(?:meeting|event|block|appointment))?|it)\s+(?:with\s+)?([\s\S]+)$/i)
    ?? source.trim().match(/^tag\s+(.+?)\s+with\s+([\s\S]+)$/i);
  if (!match) return null;
  const body = match[2]!;
  const quoted = leadingQuotedValue(body);
  if (quoted) return { head: `label ${match[1]} with`, value: quoted.value, suffix: quoted.suffix.replace(/^[.!?]$/, "") };
  const boundary = commandBoundary(body);
  const value = (boundary ? body.slice(0, boundary.index) : body).replace(/[.!?]$/, "").trim();
  return value ? { head: `label ${match[1]} with`, value: literalValue(value), suffix: boundary ? body.slice(boundary.index) : "" } : null;
}

/** Structural matching never rewrites the captured value. A placeholder keeps
 * conjunctions/verbs inside a title away from the ordinary clause tokenizer. */
function protectLeadingRename(source: string, today: string) {
  const raw = source.trim();
  const role = raw.match(/^i want (?:the words\s+)?([\s\S]+)$/i);
  const quotedRole = role && leadingQuotedValue(role[1]!);
  const owner = quotedRole?.suffix.trim().match(/^as\s+(.+?)(?:'s|’s)\s+(?:title|name)(?:,\s*not as commands)?[.!?]?$/i);
  if (quotedRole && owner) return { head: `rename ${owner[1]} to`, value: quotedRole.value, suffix: "" };
  const simpleTarget = "(?:it|this(?: one| event| meeting)?|that(?: one| event| meeting)?|the selected event|the current meeting|(?:the |my )?(?:[\\w:'’.]+\\s+){0,5}(?:meeting|event|appointment|block))";
  const patterns = [
    /^give\s+(.+?)\s+(?:the )?(?:name|title)\s+([\s\S]+)$/i,
    /^for\s+(.+?),\s*use the (?:name|title)\s+([\s\S]+)$/i,
    /^(?:change|edit|set)\s+(?:its|the)\s+(?:name|title)\s+to\s+(.+)$/i,
    /^(?:make)\s+(?:the title|the name|it say)\s+(.+)$/i,
    /^(?:rename|call|name)\s+((?:the )?(?:event|meeting|appointment|block)\s+(?:before|after|at|starting at|covering)\s+.+?)\s+(?:to|as)\s+(.+)$/i,
    new RegExp(`^(?:rename|call|name)\\s+(${simpleTarget})\\s+(?:(?:to|as)\\s+)?(.+)$`, "i"),
    /^(?:edit|change)\s+(.+?)\s+(?:name|title)\s+(?:and\s+)?(?:change (?:it|the name|the title)\s+)?to\s+(.+)$/i,
    /^(?:edit|change)\s+(.+?)\s+and\s+(?:call|name)\s+it\s+(.+)$/i,
    /^(?:rename|call|name)\s+(.+?)\s+(?:to|as)\s+(.+)$/i,
    /^(.+?)\s+(?:should be called|is now)\s+(.+)$/i,
    /^(?:make|i want)\s+(.+?)\s+called\s+(.+)$/i,
  ];
  let target: string | undefined;
  let value: string | undefined;
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    target = match[2] === undefined ? "it" : match[1];
    value = match[2] ?? match[1];
    break;
  }
  if (!value) {
    const direct = raw.match(/^(?:change|make)\s+(.+?)\s+(?:to\s+)?(.+)$/i);
    // Omitted delimiters are safe only with a bounded contextual target. For
    // named objects, `change TITLE to VALUE` supplies the explicit boundary.
    const bounded = raw.match(/^(?:change|make)\s+(it|this|that|this one|that one)\s+(?:to\s+)?(.+)$/i)
      ?? raw.match(/^change\s+(.+?)\s+to\s+(.+)$/i);
    if (direct && bounded) {
      const valueBoundary = commandBoundary(bounded[2]!);
      const normalizedValue = normalizeTranscript(valueBoundary ? bounded[2]!.slice(0, valueBoundary.index).replace(/[,;]\s*$/, "") : bounded[2]!);
      const temporal = parseStandaloneClockExpression(normalizedValue).status !== "missing"
        || parseDurationExpression(normalizedValue) !== null || parseDateExpression(normalizedValue, today);
      const property = /^(?:red|blue|green|orange|yellow|cyan|indigo|neutral|gr[ae]y|important|critical|normal|flexible|fixed|protected|unprotected|anchored|heavy|light|fluid)(?:\s+and\s+(?:red|blue|green|important|critical|flexible|fixed|heavy|light|fluid))*$/.test(normalizedValue);
      const unresolvedTime = /^(?:(?:another|different|a different|some other|a new|a better) (?:time|slot)|somewhere else|elsewhere|later|earlier|the next (?:free |available )?slot)(?:\b|$)/.test(normalizedValue);
      if (!temporal && !property && !unresolvedTime) { target = bounded[1]; value = bounded[2]; }
    }
  }
  if (!target || !value || /^(?:to|as)$/i.test(value)) return null;
  let suffix = "";
  const quoted = leadingQuotedValue(value);
  if (quoted) { value = quoted.value; suffix = quoted.suffix.replace(/^[.!?]$/, ""); }
  else {
    // Only a complete, explicitly contextual second action ends an unquoted
    // value. "and move mountains" or "and call mum" remains literal text.
    const boundary = commandBoundary(value, true);
    if (boundary?.index !== undefined) { suffix = value.slice(boundary.index); value = value.slice(0, boundary.index); }
  }
  value = value.trim();
  if (!value) return null;
  const reference = /^(?:the|my) (?:event|meeting)$/.test(target.trim()) ? "it" : target.trim();
  return { head: `rename ${reference} to`, suffix, value };
}

export function protectRenameValue(source: string, today: string) {
  const values: Record<string, string> = {};
  const literalCreationTitles = new Set<string>();
  function protect(raw: string): string {
    const creation = protectCreationValue(raw, today);
    if (creation) {
      const placeholder = `flowliteralvalue${Object.keys(values).length}`;
      values[placeholder] = creation.value;
      if (creation.literalCreation) literalCreationTitles.add(placeholder);
      const boundary = commandBoundary(creation.suffix);
      const suffix = boundary ? `${creation.suffix.slice(0, boundary.index)} and ${protect(creation.suffix.slice(boundary.index! + boundary[0].length))}` : creation.suffix;
      return `${creation.head}${placeholder}${suffix}`;
    }
    const mergeTitle = raw.match(/^((?:combine|merge|batch)\s+.+?\s+and\s+(?:call|name)\s+it)\s+(.+)$/i);
    if (mergeTitle) {
      const placeholder = `flowliteralvalue${Object.keys(values).length}`;
      values[placeholder] = mergeTitle[2]!.replace(/^(?:"|“)|(?:"|”)$/g, "");
      return `${mergeTitle[1]} ${placeholder}`;
    }
    const leading = protectLeadingLabel(raw) ?? protectLeadingRename(raw.trim(), today);
    if (leading) {
      const placeholder = `flowliteralvalue${Object.keys(values).length}`;
      values[placeholder] = leading.value;
      const suffix = leading.suffix.replace(/^(?:\s*(?:and then|and|then|but|[,;])\s*)+/i, "");
      return `${leading.head} ${placeholder}${suffix ? ` and ${protect(suffix)}` : ""}`;
    }
    const boundary = commandBoundary(raw);
    if (!boundary) return raw;
    return `${raw.slice(0, boundary.index)} and ${protect(raw.slice(boundary.index! + boundary[0].length))}`;
  }
  const structure = protect(source);
  return Object.keys(values).length ? { structure, values, literalCreationTitles } : null;
}
