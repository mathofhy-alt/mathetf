// 전역 변수
let sessionId = null;
let problems = [];
let selectedIds = new Set();

// DOM 요소
const fileInput = document.getElementById('file-input');
const uploadArea = document.getElementById('upload-area');
const uploadStatus = document.getElementById('upload-status');
const problemsSection = document.getElementById('problems-section');
const problemsList = document.getElementById('problems-list');
const toggleAllBtn = document.getElementById('toggle-all-btn');
const countBadge = document.getElementById('count-badge');
const downloadSection = document.getElementById('download-section');
const generateBtn = document.getElementById('generate-btn');
const downloadStatus = document.getElementById('download-status');

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

// 이벤트 리스너 설정
function setupEventListeners() {
    // 파일 입력
    fileInput.addEventListener('change', handleFileSelect);

    // 드래그 앤 드롭
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    // 전체 선택/해제
    toggleAllBtn.addEventListener('click', toggleAllProblems);

    // 생성 버튼
    generateBtn.addEventListener('click', generateHwpx);
}

// 파일 선택 핸들러
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        uploadFile(file);
    }
}

// 드래그 오버 핸들러
function handleDragOver(event) {
    event.preventDefault();
    uploadArea.classList.add('drag-over');
}

// 드래그 리브 핸들러
function handleDragLeave(event) {
    event.preventDefault();
    uploadArea.classList.remove('drag-over');
}

// 드롭 핸들러
function handleDrop(event) {
    event.preventDefault();
    uploadArea.classList.remove('drag-over');

    const file = event.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.hwpx')) {
        uploadFile(file);
    } else {
        showStatus(uploadStatus, 'HWPX 파일만 업로드 가능합니다.', 'error');
    }
}

// 파일 업로드
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    showStatus(uploadStatus, '파일 업로드 중...', 'info');

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '업로드 실패');
        }

        sessionId = data.session_id;
        problems = data.problems;

        showStatus(uploadStatus, `✅ ${data.total_count}개의 문제를 찾았습니다!`, 'success');
        displayProblems(problems);

    } catch (error) {
        console.error('Upload error:', error);
        showStatus(uploadStatus, `❌ ${error.message}`, 'error');
    }
}

// 문제 목록 표시
function displayProblems(problemList) {
    problemsList.innerHTML = '';
    selectedIds.clear();

    problemList.forEach(problem => {
        const card = createProblemCard(problem);
        problemsList.appendChild(card);
    });

    // 섹션 표시
    problemsSection.style.display = 'block';
    downloadSection.style.display = 'block';

    updateCount();
}

// 문제 카드 생성
function createProblemCard(problem) {
    const card = document.createElement('div');
    card.className = 'problem-card';
    card.dataset.id = problem.id;

    // 체크박스
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'problem-checkbox';
    checkbox.value = problem.id;
    checkbox.addEventListener('change', handleCheckboxChange);

    // 문제 내용
    const content = document.createElement('div');
    content.className = 'problem-content';

    const number = document.createElement('div');
    number.className = 'problem-number';
    number.textContent = `문제 ${problem.number}`;

    const text = document.createElement('div');
    text.className = 'problem-text';
    // 첫 100자만 표시
    const previewText = problem.text.length > 100
        ? problem.text.substring(0, 100) + '...'
        : problem.text;
    text.textContent = previewText || '(내용 없음)';

    const meta = document.createElement('div');
    meta.className = 'problem-meta';

    const sectionInfo = document.createElement('span');
    sectionInfo.innerHTML = `📄 ${problem.xml_section}`;

    const imageCount = document.createElement('span');
    imageCount.innerHTML = `🖼️ 이미지 ${problem.images.length}개`;

    meta.appendChild(sectionInfo);
    meta.appendChild(imageCount);

    content.appendChild(number);
    content.appendChild(text);
    content.appendChild(meta);

    // 카드 클릭 시 체크박스 토글
    card.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            handleCheckboxChange({ target: checkbox });
        }
    });

    card.appendChild(checkbox);
    card.appendChild(content);

    return card;
}

// 체크박스 변경 핸들러
function handleCheckboxChange(event) {
    const checkbox = event.target;
    const problemId = parseInt(checkbox.value);
    const card = checkbox.closest('.problem-card');

    if (checkbox.checked) {
        selectedIds.add(problemId);
        card.classList.add('selected');
    } else {
        selectedIds.delete(problemId);
        card.classList.remove('selected');
    }

    updateCount();
}

// 전체 선택/해제
function toggleAllProblems() {
    const checkboxes = document.querySelectorAll('.problem-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);

    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
        handleCheckboxChange({ target: cb });
    });

    toggleAllBtn.textContent = allChecked ? '전체 선택' : '전체 해제';
}

// 선택 개수 업데이트
function updateCount() {
    const count = selectedIds.size;
    countBadge.textContent = `${count}개 선택됨`;

    // 생성 버튼 활성화/비활성화
    generateBtn.disabled = count === 0;

    // 전체 선택 버튼 텍스트 업데이트
    const allSelected = count === problems.length && count > 0;
    toggleAllBtn.textContent = allSelected ? '전체 해제' : '전체 선택';
}

// HWPX 파일 생성
async function generateHwpx() {
    if (selectedIds.size === 0) {
        showStatus(downloadStatus, '문제를 선택해주세요.', 'error');
        return;
    }

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="loading"></span> 파일 생성 중...';
    showStatus(downloadStatus, '선택한 문제로 HWPX 파일을 생성하는 중...', 'info');

    try {
        const response = await fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                selected_ids: Array.from(selectedIds)
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '파일 생성 실패');
        }

        // 파일 다운로드
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `selected_problems_${Date.now()}.hwpx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showStatus(downloadStatus, '✅ 파일이 성공적으로 다운로드되었습니다!', 'success');

    } catch (error) {
        console.error('Generate error:', error);
        showStatus(downloadStatus, `❌ ${error.message}`, 'error');
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '✨ 선택한 문제로 HWPX 파일 생성';
    }
}

// 상태 메시지 표시
function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-message show ${type}`;

    // 3초 후 자동 숨김 (에러 제외)
    if (type !== 'error') {
        setTimeout(() => {
            element.classList.remove('show');
        }, 3000);
    }
}
