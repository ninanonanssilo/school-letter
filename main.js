const $ = (sel) => document.querySelector(sel);

// Theme: 밝은 모드 고정 (요청에 따라 다크모드 제거)
const STORAGE_KEY = "schoolletter:template:v1";
const DRAFT_KEY = "schoolletter:draft:v1";

function toast(msg, { ms = 1800 } = {}) {
  const el = document.getElementById("toast");
  if (!el) return;
  const m = String(msg || "").trim();
  if (!m) return;
  el.textContent = m;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.remove("show");
  }, Math.max(700, Number(ms) || 1800));
}

function setStatus(msg, kind = "info") {
  const el = $("#status");
  if (!el) return;
  el.textContent = msg || "";
  el.dataset.kind = kind;
}

function setTplStatus(msg, kind = "info") {
  const el = $("#tplStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.dataset.kind = kind;
}

function openDrawer() {
  $("#drawer").hidden = false;
  $("#backdrop").hidden = false;
  $("#menuBtn").setAttribute("aria-label", "메뉴 닫기");
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  $("#drawer").hidden = true;
  $("#backdrop").hidden = true;
  $("#menuBtn").setAttribute("aria-label", "메뉴 열기");
  document.body.style.overflow = "";
}

function isoToKoreanDate(iso) {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("-").map((v) => Number(v));
  if (!y || !m || !d) return "";
  return `${y}년 ${m}월 ${d}일`;
}

function formatPoints(text) {
  const lines = (text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  return lines.map((s, i) => `${i + 1}) ${s}`).join("\n");
}

function formatAttachments(text) {
  const lines = (text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  return lines.map((s, i) => `${i + 1}. ${s}`).join("\n");
}

function greetingForTone(tone) {
  if (tone === "간결") return "학부모님께";
  if (tone === "친절") return "안녕하십니까. 학부모님께 안내드립니다.";
  if (tone === "구체적") return "안녕하십니까. 안내사항을 항목별로 자세히 안내드립니다.";
  return "안녕하십니까. 학부모님께 알려드립니다.";
}

function closingForTone(tone, dateKor, school, teacher) {
  const org = (school || "").trim();
  const person = (teacher || "").trim(); // now used as department (부서)
  const tailLine = org ? `${org}` : "학교";

  if (tone === "간결") {
    return `${dateKor}\n${tailLine}`;
  }
  if (tone === "친절") {
    return `${dateKor}\n${tailLine}${person ? ` ${person}` : ""} 드림`;
  }
  return `${dateKor}\n${tailLine}${person ? ` ${person}` : ""}`;
}

function generateLetter(values) {
  const title = (values.title || "").trim();
  const isoDate = (values.date || "").trim();
  const dateKor = isoToKoreanDate(isoDate);
  const school = (values.school || "").trim();
  const klass = (values.class || "").trim();
  const teacher = (values.teacher || "").trim();
  const kind = (values.kind || "안내").trim();
  const tone = (values.tone || "공손").trim();
  const summary = (values.summary || "").trim();
  const points = (values.points || "").trim();
  const extra = (values.extra || "").trim();
  const attachments = (values.attachments || "").trim();

  const headOrg = school ? `${school} 가정통신문` : "가정통신문";
  const meta = [
    `제목: ${title || "(제목 미입력)"}`,
    `유형: ${kind}`,
    klass ? `대상: ${klass} 학부모님` : "대상: 학부모님",
    dateKor ? `시행일: ${dateKor}` : "시행일: (미입력)",
  ].join("\n");

  const bodyParts = [];
  bodyParts.push(greetingForTone(tone));
  if (summary) bodyParts.push(`\n${summary}`);

  const fp = formatPoints(points);
  if (fp) bodyParts.push(`\n[주요 내용]\n${fp}`);

  if (extra) bodyParts.push(`\n[추가 안내]\n${extra}`);

  const att = formatAttachments(attachments);
  if (att) bodyParts.push(`\n붙임\n${att}`);

  const closing = closingForTone(tone, dateKor || "", school, teacher);

  const doc = [
    `${headOrg}`,
    "",
    meta,
    "",
    bodyParts.join("\n"),
    "",
    closing,
  ].join("\n");

  return doc.trim() + "\n";
}

const TEMPLATES = [
  {
    id: "counseling",
    name: "학부모 상담주간 안내",
    title: "학부모 상담주간 운영 안내",
    kind: "안내",
    tags: ["상담", "상담주간", "면담", "학부모"],
    summary: "학부모 상담주간 운영 일정과 신청 방법을 안내드립니다.",
    points: [
      "상담 기간: 3/16(월)~3/20(금)",
      "장소: 각 교실(대면) 또는 유선/화상(선택)",
      "신청: 가정통신문 회신 또는 학교 앱 설문",
      "상담 시간: 10분 내외(학급 상황에 따라 조정)",
      "문의: 담임교사",
    ].join("\n"),
    attachments: ["상담 신청서 1부(선택)"].join("\n"),
    extra: "원활한 운영을 위해 신청 시간 준수에 협조 부탁드립니다.",
  },
  {
    id: "fieldtrip",
    name: "현장체험학습 안내",
    title: "현장체험학습 운영 안내",
    kind: "안내",
    tags: ["현장체험학습", "체험학습", "견학", "안전"],
    summary: "학생들의 배움과 안전을 위한 현장체험학습 운영 계획을 안내드립니다.",
    points: [
      "일시: 4/10(금) 09:00~15:00",
      "장소: (기관명/장소 기입)",
      "집결: 학교 운동장 08:40",
      "준비물: 간편복, 운동화, 물, 필기도구",
      "안전: 인솔교사 지도 및 안전수칙 준수",
      "문의: 담임교사",
    ].join("\n"),
    attachments: ["현장체험학습 참가 동의서 1부"].join("\n"),
    extra: "개별 행동은 금지되며, 안전사고 예방을 위해 지도에 협조 부탁드립니다.",
  },
  {
    id: "after_school",
    name: "방과후학교 신청 안내",
    title: "방과후학교 프로그램 신청 안내",
    kind: "신청",
    tags: ["방과후", "방과후학교", "신청", "수강"],
    summary: "방과후학교 프로그램 신청 일정 및 유의사항을 안내드립니다.",
    points: [
      "신청 기간: 3/2(월) 09:00 ~ 3/4(수) 17:00",
      "신청 방법: 학교 홈페이지/앱(설문) 신청",
      "수강료: 프로그램별 상이(선착순/추첨 운영 가능)",
      "환불: 개강 전/후 규정에 따라 처리",
      "문의: 방과후 담당 또는 담임교사",
    ].join("\n"),
    attachments: ["프로그램 안내표 1부"].join("\n"),
    extra: "모집 인원 초과 시 대기/추첨으로 운영될 수 있습니다.",
  },
  {
    id: "schedule_change",
    name: "학사일정 변경 안내",
    title: "학사일정 변경 안내",
    kind: "변경",
    tags: ["학사", "일정", "변경", "공지"],
    summary: "학교 사정으로 학사일정이 일부 변경되어 안내드립니다.",
    points: [
      "변경 사유: (사유 기입)",
      "변경 전 일정: (기존 일정 기입)",
      "변경 후 일정: (변경 일정 기입)",
      "대상: 전교생",
      "문의: 교무실 또는 담임교사",
    ].join("\n"),
    attachments: "",
    extra: "학부모님의 너른 양해 부탁드립니다.",
  },
  {
    id: "neulbom_morning",
    name: "아침늘봄 신청 안내",
    title: "(학년도) 초1~2 아침늘봄 신청 안내",
    kind: "신청",
    tags: ["늘봄", "아침늘봄", "돌봄", "초1", "초2", "신청"],
    summary: "아침늘봄 운영(등교 전 돌봄) 신청 방법과 일정을 안내드립니다.",
    points: [
      "대상: 초1~2 (해당 학년/학교 기준에 따라 조정)",
      "운영 기간: (기간 기입)",
      "운영 시간: (예: 08:00~08:40)",
      "운영 장소: (장소 기입)",
      "신청 기간: (기간 기입)",
      "신청 방법: (학교 앱/가정통신문 회신/온라인 설문 등 기입)",
      "선정 방법: (선착순/추첨/우선순위 기준 기입)",
      "문의: 늘봄(돌봄) 담당 또는 담임교사",
    ].join("\n"),
    attachments: ["아침늘봄 신청서 1부(선택)"].join("\n"),
    extra: "원활한 운영을 위해 신청 기간 내 제출에 협조 부탁드립니다.",
  },
  {
    id: "neulbom_custom",
    name: "맞춤형 프로그램 신청 안내",
    title: "(학년도) 초1~2 맞춤형 프로그램 신청 안내",
    kind: "신청",
    tags: ["늘봄", "맞춤형", "프로그램", "신청", "초1", "초2"],
    summary: "맞춤형 프로그램 운영 내용과 신청 방법을 안내드립니다.",
    points: [
      "대상: 초1~2 (또는 해당 대상 기입)",
      "프로그램: (예: 독서/놀이/예체능/기초학습 등 기입)",
      "운영 기간: (기간 기입)",
      "운영 시간: (요일/시간 기입)",
      "신청 기간: (기간 기입)",
      "신청 방법: (학교 앱/온라인 설문/회신 등 기입)",
      "비용: (무상/수익자부담 여부 기입)",
      "문의: 담당부서 또는 담임교사",
    ].join("\n"),
    attachments: ["프로그램 안내표 1부"].join("\n"),
    extra: "정원 초과 시 대기 또는 추첨으로 운영될 수 있습니다.",
  },
  {
    id: "wee_newsletter",
    name: "Wee클래스 뉴스레터",
    title: "Wee클래스 뉴스레터 안내 (생명존중/마음건강)",
    kind: "안내",
    tags: ["Wee", "위클래스", "상담", "마음건강", "생명존중", "뉴스레터"],
    summary: "학생 마음건강 및 생명존중과 관련한 안내 자료를 공유드립니다.",
    points: [
      "주제: (예: 나 자신을 사랑하기/감정 돌보기 등)",
      "내용: (가정에서의 대화 방법/도움 요청 방법 등)",
      "참고 자료: (링크/붙임 자료 기입)",
      "위기 상황 시: (학교 상담실/담임교사/지역 상담기관 안내 문구 기입)",
      "문의: Wee클래스 또는 담임교사",
    ].join("\n"),
    attachments: ["뉴스레터 1부(선택)"].join("\n"),
    extra: "가정에서도 학생의 정서적 지지를 위해 함께 살펴봐 주시기 바랍니다.",
  },
  {
    id: "graduation",
    name: "졸업식 안내",
    title: "(회) 졸업식 안내",
    kind: "안내",
    tags: ["졸업", "졸업식", "행사", "안내"],
    summary: "졸업식 일정 및 참석 안내(장소, 출입, 유의사항)를 안내드립니다.",
    points: [
      "일시: (날짜/시간 기입)",
      "장소: (장소 기입)",
      "대상: 졸업생 및 보호자 (참석 가능 인원 기준 기입)",
      "입장/좌석: (입장 시간/좌석 안내 기입)",
      "주차/교통: (주차 가능 여부/대중교통 권장 등 기입)",
      "사진/촬영: (촬영 가능 범위 및 예절 안내 기입)",
      "문의: 담임교사 또는 담당부서",
    ].join("\n"),
    attachments: "",
    extra: "행사 진행에 협조해 주셔서 감사드립니다.",
  },
  {
    id: "transfer_in",
    name: "전입 안내",
    title: "(학년도) 전입 안내",
    kind: "안내",
    tags: ["전입", "전학", "전입학", "서류", "안내"],
    summary: "전입(전학) 절차와 제출 서류, 방문 안내를 안내드립니다.",
    points: [
      "대상: 전입 예정 학생/학부모",
      "절차: (예: 전화 문의 → 서류 준비 → 방문 접수 → 배정/안내)",
      "제출 서류: (예: 전입학 신청서, 주민등록등본(주소 확인), 재학증명서 등 학교 기준 기입)",
      "접수 시간: (평일 운영 시간 기입)",
      "방문 장소: (교무실/행정실 등 기입)",
      "문의: 교무실 또는 행정실",
    ].join("\n"),
    attachments: ["전입 관련 서식 1부(선택)"].join("\n"),
    extra: "학교별 제출 서류가 다를 수 있으니 방문 전 확인을 부탁드립니다.",
  },
  {
    id: "election_result",
    name: "학생회 선거 결과 안내",
    title: "(학년도) 전교 학생회 임원 선거 결과 안내",
    kind: "공지",
    tags: ["학생회", "선거", "투표", "결과", "자치"],
    summary: "전교 학생회 임원 선거(투표) 결과를 안내드립니다.",
    points: [
      "투표 일시: (일시 기입)",
      "대상: (투표 참여 대상 기입)",
      "결과: (회장/부회장 당선 결과 기입)",
      "기타: (선거관리 절차/유의사항 등 기입)",
      "문의: 학생자치 담당교사 또는 담임교사",
    ].join("\n"),
    attachments: "",
    extra: "민주적 절차에 참여해 준 학생들에게 감사드립니다.",
  },
  {
    id: "health_news",
    name: "보건소식지 안내",
    title: "(월) 보건소식지 안내",
    kind: "안내",
    tags: ["보건", "보건소식", "건강", "감염병", "예방"],
    summary: "학생 건강 관리를 위한 보건소식지를 안내드립니다.",
    points: [
      "주요 내용: (예: 감염병 예방, 손 씻기, 독감/코로나 예방, 알레르기 관리 등)",
      "가정 협조: (예: 발열/기침 등 증상 시 등교 전 확인 및 휴식 권장)",
      "준비물/복용: (예: 개인 상비약/의약품 복용 안내 등 학교 기준 기입)",
      "문의: 보건실",
    ].join("\n"),
    attachments: ["보건소식지 1부"].join("\n"),
    extra: "가정에서도 건강 수칙을 함께 실천해 주시기 바랍니다.",
  },
  {
    id: "meal_plan",
    name: "식단표/영양소식지 안내",
    title: "(월) 식단표 및 영양소식지 안내",
    kind: "안내",
    tags: ["급식", "식단", "영양", "알레르기"],
    summary: "학교 급식 식단표와 영양소식지를 안내드립니다.",
    points: [
      "기간: (예: 3월 1일~3월 31일)",
      "알레르기: 식단표의 알레르기 표시 확인 부탁드립니다.",
      "기타: (예: 급식 관련 유의사항/위생 안내 등)",
      "문의: 영양(교)사 또는 급식실",
    ].join("\n"),
    attachments: ["식단표 1부", "영양소식지 1부"].join("\n"),
    extra: "학생의 건강한 식습관 형성을 위해 가정에서도 관심 부탁드립니다.",
  },
  {
    id: "edu_benefit",
    name: "교육급여/교육비 지원 안내",
    title: "(학년도) 교육급여 및 교육비 지원 안내",
    kind: "안내",
    tags: ["교육급여", "교육비", "지원", "신청", "복지"],
    summary: "교육급여 및 교육비 지원 신청 방법과 기간을 안내드립니다.",
    points: [
      "지원 내용: (예: 교육급여, 방과후, 급식, 교육활동 지원 등 해당 내용 기입)",
      "신청 기간: (기간 기입)",
      "신청 방법: (온라인/방문/서류 제출 등 기입)",
      "대상/기준: (해당 기준 기입)",
      "문의: 행정실 또는 담당부서",
    ].join("\n"),
    attachments: ["안내문 1부(선택)"].join("\n"),
    extra: "가정 형편에 따라 지원 내용이 다를 수 있으니 안내문을 확인해 주세요.",
  },
  {
    id: "recycle_campaign",
    name: "분리배출/1회용품 줄이기 안내",
    title: "1회용품 사용 줄이기 및 올바른 분리배출 안내",
    kind: "협조",
    tags: ["환경", "분리배출", "재활용", "캠페인", "협조"],
    summary: "환경 보호를 위한 1회용품 사용 줄이기 및 분리배출 협조를 부탁드립니다.",
    points: [
      "1회용품 줄이기: (예: 개인 물병/텀블러 사용 권장)",
      "분리배출: (예: 내용물 비우기, 라벨 제거, 깨끗이 헹구기 등)",
      "학교/가정 실천: (예: 주 1회 실천 캠페인, 학급 실천 활동 등 기입)",
      "문의: 담당부서 또는 담임교사",
    ].join("\n"),
    attachments: "",
    extra: "작은 실천이 큰 변화를 만듭니다. 가정에서도 함께 참여해 주세요.",
  },
];

function populateTemplates() {
  const quick = $("#tplQuick");
  for (const t of TEMPLATES) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    quick.appendChild(opt);
  }
}

function findTemplate() {
  const quickId = ($("#tplQuick").value || "").trim();
  const q = ($("#tplSearch").value || "").trim().toLowerCase();

  if (quickId) return TEMPLATES.find((t) => t.id === quickId) || null;
  if (!q) return null;

  return TEMPLATES.find((t) => {
    const hay = [
      t.name,
      t.title,
      t.summary,
      ...(t.tags || []),
    ]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase());
    return hay.some((s) => s.includes(q));
  }) || null;
}

function applyTemplate(t) {
  if (!t) return false;
  $("#title").value = t.title;
  $("#kind").value = t.kind;
  $("#summary").value = t.summary || "";
  $("#points").value = t.points || "";
  $("#attachments").value = t.attachments || "";
  $("#extra").value = t.extra || "";
  setStatus(`템플릿 적용: ${t.name}`);
  return true;
}

function setDefaultDate() {
  // Korea school context: default to Asia/Seoul "today" in ISO date.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  $("#date").value = fmt.format(new Date()); // YYYY-MM-DD
}

function getFormValues() {
  const form = $("#form");
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

function setOutput(text) {
  const out = $("#out");
  out.textContent = text || "";
  const has = Boolean(text && text.trim());
  $("#copyBtn").disabled = !has;
  $("#downloadBtn").disabled = !has;
}

async function copyOutput() {
  const text = ($("#out").textContent || "").trim();
  if (!text) return;
  await navigator.clipboard.writeText(text + "\n");
  setStatus("클립보드에 복사했습니다.", "ok");
}

function downloadOutput() {
  const text = ($("#out").textContent || "").trim();
  if (!text) return;

  const title = ($("#title").value || "가정통신문").trim();
  const safe = title.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 60).trim() || "가정통신문";
  const blob = new Blob([text + "\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("TXT 다운로드를 시작했습니다.");
  setStatus("TXT 다운로드를 시작했습니다.", "ok");
}

function fillExample() {
  $("#school").value = "예시초등학교";
  $("#class").value = "3학년 2반";
  $("#teacher").value = "교무실";
  $("#tone").value = "공손";
  $("#kind").value = "안내";
  $("#title").value = "학부모 상담주간 운영 안내";
  $("#summary").value = "학부모 상담주간 운영 일정과 신청 방법을 안내드립니다.";
  $("#points").value = [
    "상담 기간: 3/16(월)~3/20(금)",
    "장소: 각 교실(대면) 또는 유선/화상(선택)",
    "신청: 가정통신문 회신 또는 학교 앱 설문",
    "상담 시간: 10분 내외(학급 상황에 따라 조정)",
    "문의: 담임교사",
  ].join("\n");
  $("#attachments").value = "상담 신청서 1부(선택)";
  $("#extra").value = "원활한 운영을 위해 신청 시간 준수에 협조 부탁드립니다.";
  toast("예시 입력을 채웠습니다.");
  setStatus("예시 입력을 채웠습니다.");
}

function resetInputs(keepDate = true) {
  $("#title").value = "";
  if (!keepDate) $("#date").value = "";
  $("#school").value = "";
  $("#class").value = "";
  $("#teacher").value = "";
  $("#kind").value = "안내";
  $("#tone").value = "공손";
  $("#summary").value = "";
  $("#points").value = "";
  $("#attachments").value = "";
  $("#extra").value = "";
  $("#tplQuick").value = "";
  $("#tplSearch").value = "";
  clearDraft();
  setStatus("입력을 초기화했습니다.");
}

function loadSavedTemplate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveTemplate(tpl) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tpl));
}

