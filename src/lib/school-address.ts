import directory from './school-addresses.json';

const regionNames: Record<string, string> = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천',
  광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종',
  경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남',
  전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남',
  제주도: '제주', 제주특별자치도: '제주',
  '전남광주통합특별시(전남)': '전남', '전남광주통합특별시(광주)': '광주',
};
const normalizeRegion = (value: string) => regionNames[value.trim()] || value.trim();

/** Never guess between namesake schools. Missing/ambiguous addresses stay hidden. */
export function getSchoolAddress(school: string, region?: string | null, district?: string | null): string | null {
  const name = school === '동산고등학교' && region && normalizeRegion(region) === '경기' && district?.startsWith('안산시')
    ? '안산동산고등학교' : school;
  let matches = directory.records.filter(item => item.name === name);
  if (region?.trim()) matches = matches.filter(item => normalizeRegion(item.region) === normalizeRegion(region));
  if (matches.length > 1 && district?.trim()) {
    const tokens = district.trim().split(/\s+/);
    matches = matches.filter(item => tokens.every(token => item.address.split(/\s+/).includes(token)));
  }
  return matches.length === 1 ? matches[0].address : null;
}
