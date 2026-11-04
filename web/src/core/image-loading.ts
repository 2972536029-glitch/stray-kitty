type ImageRequest = {
  image:HTMLImageElement;
  url:string;
  promise:Promise<HTMLImageElement>;
  resolve:(image:HTMLImageElement)=>void;
  reject:(reason:Error)=>void;
  status:'queued'|'active'|'finished'|'cancelled';
};

type ImageRequests = {
  active?:ImageRequest;
  queued?:ImageRequest;
  latest?:ImageRequest;
};

function createImageQueue(){
  const requests=new WeakMap<HTMLImageElement,ImageRequests>();
  const pending:ImageRequest[]=[];
  const activeRequests=new Set<ImageRequest>();
  const maximumActive=2;
  let pumpScheduled=false;

  function priority(image:HTMLImageElement):number{
    return image.fetchPriority==='high'?2:image.fetchPriority==='low'?0:1;
  }

  function schedulePump():void{
    if(pumpScheduled)return;
    pumpScheduled=true;
    queueMicrotask(pump);
  }

  function start(request:ImageRequest):void{
    const state=requests.get(request.image)!;
    state.queued=undefined;
    state.active=request;
    request.status='active';
    activeRequests.add(request);
    const finish=(error?:Error)=>{
      if(request.status!=='active')return;
      request.status='finished';
      // Capture runs before existing onload/onerror handlers. Remove both old
      // listeners before a handler can enqueue a fallback on the same Image.
      request.image.removeEventListener('load',loaded,{capture:true});
      request.image.removeEventListener('error',failed,{capture:true});
      state.active=undefined;
      activeRequests.delete(request);
      if(error)request.reject(error);
      else request.resolve(request.image);
      schedulePump();
    };
    const loaded=()=>finish();
    const failed=()=>finish(new Error('Image failed to load.'));
    request.image.addEventListener('load',loaded,{capture:true});
    request.image.addEventListener('error',failed,{capture:true});
    try{
      // An empty Image reports complete=true. Only this request's load/error
      // event can finish it; never use complete as a shortcut before assigning src.
      request.image.src=request.url;
    }catch(error){
      finish(error instanceof Error?error:new Error('Image source assignment failed.'));
    }
  }

  function pump():void{
    pumpScheduled=false;
    while(activeRequests.size<maximumActive){
      let next=-1;
      for(let index=0;index<pending.length;index++){
        const request=pending[index];
        if(requests.get(request.image)?.active)continue;
        // Read the live priority each time a slot opens. Keeping the earlier
        // index on ties preserves FIFO, including a later priority promotion.
        if(next<0||priority(request.image)>priority(pending[next].image))next=index;
      }
      if(next<0)return;
      const [request]=pending.splice(next,1);
      start(request);
      // Cached/test images may finish synchronously during src assignment. Give
      // fallback handlers and promise consumers their microtask before pumping on.
      if(request.status!=='active')return;
    }
  }

  function cancel(request:ImageRequest):void{
    const index=pending.indexOf(request);
    if(index>=0)pending.splice(index,1);
    const state=requests.get(request.image)!;
    state.queued=undefined;
    if(state.latest===request)state.latest=state.active;
    request.status='cancelled';
    request.reject(new DOMException('Image request cancelled before starting.','AbortError'));
  }

  /**
   * Queue a load without replacing existing handlers. The same Image/URL shares
   * its result, including failure; repeated calls do not silently retry downloads.
   */
  function queueImage(image:HTMLImageElement,url:string):Promise<HTMLImageElement>{
    let state=requests.get(image);
    if(!state){state={};requests.set(image,state);}
    if(state.queued?.url===url)return state.queued.promise;
    if(state.active?.url===url)return state.active.promise;
    if(state.latest?.url===url)return state.latest.promise;
    // Keep only the newest not-yet-started URL for an Image. An active request
    // must finish naturally before the replacement can receive its own slot.
    if(state.queued)cancel(state.queued);
    let resolve!:(image:HTMLImageElement)=>void;
    let reject!:(reason:Error)=>void;
    const promise=new Promise<HTMLImageElement>((yes,no)=>{resolve=yes;reject=no;});
    // Existing callback-based loaders may intentionally ignore this promise.
    // Mark rejection handled internally while returning the original to awaiters.
    void promise.catch(()=>{});
    const request:ImageRequest={image,url,promise,resolve,reject,status:'queued'};
    state.queued=request;
    state.latest=request;
    pending.push(request);
    schedulePump();
    return promise;
  }

  /** Cancel only a pending URL; an in-flight transfer keeps its slot until finish. */
  function cancelQueuedImage(image:HTMLImageElement):boolean{
    const request=requests.get(image)?.queued;
    if(!request)return false;
    cancel(request);
    schedulePump();
    return true;
  }

  return {queueImage,cancelQueuedImage};
}

export const {queueImage,cancelQueuedImage}=createImageQueue();
// Keep two independent battle slots so background preloads cannot starve visible art.
// Both lanes stay bounded: at most four large image transfers leave room for APIs.
export const queueBattleImage=createImageQueue().queueImage;
