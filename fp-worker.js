/* All camera pixels and the temporary ID template stay in this worker. */
importScripts('ort.wasm.min.js');
let sessions, reference, busy=false;
function cosine(a,b){
 if(!a||!b||a.length!==512||b.length!==512)return null;
 let ab=0,aa=0,bb=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))return null;ab+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
 return aa>0&&bb>0?Math.max(-1,Math.min(1,ab/Math.sqrt(aa*bb))):null;
}
async function initialize(){
 await new Promise((resolve,reject)=>{
  self.Module={locateFile:n=>new URL(n,self.location.href).href,onRuntimeInitialized:resolve,onAbort:()=>reject(Error('opencv'))};
  importScripts('opencv.js');
  if(self.cv?.Mat)resolve();
 });
 importScripts('fp-sdk.js');
 ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
 ort.env.wasm.wasmPaths=new URL('./',self.location.href).href;
 sessions={};
 for(const name of ['detect','landmark','feature','liveness']){
  postMessage({type:'loading',name});
  sessions[name]=await ort.InferenceSession.create(`fr_${name}.onnx`,{executionProviders:['wasm']});
 }
}
self.onmessage=async({data:m})=>{
 if(busy)return;busy=true;let pixels;
 try{
  if(m.type==='init'){await initialize();postMessage({id:m.id,type:'ready'});return;}
  if(!sessions||!['id','face','detect'].includes(m.type))throw Error('state');
  pixels=new Uint8ClampedArray(m.buffer);
  if(m.width<1||m.height<1||m.width>1280||m.height>1280||pixels.length!==m.width*m.height*4)throw Error('frame');
  const frame={width:m.width,height:m.height,data:pixels},started=performance.now();
  const found=await FacePlugin.detectFace(sessions.detect,frame);
  const result={id:m.id,type:'result',count:found.size};
  if(found.size===1){
   const box=Array.from(found.bbox.data).slice(0,4);result.box=box;
   if(box.some(x=>!Number.isFinite(x))||box[2]-box[0]<50||box[3]-box[1]<50){result.small=true;}
   else if(m.type!=='detect'){
    const landmarks=await FacePlugin.predictLandmark(sessions.landmark,frame,found.bbox);
    const output=await FacePlugin.extractFeature(sessions.feature,frame,landmarks);
    const tensor=Object.values(output[0])[0], feature=new Float32Array(tensor.data);
    if(cosine(feature,feature)===null)throw Error('feature');
    if(m.type==='id'){reference?.fill(0);reference=feature;result.saved=true;}
    else{
     result.similarity=cosine(reference,feature);feature.fill(0);
     const live=await FacePlugin.predictLiveness(sessions.liveness,frame,found.bbox);
     result.liveness=live[0]?.[4];
    }
    for(const t of Object.values(output[0]))t.data.fill(0);
    for(const l of landmarks)l.fill(0);
   }
  }
  result.ms=Math.round(performance.now()-started);postMessage(result);
 }catch(e){postMessage({id:m.id,type:'error',code:'check-failed'});}
 finally{pixels?.fill(0);busy=false;}
};
