const assert = require('node:assert/strict');
const test = require('node:test');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {loadModule} = require('./helpers/module.cjs');
const {BUILDING_STYLES, buildingStyleIndex} = loadModule(readFileSync(join(__dirname, '../js/building-materials.js'), 'utf8'), {
  imports: {'./tsl-materials.js': {}}
});

test('named multi-storey photo palettes do not recolour unverified towers or other building uses',()=>{
  assert.equal(buildingStyleIndex({category:'residential',height:21,photoStyle:'linan-red'}),11);
  assert.equal(buildingStyleIndex({category:'residential',height:21,photoStyle:'shengyuan-pale'}),10);
  assert.equal(buildingStyleIndex({category:'residential',height:18,photoStyle:'wode-ochre'}),13);
  assert.equal(buildingStyleIndex({category:'residential',height:18,photoStyle:'sutong-cream'}),14);
  for(const b of [{category:'industrial',height:18},{category:'office',height:21},{category:'residential',height:60}]){
    assert.equal(buildingStyleIndex({...b,seed:1,photoStyle:'linan-red'}),buildingStyleIndex({...b,seed:1}));
  }
});

test('high residential blocks keep housing facades regardless of seed or height', () => {
  for (let seed = 0; seed < 100; seed++) {
    const style = BUILDING_STYLES[buildingStyleIndex({category:'residential',height:96,seed})];
    assert.equal(style.residential, 1);
    assert.equal(style.office, undefined);
    assert.equal(style.industrial, undefined);
  }
});

test('tagged offices, factories and public buildings use distinct facade proportions', () => {
  const styles = ['office','industrial','civic'].map(category => BUILDING_STYLES[buildingStyleIndex({category,seed:2})]);
  assert.equal(styles[0].office, 1);
  assert.equal(styles[1].industrial, 1);
  assert.ok(styles[1].bay > styles[0].bay);
  assert.equal(styles[2].office, undefined);
});

test('buildings in the same named community share a residential facade variant', () => {
  for (let seed = 0; seed < 30; seed++) {
    assert.equal(buildingStyleIndex({ category: 'residential', seed, styleVariant: 2 }), 2);
    assert.equal(buildingStyleIndex({ category: 'office', seed, styleVariant: 2 }), 4);
  }
});
