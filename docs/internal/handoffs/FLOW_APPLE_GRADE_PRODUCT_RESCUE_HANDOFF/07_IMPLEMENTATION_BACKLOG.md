# 07 — Implementation Backlog

This is the execution backlog. Complete P0 and P1 in this mission. Complete P2 before mascot work. P3 is optional only after every earlier gate is green.

## P0 — Trust and global voice (must ship first)

1. Snapshot the current repository state and baseline all existing tests.
2. Record current routes, state owners, parsers, voice lifecycle, and persistence keys.
3. Create a migration-safe branch; do not destroy existing working calendar behavior.
4. Move the speech-recognition owner to the application shell.
5. Guarantee one recognizer instance per app session.
6. Remove route-local recognizer creation.
7. Remove duplicate recognition listeners.
8. Explicitly set `en-US` before every recognizer start.
9. Enable multiple alternatives where supported.
10. Add pure transcript-candidate ranking using semantic validity.
11. Add development-only voice diagnostics without storing audio.
12. Implement the explicit voice state machine.
13. Restart recognition safely after normal `end` events.
14. Debounce restart to prevent loops.
15. Block restart while processing a final transcript.
16. Pause when tab becomes hidden.
17. Resume on visibility return only if Live Session remains enabled.
18. Pause immediately on Escape.
19. Add spoken pause commands.
20. Ensure route changes do not tear down listening.
21. Make Live Session status truthful.
22. Add typed-command fallback through the exact same router.
23. Create one global intent router.
24. Implement system-control priority.
25. Implement navigation priority.
26. Implement pending-confirmation priority.
27. Implement pending-clarification priority.
28. Implement contextual-follow-up priority.
29. Implement explicit-domain priority.
30. Implement cross-domain life-statement priority.
31. Implement explicit-capture priority.
32. Implement unsupported fallback with zero mutation.
33. Delete every unknown-to-Inbox fallback.
34. Add route aliases and natural navigation synonyms.
35. Support “open the inbox area.”
36. Support “open my plans.”
37. Support “go back home.”
38. Support direct single nouns such as “Calendar.”
39. Add a bounded interaction context stack.
40. Persist only safe context required across route changes.
41. Expire stale entity references.
42. Clear context when topic changes unambiguously.
43. Preserve context for pronoun follow-ups.
44. Add a visible but restrained interim transcript.
45. Add a non-mutating interpretation preview.
46. Commit only final validated transcripts.
47. Prevent duplicate execution when Chrome repeats results.
48. Deduplicate final transcripts by recognition session/result index.
49. Distinguish recognition errors from command errors.
50. Replace permanent red error panels with local concise feedback.
51. Ensure unsupported commands never create history entries.
52. Ensure navigation never creates data.
53. Ensure valid global commands work on every route.
54. Add physical-microphone acceptance documentation.
55. Correct verification language: synthetic pipeline versus real microphone.

## P0 — Calendar commands from anywhere

56. Route event creation globally, independent of current route.
57. Support “book dinner at Pizzeria Roma tomorrow at 8pm.”
58. Use a sensible editable default duration for meals.
59. Resolve events by exact title.
60. Resolve by unique title phrase.
61. Resolve by unique token match.
62. Resolve by conversational suffix removal.
63. Resolve by unique start time such as “the 2 PM meeting.”
64. Resolve by current event.
65. Resolve by next event.
66. Resolve by recent referenced event.
67. Never infer “meeting” as all events.
68. Ask one clarification for real ambiguity.
69. Support move, shift, push, reschedule, and put.
70. Support date changes and relative weekdays.
71. Support duration changes.
72. Support rename.
73. Support color changes.
74. Support labels.
75. Support importance changes.
76. Support protect/unprotect.
77. Support mobility changes.
78. Support confirmation status.
79. Support completion.
80. Support deletion with confirmation.
81. Support pre-event buffer creation.
82. Support breathing-room creation.
83. Support compound calendar transactions.
84. Guarantee one undo entry per compound request.
85. Preserve fixed/protected events unless explicitly authorized.
86. Prevent silent event loss or duplication.
87. Prevent invalid durations.
88. Prevent unintended collisions.
89. Return closest feasible alternatives for impossible requests.
90. Preserve event IDs through edits.

