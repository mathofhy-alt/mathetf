import type { WeeklyUpload } from '@/lib/home-weekly-uploads';

export default function ThisWeekUploads({ week }: { week: WeeklyUpload }) {
    return <div className="this-week-uploads" aria-label="이번 주 새로 등록된 학교 내신기출 시험지">
        <span className="this-week-uploads-label"><span className="this-week-uploads-dot" aria-hidden="true" />이번 주 새로 올라온 학교 기출</span>
        <strong>{week.count.toLocaleString()}<small>회차</small></strong>
    </div>;
}
