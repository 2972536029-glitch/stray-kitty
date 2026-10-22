import type {EventDefinition} from '../../contracts';
export interface EventContext {event: EventDefinition; catIds: readonly string[]; flags: readonly string[]}
export interface EventSelection {eventId: string; optionId: string}