function clearTemplate() {
  localStorage.removeItem(STORAGE_KEY);
}

function getDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDraft(values) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(values || {}));
  } catch {
    // ignore
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function restoreDraft() {
  const d = getDraft();
  if (!d) return false;

  const setIfEmpty = (id, v) => {
    const el = $(id);
    if (!el) return;
    const cur = String(el.value || "").trim();
    const next = String(v || "");
    if (!cur && next) el.value = next;
  };

  setIfEmpty("#title", d.title);
  setIfEmpty("#date", d.date);
  setIfEmpty("#school", d.school);
  setIfEmpty("#class", d.class);
  setIfEmpty("#teacher", d.teacher);
  setIfEmpty("#kind", d.kind);
  setIfEmpty("#tone", d.tone);
  setIfEmpty("#summary", d.summary);
  setIfEmpty("#points", d.points);
  setIfEmpty("#attachments", d.attachments);
  setIfEmpty("#extra", d.extra);

  return true;
}

async function analyzeTemplateFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const resp = await fetch("/api/analyze-template", { method: "POST", body: fd });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    let msg = data?.error || `양식 분석 실패 (HTTP ${resp.status})`;
    // Keep UI copy simple; avoid leaking internal env var names.
    if (String(msg).includes("OPENAI_API_KEY")) {
      msg = "서버 설정이 필요합니다. 관리자에게 문의하세요.";
    }
    throw new Error(msg);
  }
  if (!data?.template) throw new Error("양식 분석 결과가 비어있습니다.");
  return data.template;
}

