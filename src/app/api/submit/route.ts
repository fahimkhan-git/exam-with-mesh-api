import { NextRequest, NextResponse } from 'next/server';
import { getExam, saveSubmission, Submission } from '@/lib/db';
import { callMeshApi } from '@/lib/mesh';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { examId, studentName, studentId, answers, proctorLogs = [] } = body;

    if (!examId || !studentName || !studentId || !answers) {
      return NextResponse.json(
        { error: 'Missing submission parameters: examId, studentName, studentId, or answers' },
        { status: 400 }
      );
    }

    const exam = getExam(examId);
    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
    }

    // Prepare prompt to evaluate student answers
    const evaluationQuestionsData = exam.questions.map(q => {
      const answerKeyItem = exam.answerKey.find(ak => ak.questionId === q.id);
      const studentAnswer = answers[q.id] || '(No Answer)';
      return {
        id: q.id,
        type: q.type,
        questionText: q.questionText,
        points: q.points,
        difficulty: q.difficulty,
        correctAnswer: answerKeyItem?.correctAnswer || '',
        gradingCriteria: answerKeyItem?.gradingCriteria || '',
        studentAnswer
      };
    });

    const systemPrompt = `You are a strict, objective, and constructive academic grader. 
Your task is to grade a student's answers against the official answer keys and rubrics. 
Provide scores based on accuracy and compliance with grading rubrics.
Return ONLY a valid, parseable JSON object with no explanations, no markdown blocks.`;

    const userPrompt = `Grade the student's submission for exam "${exam.examTitle}" (${exam.subject}).

Grading Guidelines:
1. For MCQ: If the student's answer letter matches the correct answer letter (case-insensitive, e.g. "A" matches "A) ..."), award full points. Otherwise, award 0.
2. For Short & Long Answer: Compare the student's response to the Correct Answer. Use the Grading Criteria checklist. Award partial points (between 0 and the max question points) based on how many core ideas/facts the student addressed. 
3. Provide a brief 1-2 sentence constructive feedback for each question explaining the score.
4. Provide a general overall feedback summary for the entire exam.

Student Information:
- Name: ${studentName}
- ID: ${studentId}

Questions & Responses:
${JSON.stringify(evaluationQuestionsData, null, 2)}

Return ONLY a JSON object structured exactly like this:
{
  "totalScore": 14,
  "overallFeedback": "Great job. You showed strong understanding of X but need to work on Z...",
  "evaluations": [
    {
      "questionId": "q_1",
      "score": 2, // numerical score awarded
      "isCorrect": true, // true if student received full marks, false otherwise
      "feedback": "Correct." // brief note detailing grading logic
    }
  ]
}`;

    // Call Mesh API to perform grading using a smart model (gpt-4o-mini is efficient and highly capable at structured grading)
    const gradingModel = 'openai/gpt-4o-mini';
    const responseText = await callMeshApi(
      gradingModel,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      `Grade Submission: ${studentName} - ${exam.examTitle}`,
      { response_format: { type: 'json_object' } }
    );

    // Clean JSON response
    let cleanJsonStr = responseText.trim();
    if (cleanJsonStr.startsWith('```')) {
      cleanJsonStr = cleanJsonStr.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
    }

    let gradeData;
    try {
      gradeData = JSON.parse(cleanJsonStr);
    } catch (parseErr) {
      console.error('Failed to parse AI grading response:', cleanJsonStr);
      throw new Error('AI grading failed to return valid JSON. Please try resubmitting.');
    }

    // Calculate max points
    const maxScore = exam.questions.reduce((sum, q) => sum + q.points, 0);

    // Map evaluations to submission format
    const questionEvaluations = exam.questions.map(q => {
      const evaluation = gradeData.evaluations?.find((e: any) => e.questionId === q.id) || {
        score: 0,
        isCorrect: false,
        feedback: 'No grade generated.'
      };

      return {
        questionId: q.id,
        score: Number(evaluation.score),
        maxPoints: q.points,
        isCorrect: Boolean(evaluation.isCorrect),
        feedback: String(evaluation.feedback)
      };
    });

    // Re-sum score from evaluations to ensure consistency
    const totalScore = questionEvaluations.reduce((sum, e) => sum + e.score, 0);

    const submission: Submission = {
      id: 'sub_' + Math.random().toString(36).substr(2, 9),
      examId,
      examTitle: exam.examTitle,
      subject: exam.subject,
      studentName,
      studentId,
      answers,
      score: totalScore,
      maxScore,
      gradedAt: new Date().toISOString(),
      proctorLogs,
      feedback: gradeData.overallFeedback || 'Evaluation complete.',
      questionEvaluations
    };

    saveSubmission(submission);

    return NextResponse.json(submission);
  } catch (error: any) {
    console.error('Grading submission error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