## P1 — Consolidate information architecture

91. Add canonical Home route.
92. Rename Calendar presentation to Today.
93. Redirect `/calendar` to `/today` without data loss.
94. Embed Now into Home and Today.
95. Remove Now from top-level navigation.
96. Redirect `/now` to Today's Now focus.
97. Rename Inbox presentation to Capture.
98. Redirect `/inbox` to `/capture`.
99. Rename Plans presentation to Outcomes.
100. Redirect `/plans` to `/outcomes`.
101. Rename People presentation to Commitments.
102. Redirect `/people` to `/commitments`.
103. Replace equal top navigation with Home, Today, Capture, Outcomes, Commitments.
104. Keep navigation keyboard accessible.
105. Keep every legacy voice alias working.
106. Ensure deep links migrate safely.
107. Preserve existing stored entities through schema migration.

## P1 — Unified state and transactions

108. Introduce versioned `LifeState`.
109. Migrate existing events into the unified state.
110. Migrate current captures without duplication.
111. Migrate current plans/outcomes.
112. Migrate current promises/people data.
113. Create normalized entity records.
114. Create projection selectors.
115. Create one action dispatcher.
116. Create atomic transaction application.
117. Create invariant validation before commit.
118. Create exact global undo.
119. Create exact global redo.
120. Include navigation only in UI history, not domain undo.
121. Persist complete state after commits.
122. Recover safely from corrupt storage.
123. Add schema version migration tests.
124. Remove route-owned duplicate stores.
125. Remove copy-based cross-space conversions.
126. Preserve origin links when resolving a capture.
127. Preserve source links when scheduling an outcome step.
128. Preserve commitment links to event/outcome.

## P1 — Home utility

129. Replace four equal empty containers with situation-based hierarchy.
130. Add current event or current open gap.
131. Add next protected/fixed commitment.
132. Add day viability/recovery state.
133. Add one unresolved Capture needing a decision.
134. Add one Outcome whose next step lacks time.
135. Add one Commitment due soon or waiting too long.
136. Add direct actions from Home.
137. Add voice navigation from Home.
138. Add voice mutation from Home.
139. Add useful empty setup state.
140. Never show a dead card only because a domain is empty.

## P1 — Capture utility

141. Build a universal capture composer.
142. Support voice and typed capture parity.
143. Route event requests directly to Today.
144. Route outcome statements directly to Outcomes.
145. Route commitment statements directly to Commitments.
146. Keep ideas/references as lightweight captures.
147. Show the inferred destination before final commit when ambiguous.
148. Add explicit “keep as note.”
149. Add edit, archive, delete, and resolve actions.
150. Add batch resolve for multiple captures.
151. Show resolved destination and allow undo.
152. Remove duplicate retained text after safe routing.
153. Replace the blank empty panel with immediate capture and examples.

## P1 — Outcomes utility

154. Create outcomes directly from voice/type on any route.
155. Parse simple target dates and conditions.
156. Add a generic outcome template.
157. Add passport template.
158. Add trip-preparation template.
159. Add job-application template.
160. Add appointment-preparation template.
161. Add purchase/return template.
162. Add presentation/report template.
163. Keep templates editable and transparent.
164. Add outcome detail view.
165. Add step creation.
166. Add step rename.
167. Add step reorder.
168. Add step completion.
169. Add step deletion with confirmation.
170. Add next-step designation.
171. Add duration to next step.
172. Add schedule-next-step action.
173. Add “find time this week.”
174. Use the same calendar scheduler for time reservation.
175. Link scheduled step to its event.
176. Update outcome when the event completes.
177. Detect blocked steps.
178. Detect outcomes with no next step.
179. Detect next step without reserved time.
180. Surface those gaps on Home.
181. Replace empty page with create-outcome composer and examples.

