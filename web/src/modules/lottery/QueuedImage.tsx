import {useEffect,useRef,useState,type ComponentProps} from 'react';
import {cancelQueuedImage,queueImage} from '../../core/image-loading';

type Props=Omit<ComponentProps<'img'>,'src'|'srcSet'> & {url:string;hideUntilReady?:boolean};

// The displayed element owns the queued request; CSS never starts another download.
export default function QueuedImage({url,hideUntilReady=false,style,...props}:Props){
  const ref=useRef<HTMLImageElement>(null),[ready,setReady]=useState<string>();
  useEffect(()=>{
    let mounted=true;
    const image=ref.current!;
    void queueImage(image,url).then(()=>{if(mounted)setReady(url);}).catch(()=>{/* Keep the existing artwork fallback. */});
    return()=>{mounted=false;cancelQueuedImage(image);};
  },[url]);
  // A new URL gets a new node, so an old active request cannot show the wrong furniture.
  return <img key={url} {...props} ref={ref} style={hideUntilReady&&ready!==url?{...style,visibility:'hidden'}:style}/>;
}

export function PostalJournalBackdrop(){
  return <span className="postal-journal-backdrop" aria-hidden="true"><QueuedImage url="/assets/lottery/postal-journal-base.png" alt="" hideUntilReady/></span>;
}
