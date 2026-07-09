import { NextRequest, NextResponse } from 'next/server';
import { getExams, saveExam, deleteExam, Exam } from '@/lib/db';
import { callMeshApi } from '@/lib/mesh';

export async function GET() {
  try {
    const exams = getExams();
    return NextResponse.json(exams);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing exam ID' }, { status: 400 });
    }
    deleteExam(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      subject,
      examTitle,
      durationMinutes,
      unlockTime,
      model,
      notesText,
      mcqCount = 0,
      shortCount = 0,
      longCount = 0,
      easyCount = 0,
      mediumCount = 0,
      hardCount = 0
    } = body;

    // Validate parameters
    if (!subject || !examTitle || !durationMinutes || !unlockTime || !model) {
      return NextResponse.json(
        { error: 'Missing required configuration fields' },
        { status: 400 }
      );
    }

    const totalQuestions = mcqCount + shortCount + longCount;
    if (totalQuestions <= 0) {
      return NextResponse.json(
        { error: 'Exam must contain at least 1 question' },
        { status: 400 }
      );
    }

    // Prepare generation instruction prompt
    const systemPrompt = `You are an expert curriculum developer, university professor, and academic examiner. 
Your task is to generate a high-quality, balanced academic exam paper based strictly on the uploaded syllabus, notes, or reference material. 
You must respond with ONLY a valid, parseable JSON object. No explanations, no markdown blocks around the JSON, just raw JSON.`;

    const userPrompt = `Generate an exam based on this learning material:
---
${notesText || 'General knowledge and critical thinking.'}
---

Exam Metadata:
- Subject: ${subject}
- Exam Title: ${examTitle}
- Total Questions: ${totalQuestions}

Question Types Requested:
- MCQ (Multiple Choice): ${mcqCount} questions
- Short Answer: ${shortCount} questions
- Long Answer/Essay: ${longCount} questions

Difficulty Distribution Requested:
- Easy: ${easyCount} questions
- Medium: ${mediumCount} questions
- Hard: ${hardCount} questions

Instructions:
1. Distribute points/marks as follows: Easy questions should be 1-2 points; Medium should be 3-5 points; Hard should be 6-10 points.
2. For MCQs: Include exactly 4 options. Prefix each option with "A) ", "B) ", "C) ", "D) ". The "correctAnswer" in the answer key must be the correct option letter ("A", "B", "C", or "D").
3. For Short & Long Answer: The "correctAnswer" in the answer key must be a model answer representing a 100% score response. You MUST also provide "gradingCriteria", which is a bulleted list of 3-5 specific facts, ideas, or calculations the student's answer must include to receive full credit.
4. Avoid duplicate questions. Ensure they test depth of understanding.

Return ONLY a JSON object structured exactly like this:
{
  "questions": [
    {
      "id": "q_1",
      "type": "mcq", // "mcq" | "short" | "long"
      "questionText": "What is ...?",
      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"], // only if type is "mcq"
      "points": 2,
      "difficulty": "easy" // "easy" | "medium" | "hard"
    }
  ],
  "answerKey": [
    {
      "questionId": "q_1",
      "correctAnswer": "A", // Correct option letter for MCQ, or ideal model response for subjective
      "gradingCriteria": "Checklist items: 1. ... 2. ..." // Checklist for scoring subjective, omit for MCQ
    }
  ]
}`;

    // Call Mesh API
    const responseText = await callMeshApi(
      model,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      `Generate Exam: ${examTitle}`,
      { response_format: { type: 'json_object' } }
    );

    // Clean JSON response
    let cleanJsonStr = responseText.trim();
    if (cleanJsonStr.startsWith('```')) {
      // Remove code block backticks
      cleanJsonStr = cleanJsonStr.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
    }

    let examData;
    try {
      examData = JSON.parse(cleanJsonStr);
    } catch (parseErr) {
      console.error('Failed to parse AI exam response:', cleanJsonStr);
      throw new Error('AI returned invalid JSON. Please try again or select a stronger model.');
    }

    if (!examData.questions || !Array.isArray(examData.questions)) {
      throw new Error('Invalid exam structure: missing questions array');
    }

    // Assemble final exam model
    const newExam: Exam = {
      id: 'exam_' + Math.random().toString(36).substr(2, 9),
      subject,
      examTitle,
      durationMinutes: Number(durationMinutes),
      unlockTime: new Date(unlockTime).toISOString(),
      status: 'generated',
      questions: examData.questions,
      answerKey: examData.answerKey || [],
      createdAt: new Date().toISOString()
    };

    saveExam(newExam);

    return NextResponse.json(newExam);
  } catch (error: any) {
    console.error('Exam generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
