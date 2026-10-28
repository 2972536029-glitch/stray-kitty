import type {GameCommand} from '../contracts';

export const startChapter2Command = ():GameCommand => ({type:'START_STORY',nodeId:'market_intro_1'});
export const exploreChapter2Command = ():GameCommand => ({type:'GO_EXPLORE',mapId:'market'});
