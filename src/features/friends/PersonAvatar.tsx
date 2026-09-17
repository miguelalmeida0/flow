import type { Person } from "../../domain/life-model";
import { personInitials, personLabel } from "./people";

const tones = { tide: "bg-flow-blue-soft text-[#245D9C]", clay: "bg-[#F3E5DF] text-[#885D4F]", ochre: "bg-[#F2EBCD] text-[#826C35]", sage: "bg-flow-green-soft text-flow-green-strong" };
export function PersonAvatar({ person, small = false }: { person: Person; small?: boolean }) {
  return <span aria-label={personLabel(person)} className={`inline-grid shrink-0 place-items-center rounded-full font-medium ${small ? "size-8 text-xs" : "size-12 text-base"} ${tones[person.avatar?.tone ?? "tide"]}`}>{person.avatar?.initials || personInitials(personLabel(person))}</span>;
}
