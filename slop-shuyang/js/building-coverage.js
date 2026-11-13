import polygonClipping from './vendor/polygon-clipping.js';

const ringArea = ring => Math.abs(ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p.x*q.z-q.x*p.z},0)/2);
const area = polygons => polygons.reduce((a,p)=>a+ringArea(p.outer)-(p.holes||[]).reduce((s,h)=>s+ringArea(h),0),0);
const multi = polygons => polygons.map(p=>[p.outer,...(p.holes||[])].map(r=>r.map(p=>[p.x,p.z])));
const intersects = (a,b) => a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ;

// Subtract the model's actual occupied ground outline, never an entire source
// building merely because one corner touches a gate, wing or landmark podium.
function preserveBuildingCoverage(buildings, replacements, colliders) {
  const cutters=colliders.filter(c=>!c.sourceFootprint&&(c.maxY??Infinity)>1).map(c=>({...c,
    geometry:multi([c.polygon||{outer:[{x:c.minX,z:c.minZ},{x:c.maxX,z:c.minZ},{x:c.maxX,z:c.maxZ},{x:c.minX,z:c.maxZ}],holes:[]}])
  }));
  const rendered=[], audit={source:buildings.length,rendered:0,explicitReplacements:[],fullyCovered:[],clipped:[],clipFailures:[]};
  buildings.forEach((b,index)=>{
    if(replacements.has(b)){audit.explicitReplacements.push(index);return}
    const hits=cutters.filter(c=>intersects(b,c));
    if(!hits.length){rendered.push(b);return}
    try{
      const result=polygonClipping.difference(multi(b.polygons),...hits.map(c=>c.geometry));
      const polygons=result.map(p=>({outer:p[0].slice(0,-1).map(([x,z])=>({x,z})),
        holes:p.slice(1).map(r=>r.slice(0,-1).map(([x,z])=>({x,z})))})).filter(p=>area([p])>.01);
      const before=area(b.polygons),after=area(polygons);
      if(before-after<.01){rendered.push(b);return}
      if(!polygons.length){audit.fullyCovered.push(index);return}
      const points=polygons.flatMap(p=>p.outer),xs=points.map(p=>p.x),zs=points.map(p=>p.z);
      rendered.push({...b,polygons,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs),sourceRecord:b});
      audit.clipped.push({index,sourceAreaM2:Math.round(before*10)/10,retainedAreaM2:Math.round(after*10)/10});
    }catch(error){
      // A numerical clipping failure must never make a real building disappear.
      rendered.push(b);audit.clipFailures.push({index,message:String(error.message)});
    }
  });
  audit.rendered=rendered.length;
  audit.replacedByLandmarks=audit.explicitReplacements.length+audit.fullyCovered.length;
  return {rendered,audit};
}

export { preserveBuildingCoverage };
