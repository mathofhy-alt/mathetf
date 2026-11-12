// [11/12 대표] 「내 시험지 보관함」 — 어디서 누르든 시험지 만들기 화면에서 '만든 시험지' 보관함 폴더 창이 바로 열린다.
//   다른 페이지에서는 /question-bank?open=exams 로 들어가고(페이지가 열리며 창을 띄운 뒤 주소에서 ?open 을 지운다),
//   이미 시험지 만들기 화면이면 이동 없이 이벤트로 창만 연다(같은 주소로 이동하면 화면이 다시 그려지지 않아 창이 안 뜬다).
import type React from 'react';

export const STORAGE_HREF = '/question-bank?open=exams';
export const OPEN_STORAGE_EVENT = 'qb-open-storage';

export function openStorageHere(e: React.MouseEvent) {
    if (typeof window === 'undefined' || window.location.pathname !== '/question-bank') return;
    e.preventDefault();
    window.dispatchEvent(new Event(OPEN_STORAGE_EVENT));
}
