import type {ReactNode} from 'react';
import GameIcon,{type GameIconName} from './GameIcon';

export default function WindowHeading({title,icon,description,meta,actions,className=''}:{title:string;icon:GameIconName;description?:string;meta?:ReactNode;actions?:ReactNode;className?:string}) {
  return <header className={`window-heading ${className}`}>
    <div className="window-heading-copy"><div className="window-heading-title"><h2><GameIcon name={icon}/>{title}</h2>{meta}</div>{description&&<p>{description}</p>}</div>
    {actions&&<div className="window-heading-actions">{actions}</div>}
  </header>;
}
