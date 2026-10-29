import type {GameCommand} from '../contracts';
import {chapterExploreCommand, chapterStoryCommand} from '../core/chapter-navigation';

export const startChapter2Command = ():GameCommand => chapterStoryCommand('market');
export const exploreChapter2Command = ():GameCommand => chapterExploreCommand('market');
