import fs from 'fs';
import path from 'path';

// Define DB paths
const DB_FILE_PATH = path.join(process.cwd(), 'src', 'lib', 'database.json');

export interface Question {
  id: string;
  type: 'mcq' | 'short' | 'long';
  questionText: string;
  options?: string[]; // MCQs only
  points: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface AnswerKeyItem {
  questionId: string;
  correctAnswer: string; // Correct letter for MCQ (e.g. "A"), or grading reference guidelines
  gradingCriteria?: string; // Checklist of details for subjective answers
}

export interface Exam {
  id: string;
  subject: string;
  examTitle: string;
  durationMinutes: number;
  unlockTime: string; // ISO String
  status: 'pending' | 'generated' | 'failed';
  questions: Question[];
  answerKey: AnswerKeyItem[];
  createdAt: string;
}

export interface Submission {
  id: string;
  examId: string;
  examTitle: string;
  subject: string;
  studentName: string;
  studentId: string;
  answers: Record<string, string>; // questionId -> studentAnswer
  score: number;
  maxScore: number;
  gradedAt: string;
  proctorLogs: string[];
  feedback: string; // AI generated overall exam review
  questionEvaluations: {
    questionId: string;
    score: number;
    maxPoints: number;
    isCorrect: boolean;
    feedback: string; // AI feedback on this question
  }[];
}

export interface ApiLog {
  id: string;
  timestamp: string;
  model: string;
  action: string; // e.g. "Generate Questions", "Grade Answer"
  durationMs: number;
  requestPayload: any;
  responsePayload: any;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

interface DatabaseSchema {
  exams: Exam[];
  submissions: Submission[];
  apiLogs: ApiLog[];
}

const DEFAULT_DB: DatabaseSchema = {
  exams: [],
  submissions: [],
  apiLogs: []
};

// Initialize DB if not exists
function ensureDbExists() {
  const dir = path.dirname(DB_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE_PATH)) {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
  }
}

export function readDb(): DatabaseSchema {
  ensureDbExists();
  try {
    const content = fs.readFileSync(DB_FILE_PATH, 'utf-8');
    return JSON.parse(content) as DatabaseSchema;
  } catch (error) {
    console.error('Error reading database file, returning default:', error);
    return DEFAULT_DB;
  }
}

export function writeDb(data: DatabaseSchema) {
  ensureDbExists();
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing to database file:', error);
  }
}

// Exam functions
export function getExams(): Exam[] {
  return readDb().exams;
}

export function getExam(id: string): Exam | undefined {
  return readDb().exams.find(e => e.id === id);
}

export function saveExam(exam: Exam) {
  const db = readDb();
  const index = db.exams.findIndex(e => e.id === exam.id);
  if (index >= 0) {
    db.exams[index] = exam;
  } else {
    db.exams.push(exam);
  }
  writeDb(db);
}

export function deleteExam(id: string) {
  const db = readDb();
  db.exams = db.exams.filter(e => e.id !== id);
  db.submissions = db.submissions.filter(s => s.examId !== id);
  writeDb(db);
}

// Submission functions
export function getSubmissions(): Submission[] {
  return readDb().submissions;
}

export function getSubmission(id: string): Submission | undefined {
  return readDb().submissions.find(s => s.id === id);
}

export function saveSubmission(sub: Submission) {
  const db = readDb();
  const index = db.submissions.findIndex(s => s.id === sub.id);
  if (index >= 0) {
    db.submissions[index] = sub;
  } else {
    db.submissions.push(sub);
  }
  writeDb(db);
}

// API log functions
export function getApiLogs(): ApiLog[] {
  return readDb().apiLogs;
}

export function addApiLog(log: Omit<ApiLog, 'id' | 'timestamp'>) {
  const db = readDb();
  const newLog: ApiLog = {
    ...log,
    id: 'log_' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString()
  };
  db.apiLogs.unshift(newLog); // Prepend to show latest first
  // Keep logs at a reasonable count (e.g. 50)
  if (db.apiLogs.length > 50) {
    db.apiLogs = db.apiLogs.slice(0, 50);
  }
  writeDb(db);
}
