(()=>{
 'use strict';
 const $=id=>document.getElementById(id),video=$('camera'),canvas=document.createElement('canvas');
 let worker=null,stream=null,epoch=0,seq=0,pending=null,timer=null,phase='idle',scanOnly=false,good=0,attempts=0,started=0;
 const text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
 function controls(active){$('start').hidden=active;$('detect').hidden=active;$('stop').hidden=!active;$('capture').hidden=true;$('ready').hidden=true;}
 function clear(){epoch++;clearTimeout(timer);timer=null;worker?.terminate();worker=null;if(pending){pending.reject(Error('stopped'));pending=null;}stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.hidden=true;canvas.width=canvas.height=0;phase='idle';good=attempts=0;controls(false);$('progress').hidden=true;}
 function finish(heading,status){clear();text('heading',heading);text('status',status);text('detail','Camera off. Temporary face data released.');text('step','No sign-in pass was made.');}
 function request(type,frame){return new Promise((resolve,reject)=>{if(!worker||pending)return reject(Error('busy'));const id=++seq;pending={id,resolve,reject};worker.postMessage({id,type,...frame},frame?[frame.buffer]:[]);});}
 function deadline(ms,message){clearTimeout(timer);timer=setTimeout(()=>finish('Check stopped',message),ms);}
 async function camera(facing,token){
  stream?.getTracks().forEach(t=>t.stop());video.srcObject=null;
  const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:480}}});
  if(token!==epoch){next.getTracks().forEach(t=>t.stop());return false;}
  stream=next;video.srcObject=next;video.hidden=false;await video.play();
  for(let i=0;i<100&&token===epoch;i++){if(video.videoWidth&&video.readyState>=2)return true;await new Promise(r=>setTimeout(r,50));}
  if(token!==epoch)return false;throw Error('camera');
 }
 function frame(){const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);if(!canvas.width||!canvas.height)throw Error('frame');const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);ctx.clearRect(0,0,canvas.width,canvas.height);return{width:canvas.width,height:canvas.height,buffer:pixels.data.buffer};}
 async function start(only){
  clear();scanOnly=only;const token=epoch;controls(true);text('heading','Loading FacePlugin');text('status','Keep this page open. The first load needs about 23 MB.');text('step','Models load before the camera opens.');text('detail','');deadline(90000,'The face tools could not finish loading. Check your connection and try again.');
  try{
   worker=new Worker('fp-worker.js?v=05');
   worker.onmessage=({data:r})=>{if(token!==epoch)return;if(r.type==='loading'){text('detail',`Loading ${{detect:'face finder',landmark:'face points',feature:'face match',liveness:'photo check'}[r.name]||'tools'}…`);return;}if(r.id!==pending?.id)return;const p=pending;pending=null;r.type==='error'?p.reject(Error('model')):p.resolve(r);};
   worker.onerror=()=>{if(token===epoch)finish('Face tools could not start','Try reloading this page in Safari. No check passed.');};
   await request('init');if(token!==epoch)return;
   text('heading',only?'Test the front camera':'Show the ID photo');text('status',only?'Put your face in the middle. Tap “I’m ready” when you can see it.':'Use the rear camera. Fill most of the view with the ID photo. You can cover its name and numbers.');
   if(!await camera(only?'user':'environment',token))return;
   clearTimeout(timer);text('detail','');text('step',only?'This checks face detection only.':'Step 1 of 2 · Read the ID photo');phase=only?'preview':'id';$(only?'ready':'capture').hidden=false;
  }catch(e){if(token===epoch)finish('Could not start','Allow camera access in Safari, then try again. Face tools may also have failed to load.');}
 }
 $('capture').onclick=async()=>{
  if(phase!=='id')return;phase='reading';$('capture').hidden=true;const token=epoch;text('status','Reading the ID photo on this phone…');deadline(15000,'The ID photo took too long to read. Try brighter light and less glare.');
  try{const r=await request('id',frame());if(token!==epoch)return;clearTimeout(timer);
   if(!r.saved){phase='id';$('capture').hidden=false;text('status',r.count>1?'More than one face found. Show just the main ID photo.':r.small?'Move closer to the ID photo.':'No face found. Show the ID photo clearly, then tap again.');return;}
   text('heading','Now show your face');text('status','Put the ID down. Look at the front camera. Tap “I’m ready” when you can see your face.');text('detail',`ID photo read in ${(r.ms/1000).toFixed(1)} seconds.`);text('step','Step 2 of 2 · Compare your face');deadline(15000,'The front camera did not start. Try again.');
   if(!await camera('user',token))return;clearTimeout(timer);phase='preview';$('ready').hidden=false;
  }catch(e){if(token===epoch)finish('ID check stopped','The face reader could not finish. No check passed.');}
 };
 $('ready').onclick=async()=>{
  if(phase!=='preview')return;phase='scanning';$('ready').hidden=true;good=attempts=0;started=Date.now();const token=epoch;
  text('heading',scanOnly?'Looking for your face':'Comparing your face');text('status','Look straight at the camera. Keep the phone still.');$('progress').hidden=false;$('progress').value=0;deadline(30000,'The scan stopped after 30 seconds. Try “Test camera only” to see whether the face reader can find you.');
  try{while(token===epoch&&phase==='scanning'){
   const r=await request(scanOnly?'detect':'face',frame());if(token!==epoch)return;attempts++;
   const found=r.count===1&&!r.small,match=Number.isFinite(r.similarity)&&r.similarity>=0.5,live=Number.isFinite(r.liveness)&&r.liveness>=0.3;
   good=(found&&(scanOnly||match&&live))?good+1:0;$('progress').value=good;
   text('detail',`Scan ${attempts} · ${(r.ms/1000).toFixed(1)} seconds · ${found?'Face found':r.count>1?'More than one face':r.small?'Move closer':'No face found'} · ${good}/3 clear views`);
   if(good>=3){finish(scanOnly?'Camera test worked':'Sample face check passed',scanOnly?'FacePlugin found a face in three views. This does not prove that the face is live.':'The faces look alike to this test. Its live-face check can be fooled by a photo. This is not proof of a real person.');return;}
   if(attempts>=8&&Date.now()-started>7000&&found&&!scanOnly){text('status',!match?'A face was found, but it does not match well enough yet. Look straight ahead in good light.':'A face was found. The photo check has not passed yet. Keep your face clear and well lit.');}
   await new Promise(r=>setTimeout(r,700));
  }}catch(e){if(token===epoch)finish('Face check stopped','The face tools could not finish this scan. No check passed.');}
 };
 $('start').onclick=()=>start(false);$('detect').onclick=()=>start(true);$('stop').onclick=()=>finish('Check cleared','You can start again when you are ready.');
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&worker)finish('Check cleared','The page was hidden, so the camera stopped.');});
 addEventListener('pagehide',()=>clear());
})();
