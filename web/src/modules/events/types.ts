import type {EventDefinition} from '../../contracts';
export type {EventTier, EventOutcome, EventResolution} from '../../contracts';
export type EventTrigger = {kind: 'node'; interactionId: string} | {kind: 'random'; mapId: string; dangerLevel: 0 | 1 | 2 | 3; drawnEventIds: readonly string[]};
export interface EventContext {event: EventDefinition; catIds: readonly string[]; flags: readonly string[]; trigger?: EventTrigger}
export interface EventSelection {eventId: string; optionId: string}
