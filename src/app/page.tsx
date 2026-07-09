'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './page.module.css';

// Type definitions matching db.ts schema
interface Question {
  id: string;
  type: 'mcq' | 'short' | 'long';
  questionText: string;
  options?: string[];
  points: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface Exam {
  id: string;
  subject: string;
  examTitle: string;
  durationMinutes: number;
  unlockTime: string;
  status: 'pending' | 'generated' | 'failed';
  questions: Question[];
  createdAt: string;
}

interface Submission {
  id: string;
  examId: string;
  examTitle: string;
  subject: string;
  studentName: string;
  studentId: string;
  answers: Record<string, string>;
  score: number;
  maxScore: number;
  gradedAt: string;
  proctorLogs: string[];
  feedback: string;
  questionEvaluations: {
    questionId: string;
    score: number;
    maxPoints: number;
    isCorrect: boolean;
    feedback: string;
  }[];
}

interface ApiLog {
  id: string;
  timestamp: string;
  model: string;
  action: string;
  durationMs: number;
  requestPayload: any;
  responsePayload: any;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

export default function Dashboard() {
  // Navigation & Role states
  const [activeTab, setActiveTab] = useState<'teacher' | 'student' | 'inspector'>('teacher');
  const [currentSubView, setCurrentSubView] = useState<'exams' | 'generate' | 'gradebook'>('exams');
  
  // Data lists
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inspector States
  const [selectedLog, setSelectedLog] = useState<ApiLog | null>(null);

  // Exam Generation Form States
  const [subject, setSubject] = useState('');
  const [examTitle, setExamTitle] = useState('');
  const [duration, setDuration] = useState(30);
  const [unlockTime, setUnlockTime] = useState('');
  const [notesText, setNotesText] = useState('');
  const [model, setModel] = useState('openai/gpt-4o-mini');
  
  // Question Type distribution counts
  const [mcqCount, setMcqCount] = useState(3);
  const [shortCount, setShortCount] = useState(2);
  const [longCount, setLongCount] = useState(1);

  // Difficulty ratios
  const [easyCount, setEasyCount] = useState(2);
  const [mediumCount, setMediumCount] = useState(3);
  const [hardCount, setHardCount] = useState(1);

  // Selected Gradebook Exam
  const [selectedGradebookExamId, setSelectedGradebookExamId] = useState<string | null>(null);

  // Student Section States
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [isLoggedStudent, setIsLoggedStudent] = useState(false);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [examStarted, setExamStarted] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [proctorLogs, setProctorLogs] = useState<string[]>([]);
  const [latestSubmissionResult, setLatestSubmissionResult] = useState<Submission | null>(null);

  // Timers and Proctor references
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const proctorWarningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showProctorModal, setShowProctorModal] = useState(false);
  const [proctorWarningMsg, setProctorWarningMsg] = useState('');

  // Fetch initial data
  useEffect(() => {
    fetchExams();
    fetchLogs();
    fetchSubmissions();
  }, [activeTab]);

