import type {BattleSceneId} from './scene-art';
import {paintMarketObstacleScenery,MARKET_JOINED_OBSTACLE_CELLS} from './scene-market-obstacles';
import {paintAlleyObstacleScenery,paintGreenhouseObstacleScenery,ALLEY_JOINED_OBSTACLE_CELLS,GREENHOUSE_JOINED_OBSTACLE_CELLS} from './scene-garden-alley-obstacles';
import {paintTunnelObstacleScenery,paintFinaleObstacleScenery,TUNNEL_JOINED_OBSTACLE_CELLS,FINALE_JOINED_OBSTACLE_CELLS} from './scene-industrial-obstacles';

const noCells:readonly {x:number;y:number}[]=[];
export function getJoinedObstacleCells(scene:BattleSceneId){
  switch(scene){
    case 'alley':return ALLEY_JOINED_OBSTACLE_CELLS;
    case 'market':return MARKET_JOINED_OBSTACLE_CELLS;
    case 'greenhouse':return GREENHOUSE_JOINED_OBSTACLE_CELLS;
    case 'tunnel':return TUNNEL_JOINED_OBSTACLE_CELLS;
    case 'finale':return FINALE_JOINED_OBSTACLE_CELLS;
    default:return noCells;
  }
}

/** The live canvas and background call the same world-space painting. Each
 * layer clips its own portion, so a building can cross the old board boundary. */
export function paintConnectedObstacleScenery(ctx:CanvasRenderingContext2D,scene:BattleSceneId){
  switch(scene){
    case 'alley':paintAlleyObstacleScenery(ctx);break;
    case 'market':paintMarketObstacleScenery(ctx);break;
    case 'greenhouse':paintGreenhouseObstacleScenery(ctx);break;
    case 'tunnel':paintTunnelObstacleScenery(ctx);break;
    case 'finale':paintFinaleObstacleScenery(ctx);break;
  }
}
