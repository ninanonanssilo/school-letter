const $ = (sel) => document.querySelector(sel);

function setStatus(msg, kind = "info") {
  const el = $("#status");
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
  return "안녕하십니까. 학부모님께 알려드립니다.";
}

function closingForTone(tone, dateKor, school, teacher) {
  const org = (school || "").trim();
  const person = (teacher || "").trim();
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

  return (
    TEMPLATES.find((t) => t.name.toLowerCase().includes(q)) ||
    TEMPLATES.find((t) => t.title.toLowerCase().includes(q)) ||
    null
  );
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
  setStatus("TXT 다운로드를 시작했습니다.", "ok");
}

function fillExample() {
  $("#school").value = "예시초등학교";
  $("#class").value = "3학년 2반";
  $("#teacher").value = "OOO";
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
  setStatus("입력을 초기화했습니다.");
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
  $("#fillExampleBtn").addEventListener("click", fillExample);
  $("#clearBtn").addEventListener("click", () => {
    setOutput("");
    setStatus("결과를 비웠습니다.");
  });

  $("#copyBtn").addEventListener("click", () => {
    copyOutput().catch(() => setStatus("복사에 실패했습니다. 브라우저 권한을 확인하세요.", "warn"));
  });
  $("#downloadBtn").addEventListener("click", downloadOutput);

  $("#form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = getFormValues();
    const doc = generateLetter(v);
    setOutput(doc);
    setStatus("생성 완료", "ok");
    location.hash = "#result";
  });
}

populateTemplates();
setDefaultDate();
wireUI();
