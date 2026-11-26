// Classes named by data, each defined in src/styles.css: the state of a
// service or a day ("s-major"), the step of an incident
// ("step-monitoring"), the kind of an entry ("entry-group"). Written here
// so that every class a page names in its markup is a whole word.
export const tone = (state: string): string => `s-${state}`;
export const stepClass = (name: string): string => `step-${name}`;
export const entry = (kind: string): string => `entry-${kind}`;
// An incident's colour: a maintenance is always "maintenance".
export const incidentTone = (kind: string, impact: string): string => tone(kind === "maintenance" ? "maintenance" : impact);