  const fetchExams = async () => {
    try {
      const res = await fetch('/api/exams');
      if (res.ok) {
        const data = await res.json();
        setExams(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/chat');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const res = await fetch('/api/submit'); // Wait, we can fetch submissions from db
      // Let's implement a GET for submissions. We can either do it in /api/submit or mock
      // Let's check how we handle GET for submissions. Let's create a GET in api/submit later, or just pull it
      const response = await fetch('/api/submit');
      if (response.ok) {
        const data = await response.json();
        setSubmissions(data);
      }
    } catch (e) {
      // Fallback
    }
  };

  // Generate Exam POST handler
  const handleGenerateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const totalQuestions = mcqCount + shortCount + longCount;
    const totalDiff = easyCount + mediumCount + hardCount;

    if (totalQuestions !== totalDiff) {
      setErrorMsg(`Question count mismatch! You requested ${totalQuestions} questions but difficulty sum is ${totalDiff}.`);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          examTitle,
          durationMinutes: duration,
          unlockTime: unlockTime || new Date().toISOString(),
          model,
          notesText,
          mcqCount,
          shortCount,
          longCount,
          easyCount,
          mediumCount,
          hardCount
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate exam');
      }

      // Success
      fetchExams();
      fetchLogs();
      setCurrentSubView('exams');
      // Reset form
      setSubject('');
      setExamTitle('');
      setNotesText('');
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExam = async (id: string) => {
    if (!confirm('Are you sure you want to delete this exam? This will clear all submissions.')) return;
    try {
      await fetch(`/api/exams?id=${id}`, { method: 'DELETE' });
      fetchExams();
      fetchSubmissions();
    } catch (e) {
      console.error(e);
    }
  };

  // Tab change handlers
  const selectTab = (tab: 'teacher' | 'student' | 'inspector') => {
    setActiveTab(tab);
    setErrorMsg(null);
    if (tab === 'student') {
      // Stay on login screen if not logged
    } else {
      setCurrentSubView('exams');
    }
  };

  // Student Actions
  const handleStudentLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (studentName.trim() && studentId.trim()) {
      setIsLoggedStudent(true);
      fetchExams();
    }
  };

  const startExam = (exam: Exam) => {
    setActiveExam(exam);
    setStudentAnswers({});
    setCurrentQuestionIndex(0);
    setTimeLeft(exam.durationMinutes * 60);
    setProctorLogs([]);
    setLatestSubmissionResult(null);
    setExamStarted(true);

    // Setup Timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Auto submit
          triggerAutoSubmit(exam.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Proctor Listener (Tab Switched / Hidden check)
  useEffect(() => {
    if (!examStarted || !activeExam) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logProctorEvent('Tab switched / backgrounded');
      }
    };

    const handleWindowBlur = () => {
      logProctorEvent('Window focus lost (possible multi-tasking)');
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [examStarted, activeExam, proctorLogs]);

  const logProctorEvent = (type: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const log = `[${timestamp}] ${type}`;
    setProctorLogs(prev => [...prev, log]);

    // Show proctor warning overlay
    setProctorWarningMsg(`PROCTOR WARNING: We detected a window/tab switch. This activity has been recorded. Repeated violations will flag your submission.`);
    setShowProctorModal(true);

    if (proctorWarningTimeoutRef.current) clearTimeout(proctorWarningTimeoutRef.current);
    proctorWarningTimeoutRef.current = setTimeout(() => {
      setShowProctorModal(false);
    }, 5000);
  };

  const triggerAutoSubmit = async (examId: string) => {
    setLoading(true);
    clearInterval(timerRef.current!);
    
    // Fallback if some answers are unselected
    const finalAnswers = { ...studentAnswers };
    
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId,
          studentName,
          studentId,
          answers: finalAnswers,
          proctorLogs
        })
      });

      if (!res.ok) {
        throw new Error('Auto-grading request failed');
      }

