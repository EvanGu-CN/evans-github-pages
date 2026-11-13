import { createPreWarBuildingMaterial, createCurtainWallMaterial } from './tsl-materials.js';

// Regional appearance presets, not claims about photographed facade colours.
// Housing keeps rendered plaster, recessed windows, sills and AC units instead of office curtain walls.
const BUILDING_STYLES = [
  { wall: 0xd5d1c4, base: 0x9b9a90, roof: 0x64696a, bay: 3.2, floor: 3.0, residential: 1 },
  { wall: 0xbfc4c1, base: 0x828b89, roof: 0x5c6468, bay: 3.0, floor: 3.0, residential: 1 },
  { wall: 0xc8b99e, base: 0x807b70, roof: 0x62676a, bay: 3.3, floor: 3.0, residential: 1 },
  { wall: 0xd3d3c9, base: 0x737e80, roof: 0x697277, bay: 3.6, floor: 3.8, commercial: 1 },
  { wall: 0x9daeb4, base: 0x60727a, roof: 0x596871, bay: 2.1, floor: 3.6, office: 1 },
  { wall: 0xa6b3b5, base: 0x75868a, roof: 0x517384, bay: 4.5, floor: 5.0, industrial: 1 },
  { wall: 0xd9d5c8, base: 0x9a9f9b, roof: 0x6b7479, bay: 3.2, floor: 3.6 },
  { wall: 0xd4d0c3, base: 0x99988c, roof: 0x6e6258, bay: 3.0, floor: 3.0 },
  { wall: 0xb7bcb9, base: 0x929b96, roof: 0x687b84, bay: 4.0, floor: 3.5, industrial: 1 },
  { wall: 0x8f989e, base: 0xd6dce0, roof: 0x606d76, bay: 3.2, floor: 3.6 },
  // Named street photographs: pale housing and orange-red Lin'an slabs.
  { wall: 0xe2d8c4, base: 0xa1705c, roof: 0x725c50, bay: 3.1, floor: 3.0, residential: 1 },
  { wall: 0xc37f63, base: 0xeee5d7, roof: 0x865d51, bay: 3.1, floor: 3.0, residential: 1 },
  { wall: 0xd8d3ca, base: 0xc98277, roof: 0x71665d, bay: 3.1, floor: 3.0, residential: 1 },
  { wall: 0xd6c8aa, base: 0x737571, roof: 0x626969, bay: 3.1, floor: 3.0, residential: 1 },
  { wall: 0xe1d7b6, base: 0x93958b, roof: 0x68716d, bay: 3.1, floor: 3.0, residential: 1 }
];

function buildingStyleIndex(b) {
  // These photos establish the multi-storey housing type only; nearby towers,
  // factories and shops must not inherit its facade just from a context polygon.
  if(['residential','house'].includes(b.category)&&b.height>=12&&b.height<=27){
    if(b.photoStyle==='shengyuan-pale')return 10;
    if(b.photoStyle==='linan-red')return 11;
    if(b.photoStyle==='junlin-peach')return 12;
    if(b.photoStyle==='wode-ochre')return 13;
    if(b.photoStyle==='sutong-cream')return 14;
  }
  const variant = ((b.styleVariant ?? b.seed ?? 0) % 3 + 3) % 3;
  return ({ residential: variant, commercial: 3, office: 4, industrial: 5, civic: 6, house: 7, garage: 8 })[b.category]
    ?? (b.height >= 45 ? variant : 0);
}

function createBuildingMaterials() {
  return BUILDING_STYLES.map((style, i) => {
    if (style.office) return createCurtainWallMaterial({
      glassTint: 0x344f5e, frameTint: 0x9aa5a9, windowWidth: style.bay,
      floorHeight: style.floor, litProbability: .26, warmth: .6, footprintLocal: true, seed: 42
    });
    return createPreWarBuildingMaterial({
      stoneColor: style.wall, trimColor: style.base, windowGlassColor: 0x253a46,
      roofColor: style.roof,
      windowWidth: style.bay, floorHeight: style.floor,
      windowRatioX: style.industrial ? .76 : style.residential ? .64 : .58,
      windowRatioY: style.industrial ? .3 : .62,
      litProbability: style.industrial ? .08 : .3,
      warmth: .75, footprintLocal: true, cornerPier: .28,
      plasterFacade: true, seed: 20 + i*13
    });
  });
}

export { BUILDING_STYLES, buildingStyleIndex, createBuildingMaterials };
