SELECT id, title, school, year, grade, semester, subject FROM exam_materials WHERE file_type = 'DB' AND school LIKE '%영동일%';
SELECT id, school, year, grade, semester, subject, work_status FROM questions WHERE school LIKE '%영동일%' LIMIT 10;
