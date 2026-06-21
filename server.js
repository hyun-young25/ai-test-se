const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PW = process.env.ADMIN_PW;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 없습니다. PostgreSQL 연결 정보를 설정하세요.");
  process.exit(1);
}

if (!ADMIN_ID || !ADMIN_PW) {
  console.warn("ADMIN_ID 또는 ADMIN_PW 환경변수가 없습니다. 관리자 로그인이 작동하지 않습니다.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const examQuestions = [
  { id: "q1", type: "mc", points: 7, answer: "②" },
  { id: "q2", type: "mc", points: 7, answer: "①" },
  { id: "q3", type: "mc", points: 7, answer: "③" },
  { id: "q4", type: "mc", points: 7, answer: "③" },
  { id: "q5", type: "mc", points: 7, answer: "①" },
  { id: "q6", type: "mc", points: 7, answer: "④" },
  { id: "q7", type: "mc", points: 7, answer: "②" },
  { id: "q8", type: "mc", points: 7, answer: "①" },
  { id: "q9", type: "mc", points: 7, answer: "③" },
  { id: "q10", type: "mc", points: 7, answer: "④" },
  { id: "q11", type: "short", points: 10, answerList: ["픽셀", "pixel", "Pixel", "PIXEL"] },
  { id: "q12", type: "essay", points: 20 }
];

function normalizeText(text) {
  return String(text || "").trim().replace(/\s+/g, "").toLowerCase();
}

function scoreAuto(answers) {
  let score = 0;

  examQuestions.forEach(q => {
    const userAnswer = answers[q.id] || "";

    if (q.type === "mc") {
      if (userAnswer === q.answer) score += q.points;
    }

    if (q.type === "short") {
      const user = normalizeText(userAnswer);
      const correct = q.answerList.some(a => normalizeText(a) === user);
      if (correct) score += q.points;
    }
  });

  return score;
}

function requireAdmin(req, res, next) {
  if (!ADMIN_ID || !ADMIN_PW) {
    return res.status(500).json({ ok: false, message: "관리자 환경변수가 설정되지 않았습니다." });
  }

  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Basic" || !token) {
    res.set("WWW-Authenticate", "Basic realm=\"AI Exam Admin\"");
    return res.status(401).json({ ok: false, message: "관리자 인증이 필요합니다." });
  }

  const decoded = Buffer.from(token, "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const id = decoded.slice(0, idx);
  const pw = decoded.slice(idx + 1);

  if (id === ADMIN_ID && pw === ADMIN_PW) return next();

  return res.status(401).json({ ok: false, message: "관리자 아이디 또는 비밀번호가 올바르지 않습니다." });
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id BIGSERIAL PRIMARY KEY,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      answers JSONB NOT NULL,
      auto_score INTEGER NOT NULL DEFAULT 0,
      essay_score INTEGER,
      total_score INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at
    ON submissions (submitted_at DESC);
  `);
}

app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/submissions", async (req, res) => {
  try {
    const { studentId, studentName, answers } = req.body || {};

    if (!studentId || !studentName || !answers || typeof answers !== "object") {
      return res.status(400).json({ ok: false, message: "학번, 이름, 답안 정보가 필요합니다." });
    }

    const requiredIds = examQuestions.filter(q => q.type !== "essay").map(q => q.id);
    for (const id of requiredIds) {
      if (!String(answers[id] || "").trim()) {
        return res.status(400).json({ ok: false, message: "객관식과 단답형 문항을 모두 작성하세요." });
      }
    }

    const autoScore = scoreAuto(answers);
    const totalScore = autoScore;

    await pool.query(
      `INSERT INTO submissions
       (student_id, student_name, answers, auto_score, essay_score, total_score)
       VALUES ($1, $2, $3::jsonb, $4, NULL, $5)`,
      [String(studentId).trim(), String(studentName).trim(), JSON.stringify(answers), autoScore, totalScore]
    );

    res.json({ ok: true, message: "제출이 완료되었습니다." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "서버 저장 중 오류가 발생했습니다." });
  }
});

app.get("/api/submissions", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        submitted_at,
        student_id,
        student_name,
        answers,
        auto_score,
        essay_score,
        total_score
      FROM submissions
      ORDER BY submitted_at DESC, id DESC
    `);

    res.json({ ok: true, submissions: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "제출 목록을 불러오지 못했습니다." });
  }
});

app.patch("/api/submissions/:id/essay", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const essayScore = Number(req.body.essayScore);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "제출 ID가 올바르지 않습니다." });
    }

    if (Number.isNaN(essayScore) || essayScore < 0 || essayScore > 20) {
      return res.status(400).json({ ok: false, message: "서술형 점수는 0점부터 20점 사이로 입력하세요." });
    }

    const result = await pool.query(
      `UPDATE submissions
       SET essay_score = $1,
           total_score = auto_score + $1
       WHERE id = $2
       RETURNING id`,
      [essayScore, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, message: "해당 제출 답안을 찾을 수 없습니다." });
    }

    res.json({ ok: true, message: "서술형 점수가 저장되었습니다." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "점수 저장 중 오류가 발생했습니다." });
  }
});

app.delete("/api/submissions", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM submissions");
    res.json({ ok: true, message: "모든 제출 답안이 삭제되었습니다." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "삭제 중 오류가 발생했습니다." });
  }
});

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

app.get("/api/submissions.csv", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        submitted_at,
        student_id,
        student_name,
        answers,
        auto_score,
        essay_score,
        total_score
      FROM submissions
      ORDER BY submitted_at ASC, student_id ASC
    `);

    const headers = [
      "제출일시", "학번", "이름", "자동점수80", "서술형점수20", "총점100",
      "1번", "2번", "3번", "4번", "5번", "6번", "7번", "8번", "9번", "10번", "11번", "12번서술형"
    ];

    const rows = result.rows.map(row => {
      const a = row.answers || {};
      return [
        row.submitted_at,
        row.student_id,
        row.student_name,
        row.auto_score,
        row.essay_score ?? "",
        row.total_score,
        a.q1 || "",
        a.q2 || "",
        a.q3 || "",
        a.q4 || "",
        a.q5 || "",
        a.q6 || "",
        a.q7 || "",
        a.q8 || "",
        a.q9 || "",
        a.q10 || "",
        a.q11 || "",
        a.q12 || ""
      ];
    });

    const csv = [headers, ...rows]
      .map(row => row.map(csvEscape).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''ai_exam_submissions.csv");
    res.send("\ufeff" + csv);
  } catch (err) {
    console.error(err);
    res.status(500).send("CSV 다운로드 중 오류가 발생했습니다.");
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`AI exam server listening on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("DB 초기화 실패:", err);
    process.exit(1);
  });
