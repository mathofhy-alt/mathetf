const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_PATH = path.join(__dirname, '학교목록.xlsx');
const TARGET_PATH = path.join(__dirname, 'src/lib/data.ts');

try {
    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Columns: 0: Sido, 1: Gugun, 2: School Name
    // Skip header (row 0)
    const dataRows = rows.slice(1);

    // Data Structures
    // regions: string[]
    // districts: Record<string, string[]>  (Sido -> Gugun List)
    // schools: Record<string, Record<string, string[]>> (Sido -> Gugun -> School List)

    const regionsSet = new Set();
    const districtsMap = {}; // Key: Sido, Value: Set<Gugun>
    const schoolsMap = {};   // Key: Sido, Value: Object { Gugun: [Schools] }

    dataRows.forEach(row => {
        const sido = row[0];
        const gugun = row[1];
        const schoolName = row[2];

        if (sido && gugun && schoolName) {
            regionsSet.add(sido);

            // Initialize District Map for Sido
            if (!districtsMap[sido]) {
                districtsMap[sido] = new Set();
            }
            districtsMap[sido].add(gugun);

            // Initialize Schools Map for Sido
            if (!schoolsMap[sido]) {
                schoolsMap[sido] = {};
            }
            // Initialize Schools List for Gugun
            if (!schoolsMap[sido][gugun]) {
                schoolsMap[sido][gugun] = [];
            }

            schoolsMap[sido][gugun].push(schoolName);
        }
    });

    // Sort Regions
    const regionsArray = Array.from(regionsSet).sort();

    // Sort Districts and Schools
    const finalDistrictsMap = {};

    regionsArray.forEach(sido => {
        // Sort districts for this Sido
        finalDistrictsMap[sido] = Array.from(districtsMap[sido]).sort();

        // Sort schools for each district in this Sido
        if (schoolsMap[sido]) {
            Object.keys(schoolsMap[sido]).forEach(gugun => {
                schoolsMap[sido][gugun].sort();
            });
        }
    });

    const fileContent = `
// Auto-generated file. Do not edit directly if possible.

export const allRegions = ${JSON.stringify(regionsArray, null, 2)};

export const allDistricts: Record<string, string[]> = ${JSON.stringify(finalDistrictsMap, null, 2)};

export const allSchools: Record<string, Record<string, string[]>> = ${JSON.stringify(schoolsMap, null, 2)};

export type FileItem = {
  id: string;
  title: string;
  type: 'PDF' | 'HWP';
  price: number;
  uploader: string;
  date: string;
  school: string;
  grade: number;
  sales: number;
};

// 샘플 데이터
export const sampleFiles: FileItem[] = [
  { id: '1', title: '2024년 1학기 중간고사 수학 기출', type: 'PDF', price: 1000, uploader: '수학의신', date: '2024-04-15', school: '서울고등학교', grade: 1, sales: 12 },
  { id: '2', title: '2023년 2학기 기말고사 수학 기출', type: 'HWP', price: 2000, uploader: '김선생', date: '2023-12-10', school: '서울고등학교', grade: 2, sales: 45 },
  { id: '3', title: '2024년 1학기 중간고사 영어 기출', type: 'PDF', price: 500, uploader: '영어마스터', date: '2024-04-20', school: '휘문고등학교', grade: 1, sales: 5 },
  { id: '4', title: '2023년 2학기 기말고사 과학 기출', type: 'HWP', price: 1500, uploader: '과학프로', date: '2023-12-05', school: '세화고등학교', grade: 3, sales: 20 },
  { id: '5', title: '2024년 수학 심화 예상문제', type: 'PDF', price: 1000, uploader: '수학의신', date: '2024-03-01', school: '현대고등학교', grade: 2, sales: 100 },
];
`;

    fs.writeFileSync(TARGET_PATH, fileContent, 'utf8');
    console.log('Successfully updated data.ts with ALL regions data.');
    console.log(`Regions: ${regionsArray.length}`);
    console.log(`Districts in Seoul: ${finalDistrictsMap['서울']?.length}`);

} catch (error) {
    console.error('Error processing Excel file:', error);
    process.exit(1);
}