async function generateWithTemplate(template, values) {
  const resp = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ template, values }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = data?.error || `생성 실패 (HTTP ${resp.status})`;
    throw new Error(msg);
  }
  return data?.text || "";
}

function wireUI() {
  $("#menuBtn").addEventListener("click", () => {
    const isOpen = !$("#drawer").hidden;
    if (isOpen) closeDrawer();
    else openDrawer();
  });
  $("#closeBtn").addEventListener("click", closeDrawer);
  $("#backdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#drawer").hidden) closeDrawer();
  });

  $("#applyTplBtn").addEventListener("click", () => {
    const t = findTemplate();
    if (!t) {
      setStatus("일치하는 템플릿이 없습니다. 검색어 또는 빠른 템플릿을 선택하세요.", "warn");
      return;
    }
    applyTemplate(t);
  });

  $("#resetBtn").addEventListener("click", () => resetInputs(true));
  $("#fillExampleBtn").addEventListener("click", () => {
    fillExample();
    saveDraft(getFormValues());
  });
  $("#clearBtn").addEventListener("click", () => {
    setOutput("");
    setStatus("결과를 비웠습니다.");
  });

  $("#copyBtn").addEventListener("click", () => {
    copyOutput()
      .then(() => toast("클립보드에 복사했습니다."))
      .catch(() => {
        toast("복사에 실패했습니다. 브라우저 권한을 확인하세요.", { ms: 2400 });
        setStatus("복사에 실패했습니다. 브라우저 권한을 확인하세요.", "warn");
      });
  });
  $("#downloadBtn").addEventListener("click", downloadOutput);

  $("#form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = getFormValues();
    saveDraft(v);
    const aiMode = ($("#aiMode")?.value || "off").trim();
    const tpl = loadSavedTemplate();

    if (aiMode === "on") {
      if (!tpl) {
        setStatus("양식 기반 생성을 사용하려면 먼저 '양식 분석'을 진행하세요.", "warn");
        return;
      }
      setStatus("양식 기반 생성 중…", "info");
      generateWithTemplate(tpl, v)
        .then((text) => {
          if (typeof text !== "string" || !text.trim()) {
            throw new Error("AI 생성 결과가 비어있습니다.");
          }
          setOutput(text);
          toast("생성 완료(양식 기반)");
          setStatus("생성 완료(양식 기반)", "ok");
          location.hash = "#result";
        })
        .catch((err) => {
          // Fail soft: fall back to local generator so the user still gets something usable.
          const fallback = generateLetter(v);
          setOutput(fallback);
          setStatus(
            `양식 기반 생성 실패 → 로컬 생성으로 대체했습니다. (${String(err?.message || err || "오류")})`,
            "warn"
          );
          location.hash = "#result";
        });
      return;
    }

    const doc = generateLetter(v);
    setOutput(doc);
    toast("생성 완료");
    setStatus("생성 완료", "ok");
    location.hash = "#result";
  });

  $("#analyzeTplBtn").addEventListener("click", () => {
    const file = $("#tplFile")?.files?.[0];
    if (!file) {
      setTplStatus("파일을 선택하세요.", "warn");
      return;
    }
    setTplStatus("양식 분석 중...", "info");
    analyzeTemplateFile(file)
      .then((tpl) => {
        saveTemplate(tpl);
        setTplStatus("양식 분석 완료. 이제 '양식 기반 생성'을 사용할 수 있어요.", "ok");
      })
      .catch((err) => {
        setTplStatus(String(err?.message || err || "양식 분석 실패"), "warn");
      });
  });

  $("#clearTplBtn").addEventListener("click", () => {
    clearTemplate();
    setTplStatus("저장된 양식을 제거했습니다.", "ok");
  });
}

populateTemplates();
setDefaultDate();
wireUI();

// Restore template preview on load if present
(() => {
  const tpl = loadSavedTemplate();
  if (tpl) {
    setTplStatus("저장된 양식이 있습니다. '양식 기반 생성'을 켜서 사용할 수 있어요.", "info");
  }

  const restored = restoreDraft();
  if (restored) {
    setStatus("임시 저장된 입력을 불러왔습니다.", "info");
    toast("임시 저장된 입력을 불러왔습니다.");
  }
})();
