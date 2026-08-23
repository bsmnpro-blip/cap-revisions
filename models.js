/* Data shapes and input validation. Scores are always stored with their original maxScore. */
window.Revisions = window.Revisions || {};

(() => {
  const R = window.Revisions;
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = (prefix) => `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  const text = (value) => String(value ?? '').trim();

  R.createSubject = (values) => ({
    id: values.id || uid('sub'), name: text(values.name), color: values.color || '#4d72d8',
    semester: text(values.semester), createdAt: values.createdAt || new Date().toISOString()
  });
  R.createCourse = (values) => ({
    id: values.id || uid('course'), subjectId: values.subjectId, name: text(values.name),
    description: text(values.description), targetScore: values.targetScore === '' || values.targetScore == null ? null : Number(values.targetScore),
    createdAt: values.createdAt || new Date().toISOString()
  });
  R.createSession = (values) => ({
    id: values.id || uid('session'), courseId: values.courseId, date: values.date || today(),
    score: Number(values.score), maxScore: Number(values.maxScore || 20), sessionType: values.sessionType || 'QCM',
    questionCount: values.questionCount === '' || values.questionCount == null ? null : Number(values.questionCount),
    durationMinutes: values.durationMinutes === '' || values.durationMinutes == null ? null : Number(values.durationMinutes),
    comment: text(values.comment), createdAt: values.createdAt || new Date().toISOString()
  });

  R.validateSubject = (subject) => subject.name ? '' : 'Indiquez le nom de la matière.';
  R.validateCourse = (course, subjects) => {
    if (!course.subjectId || !subjects.some((subject) => subject.id === course.subjectId)) return 'Choisissez une matière existante.';
    if (!course.name) return 'Indiquez le nom du cours.';
    if (course.targetScore != null && (!Number.isFinite(course.targetScore) || course.targetScore < 0 || course.targetScore > 20)) return "L'objectif doit être compris entre 0 et 20.";
    return '';
  };
  R.validateSession = (session, courses) => {
    if (!session.courseId || !courses.some((course) => course.id === session.courseId)) return 'Choisissez un cours existant.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session.date) || Number.isNaN(new Date(`${session.date}T12:00:00`).getTime())) return 'Indiquez une date valide.';
    if (!Number.isFinite(session.score) || !Number.isFinite(session.maxScore) || session.maxScore <= 0) return 'La note et son barème doivent être des nombres valides.';
    if (session.score < 0 || session.score > session.maxScore) return 'La note doit être comprise entre 0 et son barème.';
    if (session.questionCount != null && (!Number.isInteger(session.questionCount) || session.questionCount < 0)) return 'Le nombre de questions doit être un entier positif.';
    if (session.durationMinutes != null && (!Number.isFinite(session.durationMinutes) || session.durationMinutes < 0)) return 'La durée doit être positive.';
    return '';
  };
  R.today = today;
})();
