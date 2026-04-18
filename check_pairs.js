const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

s.from('exam_materials')
  .select('id, title, school, grade, exam_year, file_type, content_type')
  .in('file_type', ['HWP', 'PDF'])
  .then(r => {
    const data = r.data || [];
    const groups = {};

    data.forEach(f => {
      const key = [f.school, f.grade, f.exam_year, f.content_type].join('|');
      if (!groups[key]) groups[key] = { pdf: null, hwp: null, title: f.title, school: f.school, grade: f.grade, year: f.exam_year, ctype: f.content_type };
      groups[key][f.file_type.toLowerCase()] = f.id;
    });

    const pdfOnly = [];
    const hwpOnly = [];

    Object.values(groups).forEach(g => {
      if (g.pdf && !g.hwp) pdfOnly.push(g);
      if (!g.pdf && g.hwp) hwpOnly.push(g);
    });

    console.log('PDF만 있고 HWP 없는 것:', pdfOnly.length, '개');
    pdfOnly.forEach(g => console.log(' -', g.year, g.school, g.grade + '학년', g.ctype));

    console.log('\nHWP만 있고 PDF 없는 것:', hwpOnly.length, '개');
    hwpOnly.forEach(g => console.log(' -', g.year, g.school, g.grade + '학년', g.ctype));

    console.log('\n전체 그룹 수:', Object.keys(groups).length);
  });