## P1 — Commitments utility

182. Create “I owe” from natural speech.
183. Create “waiting on” from natural speech.
184. Create “next conversation” context.
185. Parse person names conservatively.
186. Parse due dates.
187. Support no-date commitments.
188. Link commitments to outcomes.
189. Link commitments to calendar preparation events.
190. Schedule preparation time.
191. Mark commitment complete.
192. Defer with new date.
193. Show overdue and due-soon state.
194. Show how long the user has been waiting.
195. Use one list with three filters/lenses.
196. Remove four empty taxonomic sections.
197. Add search by person/title.
198. Add useful empty composer and examples.
199. Surface risky commitments on Home.
200. Ensure no CRM/contact-management creep.

## P1 — “What needs me now?”

201. Build a deterministic recommendation selector.
202. Use available time until next fixed/protected event.
203. Consider task duration.
204. Consider deadline proximity.
205. Consider outcome dependency order.
206. Consider commitment due date.
207. Exclude blocked work.
208. Exclude work that does not fit.
209. Return at most three candidates.
210. Prefer one primary recommendation.
211. Explain “why this” with concrete factors.
212. When nothing fits, recommend keeping the time free.
213. Keep Now embedded in Home and Today.

## P2 — Tide intelligence

214. Detect late current events.
215. Detect early completion.
216. Detect cancelled events opening space.
217. Detect new conflicts after event creation.
218. Calculate recovery proposals deterministically.
219. Keep fixed/protected events anchored.
220. Respect end-of-day boundary.
221. Preserve breathing room where feasible.
222. Minimize context switching.
223. Batch compatible small tasks.
224. Defer only eligible low-risk work.
225. Show exact affected items before risky commit.
226. Auto-apply only safe private flexible moves with undo.
227. Add “I am done at five.”
228. Add “I am 40 minutes behind.”
229. Add “I finished early.”
230. Add “give me breathing room.”
231. Add “make tomorrow less fragmented.”
232. Add what-if scenario preview.
233. Add accept/reject/try-another placement.

## P2 — Motion rescue

234. Delete the current segmented reclaimed-time line.
235. Remove persistent decorative SVG lines.
236. Implement one reusable Tide transition portal.
237. Implement responsive source/destination measurement.
238. Implement one cubic Bézier path.
239. Animate path length from source to destination.
240. Add one traveling marker.
241. Fade trail behind marker.
242. Remove path after settle.
243. Add Anchor choreography.
244. Add Bloom choreography.
245. Add transition cancellation.
246. Add exact reverse for undo where practical.
247. Add reduced-motion behavior.
248. Prevent text/path collision.
249. Prevent line-thickness scaling.
250. Capture 0/25/50/75/100% frames at three viewport sizes.
251. Visually inspect every captured frame.
252. Fail QA on path crossing, corners, residue, or unclear causality.

## P2 — UX polish

253. Remove route-wide status/error banners.
254. Remove duplicated helper text.
255. Keep key controls within thumb/keyboard reach.
256. Make direct manipulation discoverable without a tutorial.
257. Add optimistic visual preview without optimistic data commit.
258. Use one clarification at a time.
259. Preserve focus after route transitions.
260. Add strong keyboard coverage.
261. Ensure mobile command surface does not cover content.
262. Ensure command surface respects browser safe areas.
263. Ensure all empty states perform an action.
264. Ensure each route answers its core user question within three seconds.

## P3 — Deferred until green

265. Wake phrase research/prototype.
266. Native shell consideration for system-level wake behavior.
267. Provider calendar sync.
268. Real contacts integration.
269. Multi-device sync.
270. Accounts/authentication.
271. Mascot integration.
272. Expanded multilingual parsing.
273. Optional semantic planner/LLM fallback.

Do not begin P3 during this mission.