      const submission: Submission = await res.json();
      setLatestSubmissionResult(submission);
      setExamStarted(false);
      setActiveExam(null);
    } catch (e) {
      alert('Error submitting exam, please contact the administrator.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (questionId: string, optionChar: string) => {
    setStudentAnswers(prev => ({
      ...prev,
      [questionId]: optionChar
    }));
  };

  const handleSubjectiveInput = (questionId: string, text: string) => {
    setStudentAnswers(prev => ({
      ...prev,
      [questionId]: text
    }));
  };

  // Print Exam utility
  const handlePrintExam = (exam: Exam) => {
    // Print window content override or custom CSS
    window.print();
  };

  // Text PDF file upload parser mockup
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Simple text extraction simulation / or standard read
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setNotesText(prev => prev + '\n\n' + `=== Extracted Text from ${file.name} ===\n` + text);
    };
    reader.readAsText(file);
  };

  // Check if exam is unlocked
  const isExamUnlocked = (exam: Exam) => {
    const now = new Date();
    const unlock = new Date(exam.unlockTime);
    return now >= unlock;
  };

  const getCountdownString = (unlockStr: string) => {
    const diff = new Date(unlockStr).getTime() - new Date().getTime();
    if (diff <= 0) return 'Unlocked';
    
    const sec = Math.floor((diff / 1000) % 60);
    const min = Math.floor((diff / (1000 * 60)) % 60);
    const hrs = Math.floor(diff / (1000 * 60 * 60));
    
    return `${hrs}h ${min}m ${sec}s`;
  };

  // Format date helper
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  // Gradebook helper
  const examSubmissions = submissions.filter(s => s.examId === selectedGradebookExamId);
  const examForGradebook = exams.find(e => e.id === selectedGradebookExamId);

  // Submissions list getter
  useEffect(() => {
    if (activeTab === 'teacher') {
      fetchSubmissions();
    }
  }, [activeTab]);

  return (
    <div className={styles.container}>
      {/* Sidebar Navigation */}
      <aside className={`${styles.sidebar} no-print`}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>M</div>
          <span>MeshExam AI</span>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navGroupLabel}>Workspace</div>
          <button
            onClick={() => selectTab('teacher')}
            className={`${styles.navItem} ${activeTab === 'teacher' ? styles.navItemActive : ''}`}
          >
            🏫 Teacher Panel
          </button>
          <button
            onClick={() => selectTab('student')}
            className={`${styles.navItem} ${activeTab === 'student' ? styles.navItemActive : ''}`}
          >
            🎓 Student Center
          </button>

          <div className={styles.navGroupLabel}>System Logs</div>
          <button
            onClick={() => selectTab('inspector')}
            className={`${styles.navItem} ${activeTab === 'inspector' ? styles.navItemActive : ''}`}
          >
            ⚡ Mesh API Inspector
          </button>
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.profileCard}>
            <div className={styles.avatar}>
              {activeTab === 'teacher' ? 'T' : isLoggedStudent ? studentName[0].toUpperCase() : 'S'}
            </div>
            <div className={styles.profileInfo}>
              <span className={styles.profileName}>
                {activeTab === 'teacher' ? 'Prof. Fahim Khan' : isLoggedStudent ? studentName : 'Guest'}
              </span>
              <span className={styles.profileEmail}>
                {activeTab === 'teacher' ? 'fahimkhann2022@gmail.com' : isLoggedStudent ? `ID: ${studentId}` : 'Not Signed In'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={styles.main}>
        {/* =============================================================== */}
        {/* TEACHER PANEL TAB */}
        {/* =============================================================== */}
        {activeTab === 'teacher' && (
          <>
            <div className={`${styles.header} no-print`}>
              <div>
                <h1 className={styles.headerTitle}>Teacher Dashboard</h1>
                <p className={styles.headerSubtitle}>Generate smart examinations, check student grades, and track quality criteria.</p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  className={`${styles.button} ${currentSubView === 'exams' ? '' : styles.buttonSecondary}`}
                  onClick={() => setCurrentSubView('exams')}
                >
                  📝 View Exams
                </button>
                <button 
                  className={`${styles.button} ${currentSubView === 'generate' ? '' : styles.buttonSecondary}`}
                  onClick={() => setCurrentSubView('generate')}
                >
                  ✨ AI Exam Generator
                </button>
              </div>
            </div>

            {/* Subview: Exams List */}
            {currentSubView === 'exams' && (
              <div className={`${styles.examList} no-print`}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>Active Exams</h2>
                {exams.length === 0 ? (
                  <div className={styles.card} style={{ textAlign: 'center', padding: '40px' }}>
                    <p style={{ color: 'var(--text-muted)' }}>No exams generated yet. Click "AI Exam Generator" to build one!</p>
                  </div>
                ) : (
                  exams.map(exam => {
                    const submissionCount = submissions.filter(s => s.examId === exam.id).length;
                    return (
                      <div key={exam.id} className={styles.examListItem}>
                        <div>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{exam.examTitle}</h3>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Subject: <strong style={{ color: 'white' }}>{exam.subject}</strong> | Questions: {exam.questions?.length || 0} | Duration: {exam.durationMinutes}m
                          </p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Unlocks: {formatDate(exam.unlockTime)}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span className={`${styles.badge} ${styles.badgeInfo}`}>{submissionCount} Submissions</span>
                          <button
                            className={`${styles.button} ${styles.buttonSecondary}`}
                            style={{ padding: '8px 14px', fontSize: '0.75rem' }}
                            onClick={() => {
                              setSelectedGradebookExamId(exam.id);
                              setCurrentSubView('gradebook');
                            }}
                          >
                            📊 Gradebook
                          </button>
                          <button
                            className={`${styles.button} ${styles.buttonSecondary}`}
                            style={{ padding: '8px 14px', fontSize: '0.75rem' }}
                            onClick={() => {
                              // We can trigger a modal or screen showing the test print structure
                              setSelectedLog(null); // Clear log just in case
                              alert(`Ready to Print! Press Cmd+P or Ctrl+P on the next page to download PDF.`);
                              window.print();
                            }}
                          >
                            🖨️ Export PDF
                          </button>
                          <button
                            className={styles.button}
                            style={{ padding: '8px 14px', fontSize: '0.75rem', background: 'var(--danger)' }}
                            onClick={() => handleDeleteExam(exam.id)}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Subview: AI Exam Generator Form */}
            {currentSubView === 'generate' && (
              <div className={`${styles.gridTwoCols} no-print`}>
                <div className={styles.card}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '20px' }}>Configure Exam Settings</h2>
                  
                  {errorMsg && (
                    <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: 'var(--danger)', marginBottom: '20px', fontSize: '0.875rem' }}>
                      {errorMsg}
                    </div>
                  )}

                  <form onSubmit={handleGenerateExam}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Subject / Course</label>
                      <input
                        type="text"
                        className={styles.input}
                        placeholder="e.g. Computer Science, Organic Chemistry"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        required
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Exam Title</label>
                      <input
                        type="text"
                        className={styles.input}
                        placeholder="e.g. Midterm 2026, Final Assessment"
                        value={examTitle}
                        onChange={e => setExamTitle(e.target.value)}
                        required
                      />
                    </div>

                    <div className={styles.inputGrid}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>Duration (Min)</label>
                        <input
                          type="number"
                          className={styles.input}
                          value={duration}
                          onChange={e => setDuration(Number(e.target.value))}
                          min={1}
                          required
                        />
                      </div>
                      <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                        <label className={styles.label}>Unlock Time</label>
                        <input
                          type="datetime-local"
                          className={styles.input}
                          value={unlockTime}
                          onChange={e => setUnlockTime(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Select Mesh Routing Model</label>
                      <select 
                        className={styles.select}
                        value={model}
                        onChange={e => setModel(e.target.value)}
                      >
                        <option value="openai/gpt-4o-mini">OpenAI GPT-4o-mini (Super Fast & Budget Friendly)</option>
                        <option value="openai/gpt-4o">OpenAI GPT-4o (Premium Multi-Modal Reasoning)</option>
                        <option value="anthropic/claude-3-5-sonnet">Anthropic Claude 3.5 Sonnet (Advanced Accuracy)</option>
                        <option value="google/gemini-1.5-pro">Google Gemini 1.5 Pro (Massive Context Window)</option>
                        <option value="meta/llama-3.1-70b-instruct">Meta Llama 3.1 70B (High Quality Open Source)</option>
                        <option value="deepseek/deepseek-chat">DeepSeek Chat (Extremely Low Cost)</option>
                      </select>
                    </div>

                    <div style={{ marginTop: '24px', borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--secondary)', marginBottom: '16px' }}>Question Distribution Settings</h3>
                      <div className={styles.inputGrid} style={{ marginBottom: '16px' }}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>MCQ Count</label>
                          <input
                            type="number"
                            className={styles.input}
                            value={mcqCount}
                            onChange={e => setMcqCount(Number(e.target.value))}
                            min={0}
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Short Count</label>
                          <input
                            type="number"
                            className={styles.input}
                            value={shortCount}
                            onChange={e => setShortCount(Number(e.target.value))}
                            min={0}
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Long Count</label>
                          <input
                            type="number"
                            className={styles.input}
                            value={longCount}
                            onChange={e => setLongCount(Number(e.target.value))}
                            min={0}
                          />
                        </div>
                      </div>

                      <div className={styles.inputGrid}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Easy Count</label>
                          <input
                            type="number"
                            className={styles.input}
                            value={easyCount}
                            onChange={e => setEasyCount(Number(e.target.value))}
                            min={0}
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Medium Count</label>
                          <input
                            type="number"
                            className={styles.input}
                            value={mediumCount}
                            onChange={e => setMediumCount(Number(e.target.value))}
                            min={0}
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>Hard Count</label>
                          <input
                            type="number"
                            className={styles.input}
                            value={hardCount}
                            onChange={e => setHardCount(Number(e.target.value))}
                            min={0}
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className={styles.button}
                      style={{ width: '100%', marginTop: '24px' }}
                      disabled={loading}
                    >
                      {loading ? '🔮 Mesh API Generating Exam...' : '⚡ Generate Balanced Exam Paper'}
                    </button>
                  </form>
                </div>

                <div className={styles.card} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Syllabus & Material Context</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Provide notes, textbooks text, or syllabus contents. Mesh AI will pull definitions and write questions directly mapping this content (RAG/in-context reasoning).
                    </p>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Upload Material (.txt/notes)</label>
                    <input 
                      type="file" 
                      accept=".txt" 
                      className={styles.input} 
                      onChange={handleFileUpload} 
                      style={{ padding: '8px' }}
                    />
                  </div>

                  <div className={styles.formGroup} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <label className={styles.label}>Raw Syllabus / Course Notes Input</label>
                    <textarea
                      className={styles.textarea}
                      placeholder="Paste syllabus, textbook chapters, previous exam patterns, or notes here..."
                      value={notesText}
                      onChange={e => setNotesText(e.target.value)}
                      style={{ flex: 1, minHeight: '300px' }}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Subview: Gradebook */}
            {currentSubView === 'gradebook' && (
              <div className={`${styles.examList} no-print`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <button onClick={() => setCurrentSubView('exams')} className={`${styles.button} ${styles.buttonSecondary}`} style={{ padding: '8px 12px', fontSize: '0.75rem', marginBottom: '8px' }}>
                      ← Back to Exams
                    </button>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Gradebook: {examForGradebook?.examTitle}</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Subject: {examForGradebook?.subject}</p>
                  </div>
                </div>

                {examSubmissions.length === 0 ? (
                  <div className={styles.card} style={{ textAlign: 'center', padding: '40px' }}>
                    <p style={{ color: 'var(--text-muted)' }}>No students have submitted answers for this exam yet.</p>
                  </div>
                ) : (
                  examSubmissions.map(sub => (
                    <div key={sub.id} className={styles.card} style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--card-border)', paddingBottom: '16px', marginBottom: '16px' }}>
                        <div>
                          <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{sub.studentName}</h3>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ID: {sub.studentId} | Graded at: {formatDate(sub.gradedAt)}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)' }}>
                            {sub.score} / {sub.maxScore}
                          </span>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto-graded by Mesh AI</p>
                        </div>
                      </div>

                      {/* Proctor Warnings */}
                      {sub.proctorLogs.length > 0 ? (
                        <div className={styles.proctorWarning} style={{ marginBottom: '20px' }}>
                          <strong>⚠️ PROCTOR ALERT LOGS ({sub.proctorLogs.length}):</strong>
                          <ul style={{ paddingLeft: '16px', marginTop: '6px' }}>
                            {sub.proctorLogs.map((log, idx) => (
                              <li key={idx}>{log}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.85rem', color: 'var(--success)', marginBottom: '20px' }}>
                          🟢 Proctoring: No windows focus loss or tab switches detected during active exam.
                        </div>
                      )}

                      {/* AI Overall Feedback */}
                      <div className={styles.feedbackBox} style={{ marginBottom: '20px' }}>
                        <div className={styles.feedbackTitle}>Mesh AI Grading Feedback Summary:</div>
                        <p style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>"{sub.feedback}"</p>
                      </div>

                      {/* Question Breakdown */}
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px' }}>Detailed Student Submissions:</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {sub.questionEvaluations.map((evalItem, idx) => {
                          const questionObj = examForGradebook?.questions.find(q => q.id === evalItem.questionId);
                          return (
                            <div key={idx} style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Question {idx + 1} ({questionObj?.type.toUpperCase()})</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: evalItem.isCorrect ? 'var(--success)' : 'var(--warning)' }}>
                                  Points: {evalItem.score} / {evalItem.maxPoints}
                                </span>
                              </div>
                              <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>{questionObj?.questionText}</p>
                              <div style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', borderLeft: '3px solid var(--primary)', marginBottom: '8px' }}>
                                <strong>Student Answer:</strong> {sub.answers[evalItem.questionId] || '(No Answer)'}
                              </div>
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}><strong>AI Feedback:</strong> {evalItem.feedback}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* PRINT COMPONENT ENVELOPE (HIDDEN ON SCREEN) */}
            {exams.map(printExam => (
              <div key={`print-${printExam.id}`} className="print-only" style={{ display: 'none' }}>
                <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '16px', marginBottom: '32px' }}>
                  <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{printExam.examTitle}</h1>
                  <p style={{ fontSize: '1.2rem', margin: '8px 0' }}>Course Subject: {printExam.subject}</p>
                  <p style={{ fontSize: '1.1rem' }}>Duration Allowed: {printExam.durationMinutes} Minutes | Max Points: {printExam.questions.reduce((a, b) => a + b.points, 0)}</p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <p style={{ margin: '8px 0' }}><strong>Student Name:</strong> ____________________________________</p>
                  <p style={{ margin: '8px 0' }}><strong>Student ID / Roll Number:</strong> __________________________</p>
                  <p style={{ margin: '8px 0' }}><strong>Date Conducted:</strong> __________________________________</p>
                </div>

                <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid black' }} />

                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '20px' }}>EXAMINATION QUESTIONS</h2>

                {printExam.questions.map((q, idx) => (
                  <div key={q.id} style={{ marginBottom: '24px', pageBreakInside: 'avoid' }}>
                    <p style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '8px' }}>
                      Question {idx + 1} ({q.difficulty.toUpperCase()} - {q.points} Points)
                    </p>
                    <p style={{ fontSize: '1.1rem', marginBottom: '12px' }}>{q.questionText}</p>

                    {q.type === 'mcq' && q.options && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingLeft: '16px' }}>
                        {q.options.map((opt, i) => (
                          <div key={i} style={{ fontSize: '1.05rem' }}>[  ] {opt}</div>
                        ))}
                      </div>
                    )}

                    {q.type === 'short' && (
                      <div style={{ borderBottom: '1px dotted black', height: '100px', marginTop: '12px' }}></div>
                    )}

                    {q.type === 'long' && (
                      <div style={{ borderBottom: '1px dotted black', height: '240px', marginTop: '12px' }}></div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {/* =============================================================== */}
        {/* STUDENT CENTER TAB */}
        {/* =============================================================== */}
        {activeTab === 'student' && (
          <>
            <div>
              <h1 className={styles.headerTitle}>Student Examination Center</h1>
              <p className={styles.headerSubtitle}>Complete your scheduled examinations, get instant grading, and review conceptual feedback.</p>
            </div>

            {/* Logged Out View */}
            {!isLoggedStudent && (
              <div className={styles.lockScreen}>
                <div className={styles.lockIcon}>🔐</div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Verify Student Credentials</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Please enter your details to view unlocked exam sheets.
                </p>

                <form onSubmit={handleStudentLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Full Name (e.g. Fahim Khan)"
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Student ID / Roll No (e.g. STU-990)"
                    value={studentId}
                    onChange={e => setStudentId(e.target.value)}
                    required
                  />
                  <button type="submit" className={styles.button} style={{ width: '100%' }}>
                    Unlock My Exams Table
                  </button>
                </form>
              </div>
            )}

            {/* Logged In View */}
            {isLoggedStudent && !examStarted && !latestSubmissionResult && (
              <div className={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Assigned Examinations</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Unlocked sheets are clickable. Future scheduled papers remain locked.</p>
                  </div>
                  <button 
                    className={`${styles.button} ${styles.buttonSecondary}`} 
                    style={{ padding: '8px 14px' }}
                    onClick={() => {
                      setIsLoggedStudent(false);
                      setStudentName('');
                      setStudentId('');
                    }}
                  >
                    Logout ({studentName})
                  </button>
                </div>

                <div className={styles.examList}>
                  {exams.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No exams currently configured by your instructor.</p>
                  ) : (
                    exams.map(exam => {
                      const unlocked = isExamUnlocked(exam);
                      const mySubmissions = submissions.filter(s => s.examId === exam.id && s.studentId === studentId);
                      const hasTaken = mySubmissions.length > 0;

                      return (
                        <div key={exam.id} className={styles.examListItem}>
                          <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{exam.examTitle}</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                              Course: <strong>{exam.subject}</strong> | Questions: {exam.questions?.length} | Duration: {exam.durationMinutes} min
                            </p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                              Schedule window: {formatDate(exam.unlockTime)}
                            </p>
                          </div>
                          <div>
                            {hasTaken ? (
                              <button
                                className={`${styles.button} ${styles.buttonSecondary}`}
                                onClick={() => setLatestSubmissionResult(mySubmissions[0])}
                              >
                                View Graded Results ({mySubmissions[0].score}/{mySubmissions[0].maxScore})
                              </button>
                            ) : unlocked ? (
                              <button
                                className={styles.button}
                                onClick={() => startExam(exam)}
                              >
                                Start Examination ✍️
                              </button>
                            ) : (
                              <button
                                className={`${styles.button} ${styles.buttonSecondary}`}
                                disabled
                                style={{ opacity: 0.6, cursor: 'not-allowed', color: 'var(--warning)', borderColor: 'rgba(245, 158, 11, 0.3)' }}
                              >
                                Locked (Unlocks in: {getCountdownString(exam.unlockTime)})
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Active Exam Session View */}
            {isLoggedStudent && examStarted && activeExam && (
              <div className={styles.examContainer}>
                {/* Meta details & Navigation */}
                <div className={styles.examMetaBox}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{activeExam.examTitle}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{activeExam.subject}</p>
                  </div>

                  <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>Time Remaining</div>
                    <div className={styles.timer}>
                      {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>Question Navigator</div>
                    <div className={styles.questionNav}>
                      {activeExam.questions.map((q, idx) => {
                        const isAnswered = studentAnswers[q.id] !== undefined && studentAnswers[q.id] !== '';
                        const isActive = currentQuestionIndex === idx;

                        return (
                          <div
                            key={q.id}
                            className={`${styles.navNum} ${isActive ? styles.navNumActive : ''} ${isAnswered && !isActive ? styles.navNumAnswered : ''}`}
                            onClick={() => setCurrentQuestionIndex(idx)}
                          >
                            {idx + 1}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
                    <button
                      className={styles.button}
                      style={{ width: '100%', background: 'linear-gradient(135deg, var(--secondary) 0%, #0891b2 100%)' }}
                      onClick={() => {
                        if (confirm('Are you sure you want to finish the exam? This will lock in your submissions and initiate auto-grading.')) {
                          triggerAutoSubmit(activeExam.id);
                        }
                      }}
                    >
                      Finish and Submit
                    </button>
                  </div>
                </div>

                {/* Active Question Box */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className={styles.questionCard}>
                    <div className={styles.questionHeader}>
                      <span className={`${styles.badge} ${styles.badgeInfo}`}>
                        Question {currentQuestionIndex + 1} of {activeExam.questions.length}
                      </span>
                      <span className={styles.pointsText}>
                        {activeExam.questions[currentQuestionIndex].points} Points ({activeExam.questions[currentQuestionIndex].difficulty.toUpperCase()})
                      </span>
                    </div>

                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                      {activeExam.questions[currentQuestionIndex].questionText}
                    </h2>

                    {/* Question Input rendering based on Type */}
                    {activeExam.questions[currentQuestionIndex].type === 'mcq' && (
                      <div className={styles.optionsList}>
                        {activeExam.questions[currentQuestionIndex].options?.map((opt, i) => {
                          const optionLetter = opt.trim().charAt(0); // e.g. "A"
                          const isSelected = studentAnswers[activeExam.questions[currentQuestionIndex].id] === optionLetter;

                          return (
                            <div
                              key={i}
                              className={`${styles.optionItem} ${isSelected ? styles.optionItemActive : ''}`}
                              onClick={() => handleSelectOption(activeExam.questions[currentQuestionIndex].id, optionLetter)}
                            >
                              <div className={styles.optionDot} />
                              <span>{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {activeExam.questions[currentQuestionIndex].type !== 'mcq' && (
                      <div className={styles.formGroup}>
                        <label className={styles.label}>Write Your Response</label>
                        <textarea
                          className={styles.textarea}
                          placeholder={activeExam.questions[currentQuestionIndex].type === 'short' ? 'Provide a concise short answer response (1-3 sentences)...' : 'Write a comprehensive essay response addressing all prompts...'}
                          value={studentAnswers[activeExam.questions[currentQuestionIndex].id] || ''}
                          onChange={e => handleSubjectiveInput(activeExam.questions[currentQuestionIndex].id, e.target.value)}
                          style={{ minHeight: activeExam.questions[currentQuestionIndex].type === 'short' ? '120px' : '300px' }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Previous / Next buttons */}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button
                      className={`${styles.button} ${styles.buttonSecondary}`}
                      disabled={currentQuestionIndex === 0}
                      onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                    >
                      ← Previous Question
                    </button>
                    <button
                      className={`${styles.button} ${styles.buttonSecondary}`}
                      disabled={currentQuestionIndex === activeExam.questions.length - 1}
                      onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                    >
                      Next Question →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Student Exam Result View */}
            {isLoggedStudent && latestSubmissionResult && (
              <div className={styles.card} style={{ animation: 'fadeIn 0.4s ease' }}>
                <div className={styles.gradeHeader}>
                  <button
                    className={`${styles.button} ${styles.buttonSecondary}`}
                    style={{ padding: '8px 12px', fontSize: '0.75rem', marginBottom: '16px' }}
                    onClick={() => {
                      setLatestSubmissionResult(null);
                      fetchSubmissions();
                    }}
                  >
                    ← Back to Dashboard
                  </button>
                  <h2>Exam Results & Feedback</h2>
                  <p style={{ color: 'var(--text-muted)' }}>Subject: {latestSubmissionResult.subject} | Student: {latestSubmissionResult.studentName} ({latestSubmissionResult.studentId})</p>
                  
                  <div className={styles.scoreBanner}>
                    {latestSubmissionResult.score} / {latestSubmissionResult.maxScore}
                  </div>
                  <span className={`${styles.badge} ${styles.badgeSuccess}`}>Grading Verified</span>
                </div>

                <div className={styles.feedbackBox} style={{ margin: '24px 0' }}>
                  <div className={styles.feedbackTitle}>AI Evaluator Executive Summary</div>
                  <p style={{ fontStyle: 'italic', fontSize: '0.95rem' }}>"{latestSubmissionResult.feedback}"</p>
                </div>

                {latestSubmissionResult.proctorLogs.length > 0 && (
                  <div className={styles.proctorWarning} style={{ marginBottom: '24px' }}>
                    <strong>⚠️ Proctor Flag Details:</strong> Our system detected {latestSubmissionResult.proctorLogs.length} window/tab changes. Your instructor has been notified to check compliance.
                  </div>
                )}

                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '24px 0 16px 0' }}>Question Breakdown</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {latestSubmissionResult.questionEvaluations.map((evalItem, idx) => {
                    // Pull questions from exams state
                    const targetExam = exams.find(e => e.id === latestSubmissionResult.examId);
                    const qObj = targetExam?.questions.find(q => q.id === evalItem.questionId);

                    return (
                      <div key={idx} style={{ padding: '20px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--card-border)', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <span style={{ fontWeight: 600 }}>Question {idx + 1} ({qObj?.type.toUpperCase()})</span>
                          <span style={{ fontWeight: 700, color: evalItem.isCorrect ? 'var(--success)' : 'var(--warning)' }}>
                            {evalItem.score} / {evalItem.maxPoints} Points
                          </span>
                        </div>
                        <p style={{ fontSize: '0.95rem', marginBottom: '16px' }}>{qObj?.questionText}</p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--accent)' }}>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Your Response</div>
                            <div style={{ fontSize: '0.875rem' }}>{latestSubmissionResult.answers[evalItem.questionId] || '(Blank)'}</div>
                          </div>
                          
                          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--success)' }}>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>AI Reference Answer</div>
                            <div style={{ fontSize: '0.875rem' }}>
                              {targetExam?.answerKey.find(ak => ak.questionId === evalItem.questionId)?.correctAnswer}
                            </div>
                          </div>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: '#a78bfa' }}><strong>AI Feedback:</strong> {evalItem.feedback}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* =============================================================== */}
        {/* MESH API INSPECTOR TAB */}
        {/* =============================================================== */}
        {activeTab === 'inspector' && (
          <>
            <div>
              <h1 className={styles.headerTitle}>⚡ Mesh API Console</h1>
              <p className={styles.headerSubtitle}>Real-time logs of unified API calls routing through Mesh LLM Gateway.</p>
            </div>

            <div className={styles.statGrid}>
              <div className={styles.card}>
                <span className={styles.statLabel}>Total Mesh Requests</span>
                <div className={styles.statValue}>{logs.length}</div>
                <div className={styles.statChange}><span className={styles.statUp}>▲ 100% active routing</span></div>
              </div>
              <div className={styles.card}>
                <span className={styles.statLabel}>Gateway Cost Saved</span>
                <div className={styles.statValue}>
                  ${logs.reduce((sum, log) => sum + log.cost, 0).toFixed(4)}
                </div>
                <div className={styles.statChange} style={{ color: 'var(--secondary)' }}>Using mesh direct tier</div>
              </div>
              <div className={styles.card}>
                <span className={styles.statLabel}>Avg Gateway Latency</span>
                <div className={styles.statValue}>
                  {logs.length > 0 ? (logs.reduce((sum, log) => sum + log.durationMs, 0) / logs.length).toFixed(0) : 0}ms
                </div>
                <div className={styles.statChange} style={{ color: 'var(--secondary)' }}>Unified router endpoint</div>
              </div>
            </div>

            <div className={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Active Audit logs</h2>
                <button className={`${styles.button} ${styles.buttonSecondary}`} style={{ padding: '8px 12px', fontSize: '0.75rem' }} onClick={fetchLogs}>
                  🔄 Refresh Console
                </button>
              </div>

              {logs.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>No logs recorded yet. Try generating an exam or submitting student answers.</p>
              ) : (
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Action / Prompt Context</th>
                        <th>Model Used</th>
                        <th>Tokens</th>
                        <th>Latency</th>
                        <th>Cost</th>
                        <th>Inspector</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(log => (
                        <tr key={log.id}>
                          <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                          <td>
                            <strong>{log.action}</strong>
                          </td>
                          <td>
                            <code style={{ color: 'var(--secondary)', fontSize: '0.8rem' }}>{log.model}</code>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.8rem' }}>in: {log.promptTokens} | out: {log.completionTokens}</span>
                          </td>
                          <td>{log.durationMs}ms</td>
                          <td style={{ color: 'var(--success)', fontWeight: 600 }}>
                            ${log.cost.toFixed(5)}
                          </td>
                          <td>
                            <button
                              className={`${styles.button} ${styles.buttonSecondary}`}
                              style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                              onClick={() => setSelectedLog(log)}
                            >
                              🔍 Inspect JSON
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* JSON Audit Modal Inspector */}
      {selectedLog && (
        <div className={styles.modalOverlay} onClick={() => setSelectedLog(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <button className={styles.closeButton} onClick={() => setSelectedLog(null)}>×</button>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '20px' }}>⚡ Mesh API Call Details</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div className={styles.card} style={{ padding: '16px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Provider Model</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--secondary)', marginTop: '4px' }}>{selectedLog.model}</div>
              </div>
              <div className={styles.card} style={{ padding: '16px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Latency Performance</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'white', marginTop: '4px' }}>{selectedLog.durationMs}ms</div>
              </div>
              <div className={styles.card} style={{ padding: '16px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>API Transaction Cost</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--success)', marginTop: '4px' }}>${selectedLog.cost.toFixed(5)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>POST Payload (Unified Schema)</h4>
                <pre className={styles.logPayload}>{JSON.stringify(selectedLog.requestPayload, null, 2)}</pre>
              </div>
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>Response Gateway Output</h4>
                <pre className={styles.logPayload}>{JSON.stringify(selectedLog.responsePayload, null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Proctor Warnings Toast Overlay */}
      {showProctorModal && (
        <div 
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            background: '#ef4444',
            color: 'white',
            borderRadius: '12px',
            padding: '20px',
            maxWidth: '400px',
            zIndex: 99999,
            boxShadow: '0 10px 25px rgba(239, 68, 68, 0.4)',
            animation: 'fadeIn 0.3s ease'
          }}
        >
          <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span>⚠️ Proctor Compliance Warning</span>
          </div>
          <p style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>{proctorWarningMsg}</p>
        </div>
      )}
    </div>
  );
}
