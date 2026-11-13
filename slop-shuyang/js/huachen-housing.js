import { createBuildingFootprints } from './building-footprints.js';

// Four visible high-rise masses. The western pair has one connected map
// silhouette: keep a low connector instead of extruding the entire strip tall.
// Height, connector elevation and core separation are explicit display estimates.
export function buildHuachenHousing({ctxFor,sourceBody,M,colliders,facadeMaterial}) {
  const c=ctxFor('华辰大厦沿街楼群');
  if(!c)return;
  c.g.userData.photoBasis='Labelled AMap 1–4 building blocks + satellite + Wuli sports-ground exterior photographs; 78 m estimated, not measured';
  sourceBody(c,M.offWhite,c.s.podiumHeight,{residential:true});
  for(const part of c.s.towerParts){
    const points=part.outer.map(([x,z])=>({x,z}));
    const local=points.map(p=>({x:p.x-c.s.x,z:p.z-c.s.z}));
    const mesh=createBuildingFootprints(facadeMaterial,[{
      height:c.s.towerHeight,baseHeight:c.s.podiumHeight,levels:0,
      cx:0,cz:0,seed:337,tone:.5,polygons:[{outer:local,holes:[]}]
    }]);
    mesh.name=part.name;mesh.userData.geometryBasis=c.s.geometryNote;c.g.add(mesh);
    colliders.push({minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
      minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z)),
      minY:c.s.podiumHeight,maxY:c.s.towerHeight+.22,polygon:{outer:points,holes:[]},sourceFootprint:true});
  }
  for(const sourceId of c.s.eastSourceIds)
    sourceBody({...c,s:{...c.s,sourceId}},M.offWhite,c.s.towerHeight,{residential:true});
}
