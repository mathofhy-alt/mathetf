require('./register.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {matchesCatalogSearch}=require('../src/lib/catalog-search.ts');
const pairs=[
 ['단대부고','단국대학교사범대학부속고등학교'],
 ['숙명여고','숙명여자고등학교'],
 ['진선여고','진선여자고등학교'],
 ['경기여고','경기여자고등학교'],
 ['분당영덕여고','분당영덕여자고등학교'],
 ['진명여고','진명여자고등학교'],
];
for(const [alias,school] of pairs)test(`${alias}: alias and full name return identical records`,()=>{
 const items=[{id:1,school,year:2025},{id:2,school,year:2024},{id:3,school:'휘문고등학교'}];
 const ids=q=>items.filter(item=>matchesCatalogSearch(item,q)).map(item=>item.id);
 assert.deepEqual(ids(alias),[1,2]);assert.deepEqual(ids(alias),ids(school));
 assert.deepEqual(ids(' '+alias.split('').join(' ')+' '),[1,2]);
});
test('Existing title, school, year and subject searches remain available',()=>{
 const item={school:'휘문고등학교',title:'2025년 고1 1학기 중간고사 수학',year:2025,grade:1,semester:1,examType:'중간고사',subject:'공통수학1'};
 for(const q of ['휘문고','휘문 고등학교','2025','２０２５','중간고사','공통 수학1','고1 1학기','   ',''])assert.equal(matchesCatalogSearch(item,q),true,q);
 assert.equal(matchesCatalogSearch(item,'기말고사'),false);
 assert.equal(matchesCatalogSearch(item,'숙명여고'),false);
});
test('Namesake school results retain identity and can be independently region-filtered',()=>{
 const items=[{id:1,school:'중앙고등학교',region:'서울'},{id:2,school:'중앙고등학교',region:'부산'},{id:3,school:'중앙여자고등학교',region:'서울'}];
 const results=items.filter(item=>matchesCatalogSearch(item,'중앙고'));
 assert.deepEqual(results.map(item=>item.id),[1,2]);
 assert.deepEqual(results.filter(item=>item.region==='서울').map(item=>item.id),[1]);
 assert.equal(items[0].school,'중앙고등학교');
});
